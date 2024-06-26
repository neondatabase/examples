// server.ts

import * as postgres from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

const databaseUrl = Deno.env.get('DATABASE_URL')!;

const pool = new postgres.Pool(databaseUrl, 3, true);

const connection = await pool.connect();
try {
  await connection.queryObject`
    CREATE TABLE IF NOT EXISTS books (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL
    );
  `;

  // Check if the table is empty by getting the count of rows
  const result = await connection.queryObject<{ count: number }>`
    SELECT COUNT(*) AS count FROM books;
  `;
  const bookCount = Number(result.rows[0].count);

  if (bookCount === 0) {
    // The table is empty, insert the book records
    await connection.queryObject`
      INSERT INTO books (title, author) VALUES
        ('The Hobbit', 'J. R. R. Tolkien'),
        ('Harry Potter and the Philosopher''s Stone', 'J. K. Rowling'),
        ('The Little Prince', 'Antoine de Saint-Exupéry');
    `;
  }
} finally {
  connection.release();
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname !== '/books') {
    return new Response('Not Found', { status: 404 });
  }

  const connection = await pool.connect();
  try {
    switch (req.method) {
      case 'GET': {
        const result = await connection.queryObject`SELECT * FROM books`;
        const body = JSON.stringify(result.rows, null, 2);
        return new Response(body, {
          headers: { 'content-type': 'application/json' },
        });
      }
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  } catch (err) {
    console.error(err);
    return new Response(`Internal Server Error\n\n${err.message} `, {
      status: 500,
    });
  } finally {
    connection.release();
  }
});