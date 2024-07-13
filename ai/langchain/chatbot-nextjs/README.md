<img width="250px" src="https://raw.githubusercontent.com/neondatabase/website/a898a3ff9c2786a3fd4691d083eb8f3c751e008b/src/images/logo-white.svg" />

## AI Chatbot (OpenAI + LangChain)

A starter application for AI-powered chatbot with Next.js, Neon Postgres (pgvector), OpenAI, and LangChain.

[![](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/neondatabase/examples/tree/main/ai/langchain/chatbot-nextjs&env=POSTGRES_URL,OPENAI_API_KEY)

## Prerequisites

To follow along with this guide, you will need:

- A Neon account. If you do not have one, sign up at [Neon](https://neon.tech). Your Neon project comes with a ready-to-use Postgres database named `neondb`. We'll use this database in the following examples.
- An OpenAI API key. If you do not have an OpenAI account, [sign up](https://platform.openai.com/signup) for it and navigate to [this section](https://platform.openai.com/api-keys) to create an api key.  
- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your machine. 

## Clone the repository

```bash
npx degit neondatabase/examples/ai/langchain/chatbot-nextjs ./chatbot-nextjs
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
