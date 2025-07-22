<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
    <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

## AI Chatbot (AWS Bedrock)

A starter application for AI-powered chatbot with Next.js, Neon Postgres, and AWS Bedrock.

[![](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/neondatabase/examples/tree/main/ai/aws-bedrock/chatbot-nextjs&env=POSTGRES_URL,AWS_KEY_ID,AWS_SECRET_KEY)

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

- [Amazon Bedrock](https://docs.aws.amazon.com/pdfs/bedrock/latest/userguide/bedrock-ug.pdf#page=26&zoom=100,48,781)
- [Next.js documentation](https://nextjs.org/docs)

## Authors

- Rishi Raj Jain ([@rishi_raj_jain_](https://twitter.com/rishi_raj_jain_))
