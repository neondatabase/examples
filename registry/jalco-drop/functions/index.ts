import { createDrop, rawHtml, type TextFormat } from "jalco-drop/neon";

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

const LEVELS = [
  { pattern: /\b(error|fatal|panic|exception)\b/i, color: "oklch(0.7 0.19 25)" },
  { pattern: /\b(warn|warning|deprecated)\b/i, color: "oklch(0.8 0.15 85)" },
];

const logs: TextFormat = {
  id: "logs",
  test: (name) => name.endsWith(".log"),
  render: (text) => ({
    mono: true,
    body: rawHtml(
      `<pre style="margin:0;padding:5rem 1.5rem 6rem;font:0.8125rem/1.7 var(--font-mono);white-space:pre-wrap">${text
        .split("\n")
        .map((line) => {
          const color = LEVELS.find((level) => level.pattern.test(line))?.color;
          return color ? `<span style="color:${color}">${escape(line)}</span>` : escape(line);
        })
        .join("\n")}</pre>`,
    ),
  }),
};

const drop = createDrop({
  adminToken: process.env.ADMIN_TOKEN!,
  bucket: process.env.DROPS_BUCKET ?? "drops",
  site: {
    name: process.env.SITE_NAME,
    owner: process.env.OWNER_NAME,
    accent: process.env.ACCENT_COLOR,
    codeTheme: process.env.CODE_THEME,
    homeUrl: process.env.HOME_URL,
  },
  rateLimit: process.env.RATE_LIMIT !== "off",
  formats: [logs],
});

const startedAt = Date.now();

export default {
  async fetch(request: Request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      try {
        return Response.json({ ok: true, uptimeMs: Date.now() - startedAt, ...(await drop.health()) });
      } catch (error) {
        return Response.json({ ok: false, storage: String(error) }, { status: 503 });
      }
    }
    return drop.fetch(request);
  },
};
