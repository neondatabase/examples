import { neon } from "@neondatabase/serverless";
import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Neon with React Router" },
    { name: "description", content: "Welcome to React Router + Neon!" },
  ];
}

export async function loader({}: Route.ClientLoaderArgs) {
  const sql = neon(`${process.env.DATABASE_URL}`);
  const response = await sql`SELECT version()`;
  console.log("response", response);
  const { version } = response[0];
  return { version };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  console.log("loaderData", loaderData);
  return <Welcome databaseVersion={loaderData.version} />;
}
