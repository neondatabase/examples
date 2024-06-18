require("dotenv").config();

const cors = require("cors");
const express = require("express");
const bodyParser = require("body-parser");

const api = require("./api");

const app = express();
const PORT = process.env.PORT || 4242;

app.get("/", (_, res) => {
  res.json({
    message: "Welcome to TODO API powered by Node.js, Express.js and Neon 🚀",
  });
});

app.use(cors());
app.use(bodyParser.json());
app.use("/api", api);

app.listen(PORT, () => {
  console.log(`Listening to http://localhost:${PORT}`);
});
