import { neon } from "@neondatabase/serverless";

export default async function HomePage() {
  const data = await getData();
  return <>{data.version}</>;
}

const getData = async () => {
  const sql = neon(`${process.env.DATABASE_URL}`);
  const result = await sql`SELECT version()`;
  return result[0];
};

export const getConfig = async () => {
  return {
    render: "static",
  };
};
