import os
from typing import Literal
from dotenv import load_dotenv
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from psycopg_pool import ConnectionPool
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.postgres import PostgresSaver

load_dotenv()

DB_URI = os.environ.get("DATABASE_URL")

connection_kwargs = {
    "autocommit": True,
    "prepare_threshold": 0,
}

model = ChatOpenAI(model="gpt-4o", temperature=0)

def print_stream(stream):
    print('---'*9)
    for message in stream['messages']:
        if isinstance(message, tuple):
            print(message)
        else:
            message.pretty_print()
    print('---'*9)

@tool
def get_weather(city: Literal["nyc", "sf"]):
    """Use this to get weather information."""
    if city == "nyc":
        return "It might be cloudy in nyc"
    elif city == "sf":
        return "It's always sunny in sf"
    else:
        raise AssertionError("Unknown city")

tools = [get_weather]

with ConnectionPool(
    max_size=20,
    conninfo=DB_URI,
    kwargs=connection_kwargs,
) as pool:
    checkpointer = PostgresSaver(pool)
    checkpointer.setup()
    graph = create_react_agent(model, tools=tools, checkpointer=checkpointer)
    config = {"configurable": {"thread_id": "1"}}
    inputs = {"messages": [("user", "What's the weather in NYC?")]}
    res = graph.invoke(inputs, config)
    print_stream(res)
    checkpoint = checkpointer.get(config)
    inputs = {"messages": [("user", "What's it known for?")]}
    res = graph.invoke(inputs, config)
    print_stream(res)
    checkpoint = checkpointer.get(config)