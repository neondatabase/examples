import { sql } from "drizzle-orm";
import {
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const documents = pgTable(
  "search_documents",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', "content")`,
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("search_documents_embedding_ann").using(
      "lakebase_ann",
      table.embedding.op("vector_cosine_ops"),
    ),
    index("search_documents_text_bm25").using("lakebase_bm25", table.searchTsv),
    index("search_documents_metadata_gin").using(
      "gin",
      table.metadata.op("jsonb_path_ops"),
    ),
  ],
);
