import { RequestInfo } from "rwsdk/worker";
import postgres from 'postgres';
import { env } from "cloudflare:workers";

async function getData() {
  const sql = postgres(env.DATABASE_URL, { ssl: 'require' });
  const response = await sql`SELECT version()`;
  return response[0].version;
}

export async function Home({ ctx }: RequestInfo) {
  return (
    <div>
      <h1>
        {await getData()}
      </h1>
      <h2>
        Using Cloudflare Workers with PostgreSQL
      </h2>
    </div>
  );
}
