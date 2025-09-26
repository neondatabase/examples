import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
  },
});

async function updateData() {
  const client = await pool.connect();
  try {
    console.log('Connection established');

    // Update a data row in the table
    await client.query('UPDATE books SET in_stock = $1 WHERE title = $2;', [true, 'Dune']);
    console.log("Updated stock status for 'Dune'.");
  } catch (err) {
    console.error('Connection failed.', err.stack);
  } finally {
    client.release();
    pool.end();
  }
}

updateData();
