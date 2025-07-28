import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, {
    ssl: 'require',
});

async function setup() {
    try {
        console.log('Connection established');

        // Drop the table if it already exists
        await sql`DROP TABLE IF EXISTS books;`;
        console.log('Finished dropping table (if it existed).');

        // Create a new table
        await sql`
      CREATE TABLE books (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        author VARCHAR(255),
        publication_year INT,
        in_stock BOOLEAN DEFAULT TRUE
      );
    `;
        console.log('Finished creating table.');

        // Insert a single book record
        await sql`
      INSERT INTO books (title, author, publication_year, in_stock)
      VALUES ('The Catcher in the Rye', 'J.D. Salinger', 1951, true);
    `;
        console.log('Inserted a single book.');

        // Data to be inserted
        const booksToInsert = [
            { title: 'The Hobbit', author: 'J.R.R. Tolkien', publication_year: 1937, in_stock: true },
            { title: '1984', author: 'George Orwell', publication_year: 1949, in_stock: true },
            { title: 'Dune', author: 'Frank Herbert', publication_year: 1965, in_stock: false },
        ];

        // Insert multiple books
        await sql`
      INSERT INTO books ${sql(booksToInsert, 'title', 'author', 'publication_year', 'in_stock')}
    `;
        console.log('Inserted 3 rows of data.');
    } catch (err) {
        console.error('Connection failed.', err);
    } finally {
        sql.end();
    }
}

setup();