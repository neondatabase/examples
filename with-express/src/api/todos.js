const express = require("express");
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

const router = express.Router();

// Get all todos
router.get("/", async (_, res, next) => {
  try {
    await sql`CREATE TABLE IF NOT EXISTS todos (id SERIAL, text TEXT, completed BOOLEAN)`;
    const todos = await sql`SELECT * FROM todos`;
    return res.json(todos);
  } catch (err) {
    next(err);
  }
});

// Create one todo
router.post("/", async (req, res, next) => {
  try {
    const { text } = req.body;
    await sql`INSERT INTO todos (text, completed) VALUES (${text}, false)`;
    return res.status(200).send("Todo created successfully");
  } catch (err) {
    next(err);
  }
});

// Toggle todo completion
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;
    await sql`UPDATE todos SET completed=${completed} WHERE id=${id}`;
    return res.status(200).send();
  } catch (err) {
    next(err);
  }
});

// Delete item
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM todos WHERE id=${id}`;
    return res.status(200).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
