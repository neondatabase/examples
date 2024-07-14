<img width="250px" src="https://raw.githubusercontent.com/neondatabase/website/a898a3ff9c2786a3fd4691d083eb8f3c751e008b/src/images/logo-white.svg" />

## Chat with PDF (OpenAI + LangChain)

A starter application for an AI-powered Chat with PDF with Next.js, Neon Postgres (pgvector), OpenAI, and LangChain.

- It allows users to upload PDF documents, which are then split into chunks, embedded using the OpenAI text embedding API, and stored in a Neon database.
- Users can then ask questions about the uploaded document. It uses similarity search to retrieve relevant document chunks from the database and generates contextually appropriate responses using the OpenAI chat API. 

[![](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/neondatabase/examples/tree/main/ai/langchain/chat-with-pdf-nextjs&env=POSTGRES_URL,OPENAI_API_KEY)

## Prerequisites

To follow along with this guide, you will need:

- A Neon account. If you do not have one, sign up at [Neon](https://neon.tech). Your Neon project comes with a ready-to-use Postgres database named `neondb`. We'll use this database in the following examples.
- An OpenAI API key. If you do not have an OpenAI account, [sign up](https://platform.openai.com/signup) and navigate to the [API keys](https://platform.openai.com/api-keys) page to create an API key.
- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your machine. 

## Clone the repository

```bash
npx degit neondatabase/examples/ai/langchain/chat-with-pdf-nextjs ./chat-with-pdf-nextjs
```

## How to use

1. Create a `.env` file:

```bash
cp .env.example .env
```

2. Update the environment variables with your OpenAI API Key and Neon Postgres URL.

3. Install the dependencies:

```bash
npm install
```

4. Run the application:

```bash
npm run dev
```

## Learn more

- [Neon AI documentation](https://neon.tech/docs/ai/ai-intro)
- [pgvector documentation](https://github.com/pgvector/pgvector)
- [OpenAI documentation](https://platform.openai.com/docs/introduction)
- [Llama Index documentation](https://llama.meta.com/docs/get-started/)
- [Next.js documentation](https://nextjs.org/docs)

## Authors

- Rishi Raj Jain ([@rishi_raj_jain_](https://twitter.com/rishi_raj_jain_))
