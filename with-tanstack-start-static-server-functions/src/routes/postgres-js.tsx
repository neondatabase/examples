import { createFileRoute } from "@tanstack/react-router";

// data
import { getPostgresJsData } from "../data/get-neon-data.ts";

export const Route = createFileRoute("/postgres-js")({
  loader: async () => {
    return getPostgresJsData();
  },

  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <div className="container">
      <h1>Postgres.js</h1>
      <p>Data loaded from a Neon postgres.js instance.</p>

      <p style={{ marginTop: "3rem" }}>Postgres version:</p>
      <p>{data}</p>
    </div>
  );
}
