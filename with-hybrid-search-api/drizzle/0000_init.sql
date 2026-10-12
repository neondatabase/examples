CREATE EXTENSION IF NOT EXISTS lakebase_vector CASCADE;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS lakebase_text;
--> statement-breakpoint
CREATE TABLE "search_documents" (
  "id" text PRIMARY KEY NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_chunks" (
  "id" serial PRIMARY KEY NOT NULL,
  "document_id" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "heading" text DEFAULT '' NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "search_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "heading" || ' ' || "content")) STORED
);
--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_document_id_search_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."search_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "search_documents_metadata_gin" ON "search_documents" USING gin ("metadata" jsonb_path_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX "search_chunks_document_position" ON "search_chunks" USING btree ("document_id", "chunk_index");
--> statement-breakpoint
CREATE INDEX "search_chunks_embedding_ann" ON "search_chunks" USING lakebase_ann ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX "search_chunks_text_bm25" ON "search_chunks" USING lakebase_bm25 ("search_tsv");
