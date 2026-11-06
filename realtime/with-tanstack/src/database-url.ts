// `neon env pull` writes `sslmode=require`. pg already treats it as
// `verify-full` but warns that pg v9 will weaken it, so ask for `verify-full`.
export function withVerifyFullSsl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
