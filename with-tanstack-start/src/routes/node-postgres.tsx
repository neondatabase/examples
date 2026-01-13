import { createFileRoute } from "@tanstack/react-router";

// data
import { getNodePostgresData } from "../data/get-neon-data.ts";

export const Route = createFileRoute("/node-postgres")({
  loader: async () => {
    return getNodePostgresData();
  },

  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <div className="container">
      <h1>Node Postgres</h1>
      <p>Data loaded from a Neon node postgres instance.</p>

      <p style={{ marginTop: "3rem" }}>Postgres version:</p>
      <p>{data}</p>
    </div>
  );
}
