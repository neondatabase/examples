import { sql } from 'drizzle-orm'
import { customType, index, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * The whole data model, in Drizzle. This is the single source of truth for the
 * schema: `npm run db:push` (drizzle-kit) creates these tables, and every query
 * in the app and the scripts is typed against them. There is deliberately **no**
 * RLS and no `authenticated` grants here, since the browser never touches Postgres
 * directly. Reads and writes go through server functions / API routes that verify
 * the Neon Auth JWT and scope every query to `owner_id = <the verified user>`.
 *
 * pgvector's `vector(n)` has no built-in Drizzle column, so we define one with
 * `customType`. `dimensions` is baked into the DDL (`vector(512)` / `vector(1024)`)
 * and values round-trip as the `'[a,b,c]'` literal pgvector expects (see
 * `toVector` in db.ts). Distance operators (`<=>`) aren't expressible in the query
 * builder, so ranking queries drop to a raw `sql` fragment via `db.execute`.
 */
const vector = (dimensions: number) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `vector(${dimensions})`,
  })

// One row per photo. `embedding` is a normalized 512-d CLIP vector. Text queries
// and images land in the same space, so one column serves both search shapes.
export const photos = pgTable(
  'photos',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id'), // the Neon Auth user id, set from the verified JWT on every write
    filename: text('filename').notNull(), // object key in the storage bucket
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    embedding: vector(512)('embedding').notNull(),
    caption: text('caption'), // for display
    keywords: text('keywords'), // space-joined, for the BM25 mode later
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // (owner_id, created_at desc) serves the newest-first library grid in one index:
  // it filters to the owner and returns rows already ordered for pagination, so no
  // per-page sort. The owner_id prefix also covers the plain `where owner_id = ?`
  // count. Mirrors people_recent_idx.
  (t) => [index('photos_recent_idx').on(t.ownerId, t.createdAt.desc())],
)

// Caches text-query vectors so a repeated search never re-runs the model.
export const queryEmbeddings = pgTable('query_embeddings', {
  query: text('query').primaryKey(),
  embedding: vector(512)('embedding').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// People (face clusters). Derived rows, rebuilt whenever the owner's faces change.
// `last_face_at` is the newest face in the cluster, and the UI orders circles by it so
// freshly photographed people come first.
export const people = pgTable(
  'people',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    label: text('label'), // optional name; UI falls back to "Person N"
    coverKey: text('cover_key'), // storage key of the representative face crop (the circle)
    faceCount: integer('face_count').notNull().default(0),
    lastFaceAt: timestamp('last_face_at', { withTimezone: true }), // max(faces.created_at) in this cluster
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // (owner_id, last_face_at desc) filters to the owner and returns the circles in
  // newest-first order for pagination, and its owner_id prefix covers the plain
  // `where owner_id = ?` count, so no separate owner-only index is needed.
  (t) => [index('people_recent_idx').on(t.ownerId, t.lastFaceAt.desc())],
)

// One row per detected face. `embedding` is a normalized 1024-d face descriptor;
// `bbox` and `crop_key` locate/show the face; `person_id` is its cluster.
export const faces = pgTable(
  'faces',
  {
    id: text('id').primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    bbox: jsonb('bbox').notNull(), // [x, y, width, height] in source pixels
    cropKey: text('crop_key').notNull(), // storage key of the cropped face jpeg
    score: real('score').notNull().default(0), // detector confidence, used to pick a cover
    embedding: vector(1024)('embedding').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('faces_owner_idx').on(t.ownerId), index('faces_photo_idx').on(t.photoId), index('faces_person_idx').on(t.personId)],
)

// Re-export the `sql` tag so schema consumers can build the raw vector fragments
// (`<=>` ranking, the lakebase_ann index) from one import.
export { sql }
