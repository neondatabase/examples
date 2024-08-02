"use strict";

const path = require("node:path");
const fastifyEnv = require("@fastify/env");
const AutoLoad = require("@fastify/autoload");

// Pass --options via CLI arguments in command to enable these options.
const options = {};

module.exports = async function (fastify, opts) {
  // This loads the environment variables plugin
  await fastify.register(fastifyEnv, {
    dotenv: {
      path: [".env", ".env.production", ".env.local"],
    },
    schema: {
      type: "object",
      required: ["DATABASE_URL"],
      properties: {
        DATABASE_URL: {
          type: "string",
        },
      },
    },
  });

  // This loads the Postgres plugin
  fastify.register(require("@fastify/postgres"), {
    connectionString: process.env.DATABASE_URL,
  });

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, "plugins"),
    options: Object.assign({}, opts),
  });

  // This loads all plugins defined in routes
  // define your routes in one of these
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, "routes"),
    options: Object.assign({}, opts),
  });
};

module.exports.options = options;
