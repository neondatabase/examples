const { Pool } = require('pg');

let conn;

if (!conn) {
  conn = new Pool({
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

module.exports = conn;
