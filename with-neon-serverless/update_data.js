import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function updateData() {
  try {
    console.log('Connection established');

    // Update a data row in the table
    await sql`UPDATE books SET in_stock = ${true} WHERE title = ${'Dune'}`;
    console.log("Updated stock status for 'Dune'.");
  } catch (err) {
    console.error('Connection failed.', err);
  }
}

updateData();