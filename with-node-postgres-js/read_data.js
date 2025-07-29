import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, {
    ssl: 'require',
});

async function readData() {
    try {
        console.log('Connection established');

        // Fetch all rows from the books table
        const books = await sql`SELECT * FROM books ORDER BY publication_year;`;

        console.log('\n--- Book Library ---');
        books.forEach((book) => {
            console.log(
                `ID: ${book.id}, Title: ${book.title}, Author: ${book.author}, Year: ${book.publication_year}, In Stock: ${book.in_stock}`
            );
        });
        console.log('--------------------\n');
    } catch (err) {
        console.error('Connection failed.', err);
    } finally {
        sql.end();
    }
}

readData();