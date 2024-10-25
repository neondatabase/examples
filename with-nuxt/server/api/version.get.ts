import { neon } from "@neondatabase/serverless";

export default defineCachedEventHandler(() => {
  const db = neon(import.meta.env.DATABASE_URL);
  return db('SELECT version()');
}, {
  maxAge: 60 * 60 * 24, //cache it for a day
})