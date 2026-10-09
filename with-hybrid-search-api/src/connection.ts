// pg 8 treats sslmode=require as verify-full today but warns that this will
// change in pg 9. Keep certificate verification explicit for Neon URLs.
export function postgresUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.get("sslmode") === "require") {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
}
