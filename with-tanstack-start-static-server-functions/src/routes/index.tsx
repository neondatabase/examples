import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <div className="container">
      <h1>Ship faster with Postgres</h1>
      <p>
        The database developers trust, on a serverless platform designed to help
        you build reliable and scalable applications faster.
      </p>
      <p style={{ color: "#ff6600", marginTop: "2rem" }}>
        Click the navigation links at the top of the page to visit the relevant
        TanStack Start integration examples.
      </p>
    </div>
  );
}
