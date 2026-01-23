# RAG Starter with Next.js, Neon, and Inngest

Build a Retrieval-Augmented Generation (RAG) system using Next.js, OpenAI, Neon's vector database, and Inngest.

## Features

- Document upload
- Embedding generation workflow with Inngest
- Vector-based semantic search
- Chat interface with RAG context

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up environment:

   ```bash
   cp env.example .env.local
   # Edit .env.local with your credentials
   ```

3. Set up database:

   ```bash
   # Connect to your Neon database
   psql $DATABASE_URL -f db/schema.sql
   ```

4. Run the development server:

   ```bash
   npm run dev
   ```

5. Start the Inngest Dev Server:
   ```bash
   npx inngest-cli@latest dev
   ```

## Environment Variables

- `DATABASE_URL` (required): Neon database URL
- `OPENAI_API_KEY` (required): OpenAI API key
- `INNGEST_SIGNING_KEY` (optional): For production use
- `INNGEST_EVENT_KEY` (optional): For production use

## Learn more

- [Neon AI documentation](https://neon.com/docs/ai/ai-intro)
- [pgvector documentation](https://github.com/pgvector/pgvector)
- [OpenAI documentation](https://platform.openai.com/docs/introduction)
- [Inngest documentation](https://inngest.com/docs)
- [Next.js documentation](https://nextjs.org/docs)
