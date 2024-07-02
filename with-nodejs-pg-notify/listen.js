// File: listen.js

// Load all the environment variables
require("dotenv").config();

const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

const client = new Client({ connectionString });

async function listenToNotifications() {
  try {
    // Connect to Postgres
    await client.connect();
    // Listen to specific channel in Postgres
    // Attach a listener to notifications received
    client.on("notification", (msg) => {
      console.log("Notification received", msg.payload);
    });
    await client.query("LISTEN channel_name");
    console.log("Listening for notifications on my_channel");
  } catch (e) {
    console.log(e);
  }
}

listenToNotifications().catch(console.log);
