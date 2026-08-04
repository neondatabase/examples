import { eq } from "drizzle-orm";
import { createSchema, createYoga } from "graphql-yoga";
import { Hono } from "hono";
import { getDb } from "./db/client.js";
import { todos, type NewTodo, type Todo } from "./db/schema.js";

const db = getDb();

/**
 * GraphQL Todo: same as the Drizzle row, except `createdAt` is serialized
 * to an ISO string (GraphQL has no native Date scalar in this schema).
 */
type TodoGql = Omit<Todo, "createdAt"> & { createdAt: string };
type RootParent = Record<string, never>;

type TodoByIdArgs = Pick<Todo, "id">;
type CreateTodoArgs = Pick<NewTodo, "text">;

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Todo {
      id: Int!
      text: String!
      createdAt: String!
    }

    type Query {
      todos: [Todo!]!
      todo(id: Int!): Todo
    }

    type Mutation {
      createTodo(text: String!): Todo!
      deleteTodo(id: Int!): Todo
    }
  `,
  resolvers: {
    Query: {
      todos: async (): Promise<TodoGql[]> => {
        const rows = await db.select().from(todos);
        return rows.map(formatTodo);
      },
      todo: async (
        _parent: RootParent,
        { id }: TodoByIdArgs,
      ): Promise<TodoGql | null> => {
        const [row] = await db.select().from(todos).where(eq(todos.id, id));
        return row ? formatTodo(row) : null;
      },
    },
    Mutation: {
      createTodo: async (
        _parent: RootParent,
        { text }: CreateTodoArgs,
      ): Promise<TodoGql> => {
        const [row] = await db.insert(todos).values({ text }).returning();
        return formatTodo(row);
      },
      deleteTodo: async (
        _parent: RootParent,
        { id }: TodoByIdArgs,
      ): Promise<TodoGql | null> => {
        const [row] = await db.delete(todos).where(eq(todos.id, id)).returning();
        return row ? formatTodo(row) : null;
      },
    },
  },
});

function formatTodo(row: Todo): TodoGql {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  graphiql: true,
});

const app = new Hono();

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "graphql",
    endpoints: {
      graphql: "GET|POST /graphql",
      graphiql: "GET /graphql (browser)",
    },
  }),
);

// Hand every /graphql request (GET GraphiQL + POST queries) to Yoga.
// Re-wrap the response to a native Response object so Hono can send it back to the client.
app.on(["GET", "POST"], "/graphql", async (c) => {
  const response = await yoga.fetch(c.req.raw);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers),
  });
});

export default app;
