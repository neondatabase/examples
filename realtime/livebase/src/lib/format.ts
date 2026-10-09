import { normalizeUrl } from "~/lib/normalize";

// Pure display formatting, shared by SSR and the browser. Dates use a fixed
// English locale so that both sides produce the same words; clock times still
// follow the runtime's time zone.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const MONEY_UNITS = [
  { size: 1e3, suffix: "k" },
  { size: 1e6, suffix: "M" },
  { size: 1e9, suffix: "B" },
] as const;

function isValidDate(date: Date | null | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

export function formatRelativeTime(date: Date | null | undefined, now: Date = new Date()): string {
  if (!isValidDate(date)) return "";
  const elapsed = now.getTime() - date.getTime();
  // Clock skew can put a fresh server timestamp slightly in the future.
  if (elapsed < 5 * SECOND) return "just now";
  if (elapsed < MINUTE) return `${Math.floor(elapsed / SECOND)}s ago`;
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  const format = date.getFullYear() === now.getFullYear() ? SHORT_DATE : SHORT_DATE_WITH_YEAR;
  return format.format(date);
}

export function formatClockTime(date: Date | null | undefined): string {
  if (!isValidDate(date)) return "";
  // Built by hand: some locales render midnight as "24:00:00".
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function formatDuration(ms: number): string {
  const value = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (Math.round(value) < SECOND) return `${Math.round(value)} ms`;
  const tenths = Math.round(value / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`;
  const totalSeconds = Math.round(value / SECOND);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} m` : `${hours} h`;
  return seconds > 0 ? `${minutes} m ${seconds} s` : `${minutes} m`;
}

export function formatMoney(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const amount = Math.round(Math.abs(value));
  const sign = value < 0 && amount > 0 ? "-" : "";
  if (amount < 1000) return `${sign}$${amount}`;
  let text = "";
  for (const { size, suffix } of MONEY_UNITS) {
    const scaled = amount / size;
    // One decimal while the number is short ("$1.2M"), none after ("$250k").
    const rounded = Number(scaled.toFixed(scaled < 100 ? 1 : 0));
    text = `${rounded}${suffix}`;
    // Rounding can reach the next unit (999,950 is "1000k"), so move up.
    if (rounded < 1000) break;
  }
  return `${sign}$${text}`;
}

// Fit and confidence scores are stored from 0 to 1.
export function scorePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const limit = Math.floor(max);
  if (!(limit >= 1)) return "";
  let end = limit - 1;
  // Don't cut between the halves of a surrogate pair, such as an emoji.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

export function hostname(url: string | null | undefined): string | null {
  const href = normalizeUrl(url);
  return href ? new URL(href).hostname.replace(/^www\./, "") : null;
}

export function initials(name: string | null | undefined): string {
  // The first letter or digit of the first and last words, skipping
  // punctuation such as quotes and brackets.
  const letters = (name ?? "")
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((letter): letter is string => letter !== undefined);
  const first = letters[0];
  if (first === undefined) return "?";
  const last = letters.length > 1 ? letters.at(-1) : undefined;
  return `${first}${last ?? ""}`.toUpperCase();
}

export function summarizeValue(value: unknown, max = 160): string {
  let text: string;
  try {
    text = describe(value);
  } catch {
    // A throwing getter or `toJSON`, or a revoked proxy. Never break a render.
    text = "[unserializable]";
  }
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

function describe(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol" || typeof value === "bigint") return value.toString();
  // JSON.stringify would render an Error as "{}".
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  return JSON.stringify(value, circularReplacer()) ?? String(value);
}

// Marks true cycles, not shared references, following MDN's pattern: `this`
// is the parent of `value`, so ancestors below it are no longer on the path.
function circularReplacer() {
  const ancestors: unknown[] = [];
  return function replace(this: unknown, _key: string, value: unknown): unknown {
    // JSON.stringify throws on bigint.
    if (typeof value === "bigint") return value.toString();
    if (typeof value !== "object" || value === null) return value;
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
    if (ancestors.includes(value)) return "[Circular]";
    ancestors.push(value);
    return value;
  };
}

export function humanizeLabel(label: string): string {
  const text = label
    // Split camelCase ("sizeBand") and acronym runs ("HTMLParser").
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    // Sentence case, but keep words that are all capitals ("URL", "Series B").
    .map((word) => (/\p{Ll}/u.test(word) ? word.toLowerCase() : word))
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
