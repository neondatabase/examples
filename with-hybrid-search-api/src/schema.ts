import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const documents = pgTable(
  "search_documents",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("search_documents_metadata_gin").using(
      "gin",
      table.metadata.op("jsonb_path_ops"),
    ),
  ],
);

export const chunks = pgTable(
  "search_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    heading: text("heading").notNull().default(""),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', "heading" || ' ' || "content")`,
    ),
  },
  (table) => [
    uniqueIndex("search_chunks_document_position").on(
      table.documentId,
      table.chunkIndex,
    ),
    index("search_chunks_embedding_ann").using(
      "lakebase_ann",
      table.embedding.op("vector_cosine_ops"),
    ),
    index("search_chunks_text_bm25").using("lakebase_bm25", table.searchTsv),
  ],
);
