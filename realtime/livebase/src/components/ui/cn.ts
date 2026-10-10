// Joins truthy class names. It doesn't resolve conflicts, and with Tailwind the
// order of names in `class` never decides one: the order of rules in the
// generated stylesheet does. So don't pass a class that fights a base class;
// when one must win, force it with the `!` suffix (`rounded-full!`).
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
