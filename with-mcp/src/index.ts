import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { parseEnv } from '@neondatabase/env/v1';
import config from '../neon';
import { contacts } from './db/schema';

const { postgres } = parseEnv(config, ['DATABASE_URL']);

// One pool per isolate, reused across requests (see the neon-functions skill).
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
const db = drizzle(pool);

process.on('SIGINT', () => {
  pool.end().then(() => process.exit(0));
});

// Optional free-text field — a fresh schema per field so each carries its own
// description in the generated tool schema (a shared instance would collapse to a $ref).
const optionalText = (description: string) =>
  z.string().trim().min(1).optional().describe(description);

function asTextResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

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
    const [row] = await db
      .insert(contacts)
      .values({ name, email, phone, company, notes })
      .returning();
    return asTextResult({ created: row });
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
    const [row] = await db
      .update(contacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    if (!row) {
      return asTextResult({ error: `No contact found with id ${id}.` });
    }
    return asTextResult({ updated: row });
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
    const [row] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    if (!row) {
      return asTextResult({ error: `No contact found with id ${id}.` });
    }
    return asTextResult({ deleted: row });
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
    const rows = await db
      .select()
      .from(contacts)
      .where(and(where))
      .orderBy(contacts.name)
      .limit(limit);
    return asTextResult({ count: rows.length, contacts: rows });
  },
);

// Connect the MCP server to the streamable HTTP transport once per isolate.
const transport = new StreamableHTTPTransport();

const app = new Hono();

app.get('/', (c) => c.text('Neon contacts MCP server — connect an MCP client to POST /mcp'));

app.all('/mcp', async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  return transport.handleRequest(c);
});

export default app;
