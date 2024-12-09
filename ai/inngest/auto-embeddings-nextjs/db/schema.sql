-- Enable the pgvector extension to work with embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the documents table
CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(512),  -- text-embedding-3-small dimensions
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create a function to notify on document insert
CREATE OR REPLACE FUNCTION notify_document_inserted()
  RETURNS trigger AS
$$
BEGIN
  PERFORM pg_notify(
    'document_inserted',
    json_build_object(
      'id', NEW.id,
      'title', NEW.title,
      'content', NEW.content
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the notification function
DROP TRIGGER IF EXISTS document_inserted_trigger ON documents;
CREATE TRIGGER document_inserted_trigger
  AFTER INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION notify_document_inserted(); 