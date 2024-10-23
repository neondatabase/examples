## LangChain ReAct Agent (with PostgreSQL)

This project demonstrates the implementation of a ReAct (Reasoning and Acting) agent using LangChain and OpenAI's GPT-4 model, with PostgreSQL-based checkpoints for conversation persistence.

## Overview

The main script (`index.py`) sets up a ReAct agent that can answer questions about the weather in specific cities. It uses LangChain's tools and agents, OpenAI's ChatGPT, and PostgreSQL for storing conversation state.

## Key Components

1. **Environment Setup**: 
   - Uses `dotenv` to load environment variables.
   - Requires a `DATABASE_URL` for PostgreSQL connection.

2. **OpenAI Model**: 
   - Utilizes `ChatOpenAI` with the GPT-4 model.

3. **Custom Tool**: 
   - `get_weather`: A simple tool to provide weather information for NYC and SF.

4. **PostgreSQL Integration**:
   - Uses `psycopg_pool.ConnectionPool` for database connections.
   - Implements `PostgresSaver` for checkpointing conversation state.

5. **ReAct Agent**:
   - Created using `create_react_agent` from LangGraph.
   - Configured with the custom weather tool.

6. **Conversation Flow**:
   - Demonstrates a two-turn conversation about weather in NYC.
   - Shows how the agent maintains context across turns using checkpointing.

## Prerequisites

To follow along with this guide, you will need:

- A Neon account. If you do not have one, sign up at [Neon](https://neon.tech). Your Neon project comes with a ready-to-use Postgres database named `neondb`. We'll use this database in the following examples.
- An OpenAI API key. If you do not have an OpenAI account, [sign up](https://platform.openai.com/signup) and navigate to the [API keys](https://platform.openai.com/api-keys) page to create an API key.

## Clone the repository

```bash
npx degit neondatabase/examples/ai/langchain/react-agent-python ./react-agent-python
```

Run the command below to copy the `.env.example` file:

```
cp .env.example .env
```

## Store your Neon credentials

Store your Neon credentials in your `.env` file.

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

- `user` is the database user.
- `password` is the database user’s password.
- `endpoint_hostname` is the host with neon.tech as the [TLD](https://www.cloudflare.com/en-gb/learning/dns/top-level-domain/).
- `dbname` is the name of the database. “neondb” is the default database created with each Neon project.
- `?sslmode=require` an optional query parameter that enforces the [SSL](https://www.cloudflare.com/en-gb/learning/ssl/what-is-ssl/) mode while connecting to the Postgres instance for better security.

**Important**: To ensure the security of your data, never expose your Neon credentials to the browser.

## How to use

1. Run one of the following commands to create a virtual environment:

```bash
# Create a virtual environment
python -m venv venv

# Active the virtual environment (Windows)
.\venv\Scripts\activate.bat

# Active the virtual environment (Linux)
source ./venv/bin/activate
```

2. Run the command below to install project dependencies:

```bash
pip install -r requirements.txt
```

3. Run the Python application using the following command:

```bash
python index.py
```

## Authors

- Rishi Raj Jain ([@rishi_raj_jain_](https://twitter.com/rishi_raj_jain_))
