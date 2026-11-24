import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, ilike, or } from 'drizzle-orm';
import { Pool } from 'pg';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import config from '../neon';
import { contacts } from './db/schema';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

// A new schema per field keeps each description in the tool schema; a shared one becomes a $ref.
const optionalText = (description: string) =>
  z.string().trim().min(1).optional().describe(description);

function asTextResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

// Stateless: every request gets its own server and transport.
function createServer() {
  const mcpServer = new McpServer({
    name: 'neon-contacts',
    version: '1.0.0',
  });

  mcpServer.registerTool(
    'create_contact',
    {
      title: 'Create contact',
      description: 'Create a new contact in the contact management database.',
      inputSchema: {
        name: z.string().trim().min(1).describe('Full name of the contact (required).'),
        email: optionalText('Email address.'),
        phone: optionalText('Phone number.'),
        company: optionalText('Company or organization.'),
        notes: optionalText('Free-form notes about the contact.'),
      },
    },
    async ({ name, email, phone, company, notes }) => {
      const [contact] = await db
        .insert(contacts)
        .values({ name, email, phone, company, notes })
        .returning();
      return asTextResult({ created: contact });
    },
  );

  mcpServer.registerTool(
    'update_contact',
    {
      title: 'Update contact',
      description: 'Update fields on an existing contact. Only provided fields are changed.',
      inputSchema: {
        id: z.number().int().positive().describe('ID of the contact to update.'),
        name: optionalText('New full name.'),
        email: optionalText('New email address.'),
        phone: optionalText('New phone number.'),
        company: optionalText('New company or organization.'),
        notes: optionalText('New free-form notes.'),
      },
    },
    async ({ id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(updates).length === 0) {
        return asTextResult({ error: 'Provide at least one field to update.' });
      }
      const [contact] = await db
        .update(contacts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(contacts.id, id))
        .returning();
      if (!contact) {
        return asTextResult({ error: `No contact found with id ${id}.` });
      }
      return asTextResult({ updated: contact });
    },
  );

  mcpServer.registerTool(
    'delete_contact',
    {
      title: 'Delete contact',
      description: 'Delete a contact by ID.',
      inputSchema: {
        id: z.number().int().positive().describe('ID of the contact to delete.'),
      },
    },
    async ({ id }) => {
      const [contact] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
      if (!contact) {
        return asTextResult({ error: `No contact found with id ${id}.` });
      }
      return asTextResult({ deleted: contact });
    },
  );

  mcpServer.registerTool(
    'search_contacts',
    {
      title: 'Search contacts',
      description:
        'Search contacts by name, email, company, or notes. Omit the query to list all contacts.',
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Case-insensitive substring to match; omit to list everyone.'),
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .default(20)
          .describe('Maximum number of contacts to return (default 20, max 100).'),
      },
    },
    async ({ query, limit }) => {
      const where = query
        ? or(
            ilike(contacts.name, `%${query}%`),
            ilike(contacts.email, `%${query}%`),
            ilike(contacts.company, `%${query}%`),
            ilike(contacts.notes, `%${query}%`),
          )
        : undefined;
      const matches = await db
        .select()
        .from(contacts)
        .where(where)
        .orderBy(contacts.name)
        .limit(limit);
      return asTextResult({ count: matches.length, contacts: matches });
    },
  );

  return mcpServer;
}

const app = new Hono();

app.get('/', (c) => c.text('Neon contacts MCP server. Connect an MCP client to POST /mcp'));

app.on(['GET', 'DELETE'], '/mcp', (c) =>
  c.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
    405,
    { Allow: 'POST' },
  ),
);

app.post('/mcp', async (c) => {
  const mcpServer = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default app;
