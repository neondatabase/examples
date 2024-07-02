import express from "express";
import pkg from "pg";

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON bodies for this app
app.use(express.json());

// Create a new pool using your Neon database connection string
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get("/", async (req, res) => {
  try {
    // Fetch the list of plants from your database using the postgres connection
    const { rows } = await pool.query("SELECT * FROM plant_care_log;");
    res.json(rows);
  } catch (error) {
    console.error("Failed to fetch plants", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
