import { neon } from "@neondatabase/serverless";
import { createAsync, cache } from "@solidjs/router";

const getVersion = cache(async () => {
  "use server";
  const sql = neon(`${process.env.DATABASE_URL}`);
  const response = await sql`SELECT version()`;
  const { version } = response[0];
  return version;
}, "version");

export const route = {
  load: () => getVersion(),
};

export default function Page() {
  const version = createAsync(() => getVersion());
  return <>{version()}</>;
}
