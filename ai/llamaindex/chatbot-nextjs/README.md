[![github-ai-chatbot-llamaindex](/assets/images/github-ai-chatbot-llamaindex.jpg)](https://console.neon.tech/signup)

## AI Chatbot (OpenAI + LlamaIndex)

A starter application for an AI-powered chatbot with Next.js, Neon Postgres (pgvector), OpenAI, and LlamaIndex. 

It implements a chat interface that takes the user's input, embeds it, and retrieves relevant information from the Neon database using similarity search. It then uses the OpenAI chat API to generate a contextually appropriate response based on the retrieved data and chat history.

[![](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/neondatabase/examples/tree/main/ai/llamaindex/chatbot-nextjs&env=POSTGRES_URL,OPENAI_API_KEY)

## Prerequisites

To follow along with this guide, you will need:

- A Neon account. If you do not have one, sign up at [Neon](https://neon.tech). Your Neon project comes with a ready-to-use Postgres database named `neondb`. We'll use this database in the following examples.
- An OpenAI API key. If you do not have an OpenAI account, [sign up](https://platform.openai.com/signup) and navigate to the [API keys](https://platform.openai.com/api-keys) page to create an API key.  
- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your machine. 

## Clone the repository

```bash
npx degit neondatabase/examples/ai/llamaindex/chatbot-nextjs ./chatbot-nextjs
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
