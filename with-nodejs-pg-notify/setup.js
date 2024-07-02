// File: setup.js

// Load all the environment variables
require("dotenv").config();

const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

const client = new Client({ connectionString });

async function setupTrigger() {
  try {
    // Connect to Postgres
    await client.connect();
    // Create a my_table if it does not already exist
    await client.query(
      `CREATE TABLE IF NOT EXISTS my_table (id SERIAL PRIMARY KEY, message TEXT)`
    );
    // Define the my_trigger_function function to send notifications
    await client.query(`
    CREATE OR REPLACE FUNCTION notify_trigger() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('channel_name', NEW.message);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;`);
    // Create the my_trigger to call the my_trigger_function after each insert
    await client.query(`
    CREATE TRIGGER my_trigger
    AFTER INSERT ON my_table
    FOR EACH ROW
    EXECUTE FUNCTION notify_trigger();`);
    console.log("Event triggers setup complete.");
    await client.end();
  } catch (e) {
    console.log(e);
  }
}

setupTrigger().catch(console.log);
