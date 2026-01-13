import { Link } from "@tanstack/react-router";

import "./Header.css";

export default function Header() {
  return (
    <header className="header beveled-b container">
      <nav className="nav">
        <div className="nav-item">
          <Link to="/">
            <img src="tanstack.svg" alt="TanStack" height="40" />
          </Link>
        </div>

        <div className="nav-item">
          <Link
            to="/serverless-driver"
            activeProps={{
              style: {
                color: "#ff6600",
              },
            }}
          >
            Serverless drivers
          </Link>
        </div>

        <div className="nav-item">
          <Link
            to="/postgres-js"
            activeProps={{
              style: {
                color: "#ff6600",
              },
            }}
          >
            Postgres.js
          </Link>
        </div>

        <div className="nav-item">
          <Link
            to="/node-postgres"
            activeProps={{
              style: {
                color: "#ff6600",
              },
            }}
          >
            Node postgres
          </Link>
        </div>
      </nav>
    </header>
  );
}
