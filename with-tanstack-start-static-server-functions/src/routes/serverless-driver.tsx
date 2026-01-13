import { createFileRoute } from "@tanstack/react-router";

// data
import { getServerlessDriverData } from "../data/get-neon-data.ts";

export const Route = createFileRoute("/serverless-driver")({
  loader: async () => {
    return getServerlessDriverData();
  },

  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <div className="container">
      <h1>Serverless Driver</h1>
      <p>Data loaded from a Neon serverless driver instance.</p>

      <p style={{ marginTop: "3rem" }}>Postgres version:</p>
      <p>{data}</p>
    </div>
  );
}
