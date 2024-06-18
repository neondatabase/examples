const express = require("express");

const router = express.Router();
const todos = require("./todos");

router.get("/", (_, res) => {
  res.json({
    message: "Welcome to API 🚀",
  });
});

router.use("/todos", todos);

module.exports = router;
