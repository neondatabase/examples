import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function deleteData() {
  try {
    console.log('Connection established');

    // Delete a data row from the table
    await sql`DELETE FROM books WHERE title = ${'1984'}`;
    console.log("Deleted the book '1984' from the table.");
  } catch (err) {
    console.error('Connection failed.', err);
  }
}

deleteData();