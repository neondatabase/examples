import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
  },
});

async function readData() {
  const client = await pool.connect();
  try {
    console.log('Connection established');

    // Fetch all rows from the books table
    const { rows } = await client.query('SELECT * FROM books ORDER BY publication_year;');

    console.log('\n--- Book Library ---');
    rows.forEach((row) => {
      console.log(
        `ID: ${row.id}, Title: ${row.title}, Author: ${row.author}, Year: ${row.publication_year}, In Stock: ${row.in_stock}`
      );
    });
    console.log('--------------------\n');
  } catch (err) {
    console.error('Connection failed.', err.stack);
  } finally {
    client.release();
    pool.end();
  }
}

readData();