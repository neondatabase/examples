import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
  },
});

async function setup() {
  const client = await pool.connect();
  try {
    console.log('Connection established');

    // Drop the table if it already exists
    await client.query('DROP TABLE IF EXISTS books;');
    console.log('Finished dropping table (if it existed).');

    // Create a new table
    await client.query(`
      CREATE TABLE books (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          author VARCHAR(255),
          publication_year INT,
          in_stock BOOLEAN DEFAULT TRUE
      );
    `);
    console.log('Finished creating table.');

    // Insert a single book record
    await client.query(
      'INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4);',
      ['The Catcher in the Rye', 'J.D. Salinger', 1951, true]
    );
    console.log('Inserted a single book.');

    // Data to be inserted
    const booksToInsert = [
      { title: 'The Hobbit', author: 'J.R.R. Tolkien', year: 1937, in_stock: true },
      { title: '1984', author: 'George Orwell', year: 1949, in_stock: true },
      { title: 'Dune', author: 'Frank Herbert', year: 1965, in_stock: false },
    ];

    // Insert multiple books
    for (const book of booksToInsert) {
      await client.query(
        'INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4);',
        [book.title, book.author, book.year, book.in_stock]
      );
    }
    console.log('Inserted 3 rows of data.');
  } catch (err) {
    console.error('Connection failed.', err.stack);
  } finally {
    client.release();
    pool.end();
  }
}

setup();