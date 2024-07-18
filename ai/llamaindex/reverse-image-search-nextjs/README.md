[![github-image-search-llamaindex](/assets/images/github-image-search-llamaindex.jpg)](https://console.neon.tech/signup)

## Reverse Image Search (OpenAI + LlamaIndex)

A starter application for AI-powered Reverse Image Search with Next.js, Neon Postgres (pgvector), OpenAI, and LlamaIndex.

- It allows users to uplaod images, which are embedded using the OpenAI CLIP-embedding API and stored in the Neon database along with the original image. 
- Users can then query the system using new images, which are also embedded using the OpenAI CLIP-embedding API. The embedding vector is used to retrieve visually similar images from the Neon database. 

[![](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/neondatabase/examples/tree/main/ai/llamaindex/reverse-image-search-nextjs&env=POSTGRES_URL,OPENAI_API_KEY)

## Prerequisites

To follow along with this guide, you will need:

- A Neon account. If you do not have one, sign up at [Neon](https://neon.tech). Your Neon project comes with a ready-to-use Postgres database named `neondb`. We'll use this database in the following examples.
- An OpenAI API key. If you do not have an OpenAI account, [sign up](https://platform.openai.com/signup) and navigate to the [API keys](https://platform.openai.com/api-keys) page to create an API key.  
- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your machine. 

## Clone the repository

```bash
npx degit neondatabase/examples/ai/llamaindex/reverse-image-search-nextjs ./reverse-image-search-nextjs
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
