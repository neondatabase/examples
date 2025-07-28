import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
  },
});

async function deleteData() {
  const client = await pool.connect();
  try {
    console.log('Connection established');

    // Delete a data row from the table
    await client.query('DELETE FROM books WHERE title = $1;', ['1984']);
    console.log("Deleted the book '1984' from the table.");
  } catch (err) {
    console.error('Connection failed.', err.stack);
  } finally {
    client.release();
    pool.end();
  }
}

deleteData();