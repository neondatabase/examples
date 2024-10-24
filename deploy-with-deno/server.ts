// server.ts

import { neon } from '@neon/serverless';

const databaseUrl = Deno.env.get('DATABASE_URL')!;
const sql = neon(databaseUrl);

// Create the books table and insert initial data if it doesn't exist
await sql`
  CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL
  )
`;

// Check if the table is empty
const { count } = await sql`SELECT COUNT(*)::INT as count FROM books`.then((rows) => rows[0]);

if (count === 0) {
  // The table is empty, insert the book records
  await sql`
    INSERT INTO books (title, author) VALUES
      ('The Hobbit', 'J. R. R. Tolkien'),
      ('Harry Potter and the Philosopher''s Stone', 'J. K. Rowling'),
      ('The Little Prince', 'Antoine de Saint-Exupéry')
  `;
}

// Start the server
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname !== '/books') {
    return new Response('Not Found', { status: 404 });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const books = await sql`SELECT * FROM books`;
        return new Response(JSON.stringify(books, null, 2), {
          headers: { 'content-type': 'application/json' },
        });
      }
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  } catch (err) {
    console.error(err);
    return new Response(`Internal Server Error\n\n${err.message}`, {
      status: 500,
    });
  }
});