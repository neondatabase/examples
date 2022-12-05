const { Client } = require('pg');
require('dotenv').config();

const URL = `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.ENDPOINT_ID}/${process.env.PGDATABASE}?sslmode=require`;

const connect = async () => {
  try {
    const client = new Client(URL);
    await client.connect();
    const res = await client.query("SELECT 'Hello Neon' as message");
    console.log(res.rows[0].message);
    await client.end();
  } catch (error) {
    console.log(error);
  }
};

connect();
