import { neon } from "@neondatabase/serverless";
import { useLoaderData } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export const loader = async () => {
  const sql = neon(`${process.env.DATABASE_URL}`);
  const response = await sql`SELECT version()`;
  const { version } = response[0];
  return version;
};

export default function Index() {
  const version = useLoaderData<typeof loader>();
  return <div>{version}</div>;
}
