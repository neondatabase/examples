import { integer, pgTable, text, unique } from "drizzle-orm/pg-core";

export const objects = pgTable(
  "objects",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
  },
  (t) => [unique("objects_bucket_object_key").on(t.bucket, t.objectKey)],
);
