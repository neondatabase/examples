import "dotenv/config";
import knex from "knex";

const client = knex({
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL,
  },
});

const query = await client.raw("SELECT * from playing_with_neon")

console.log(query.rows);

process.exit(1);
