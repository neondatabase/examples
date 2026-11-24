// Import graphql-yoga before hono. In the other order, the deployed function rejects Yoga's responses.
import { createSchema, createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import config from '../neon';
import { todos, type Todo } from './db/schema';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

// The schema has no Date scalar, so dates go out as ISO strings.
const toGraphql = (todo: Todo) => ({ ...todo, createdAt: todo.createdAt.toISOString() });

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
      todos: async () => {
        const rows = await db.select().from(todos);
        return rows.map(toGraphql);
      },
      todo: async (_: unknown, { id }: { id: number }) => {
        const [todo] = await db.select().from(todos).where(eq(todos.id, id));
        return todo ? toGraphql(todo) : null;
      },
    },
    Mutation: {
      createTodo: async (_: unknown, { text }: { text: string }) => {
        const [todo] = await db.insert(todos).values({ text }).returning();
        return toGraphql(todo);
      },
      deleteTodo: async (_: unknown, { id }: { id: number }) => {
        const [todo] = await db.delete(todos).where(eq(todos.id, id)).returning();
        return todo ? toGraphql(todo) : null;
      },
    },
  },
});

const yoga = createYoga({ schema, graphqlEndpoint: '/graphql' });

const app = new Hono();

app.get('/', (c) => c.text('Neon GraphQL API. Open /graphql in a browser for GraphiQL'));

app.on(['GET', 'POST'], '/graphql', (c) => yoga.fetch(c.req.raw));

export default app;
