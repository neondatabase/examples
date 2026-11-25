// Keep certificate and hostname verification explicit for Neon connections.
// pg currently treats sslmode=require this way but will change its semantics.
export function connectionString(value: string): string {
  const url = new URL(value);
  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
