const express = require('express');
const conn = require('../db');

const router = express.Router();

// Get all todos
router.get('/', async (_, res, next) => {
  try {
    const todos = await conn.query('SELECT * FROM todos');
    res.json(todos.rows);
    await conn.end();
  } catch (err) {
    next(err);
  }
});

// Create one todo
router.post('/', async (req, res, next) => {
  try {
    const { text } = req.body;
    await conn.query('INSERT INTO todos (text, completed) VALUES ($1, $2)', [
      text,
      false,
    ]);
    res.status(200).send('Todo created successfully');
  } catch (err) {
    next(err);
  }
});

// Toggle todo completion
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;
    await conn.query('UPDATE todos SET completed=$1 WHERE id=$2', [
      completed,
      id,
    ]);
    res.status(200).send();
  } catch (err) {
    next(err);
  }
});

// Delete item
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await conn.query('DELETE FROM todos WHERE id=$1', [id]);
    res.status(200).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
