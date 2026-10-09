export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Run \`neon env pull\` first.`);
  }
  return value;
}
