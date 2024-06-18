import { neon } from "@neondatabase/serverless";

export async function getStaticProps() {
  if (!process.env.DATABASE_URL) return { props: { data: "" } };
  const sql = neon(process.env.DATABASE_URL);
  const response = await sql`SELECT version()`;
  return { props: { data: response[0].version } };
}

export default function Page({ data }: { data: string }) {
  return <>{data}</>;
}
