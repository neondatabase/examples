"use strict";

module.exports = async function (fastify, opts) {
  fastify.get("/", function (req, reply) {
    fastify.pg.query(
      "SELECT * FROM playing_with_neon",
      [],
      function onResult(err, result) {
        reply.send(err || result.rows);
      }
    );
  });
};
