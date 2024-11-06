import { neon } from "@neondatabase/serverless";

export default defineCachedEventHandler((event) => {
  const { databaseUrl } = useRuntimeConfig(event)
  const db = neon(databaseUrl);
  return db('SELECT version()');
}, {
  maxAge: 60 * 60 * 24,
})