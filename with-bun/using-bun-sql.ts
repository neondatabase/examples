import { sql } from 'bun';

async function getPgVersion() {
    const result = await sql`SELECT version()`;
    console.log(result[0]);
}

getPgVersion();