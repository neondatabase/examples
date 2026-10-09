CREATE TABLE "search_documents" (
  "id" text PRIMARY KEY NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "search_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "search_documents_embedding_ann" ON "search_documents" USING lakebase_ann ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX "search_documents_text_bm25" ON "search_documents" USING lakebase_bm25 ("search_tsv");
--> statement-breakpoint
CREATE INDEX "search_documents_metadata_gin" ON "search_documents" USING gin ("metadata" jsonb_path_ops);
