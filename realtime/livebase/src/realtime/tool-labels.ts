import { truncate } from "~/lib/format";
import { compactUrl, findingLabelName } from "~/realtime/findings";

// Human labels for enrichment's tool steps. Pure, so
// `runs.ts` can call it and tests cover it without a browser.

// Long inputs (a search query, a page path) are cut so a step stays on one
// line in the narrow inline panel; the full input is in the step's summary.
const MAX_SUBJECT_CHARS = 60;

// Where an avatar came from (the `method` argument on `recordFinding`),
// in the words of a sentence ending "Recorded avatar from …".
const AVATAR_SOURCES: Readonly<Record<string, string>> = {
  gravatar: "Gravatar",
  x: "X",
  company_site: "the company site",
  github: "GitHub",
};

// Exa's search categories, as "Searching … for <query>".
const SEARCH_SCOPES: Readonly<Record<string, string>> = {
  company: "company sites",
  news: "the news",
  "personal site": "personal sites",
  github: "GitHub",
};

// The label for a tool step, built from the call's arguments:
// "Searching the web for Dane Knecht", "Recorded title: VP Engineering".
// `succeeded` is true once the call finished without an error, which turns a
// record tool's label to the past tense. Null when the tool is unknown or a
// required argument is missing or malformed, so the caller keeps the step's
// current label, the tool's name.
export function toolStepLabel(toolName: string, args: unknown, succeeded: boolean): string | null {
  const input = asRecord(args);
  switch (toolKey(toolName)) {
    case "readwebpage": {
      const page = pageLabel(text(input?.url));
      if (!page) return null;
      const person = text(input?.person);
      return person ? `Reading ${page} for ${clip(person)}` : `Reading ${page}`;
    }
    case "wikidatalookup": {
      const name = text(input?.name);
      return name ? `Looking up ${clip(name)} on Wikidata` : null;
    }
    case "checkdomain": {
      const domain = text(input?.domain);
      return domain ? `Checking the domain ${clip(domain)}` : null;
    }
    case "findcompanywebsite": {
      const name = text(input?.name);
      return name ? `Finding the website for ${clip(name)}` : null;
    }
    case "websearch": {
      const query = text(input?.query);
      if (!query) return null;
      const scope = SEARCH_SCOPES[text(input?.category) ?? ""] ?? "the web";
      return `Searching ${scope} for ${clip(query)}`;
    }
    case "lookupgravatar":
      // The email is bound to the tool, never an argument, so there is
      // no input to miss.
      return "Checking Gravatar";
    case "lookupxprofile": {
      const handle = xHandle(text(input?.username));
      return handle ? `Looking up @${handle} on X` : null;
    }
    case "recordfinding":
      return findingStepLabel(input, succeeded);
    case "recordcolleague": {
      const name = text(input?.name);
      if (!name) return null;
      return `${succeeded ? "Added" : "Adding"} colleague ${clip(name)}`;
    }
    default:
      return null;
  }
}

// What each tool does, in words that need no input.
const TOOL_ACTIVITIES: Readonly<Record<string, string>> = {
  readwebpage: "Reading a web page",
  wikidatalookup: "Checking Wikidata",
  checkdomain: "Checking a domain",
  findcompanywebsite: "Finding the company website",
  websearch: "Searching the web",
  lookupgravatar: "Checking Gravatar",
  lookupxprofile: "Looking up an X profile",
  recordfinding: "Recording a finding",
  recordcolleague: "Adding a colleague",
};

// The lead list's status badge, which builds runs from spans alone: it loads
// no messages, so it has the tool's name but not its input. "Searching the
// web" (the badge adds the "…"). Null for a tool it has no words for.
export function toolActivityLabel(toolName: string): string | null {
  return TOOL_ACTIVITIES[toolKey(toolName)] ?? null;
}

// Mastra rejects a call whose input fails the tool's schema with one long
// message: "Tool input validation failed for webSearch. Please fix the
// following errors and try again:\n- query: Required\n\nProvided arguments: …".
// The stored copy may be clipped anywhere. This keeps the issues:
// "Invalid input — query: Required". Any other message is returned as it is.
const VALIDATION_FAILED = /^Tool input validation failed\b/;

export function toolErrorText(message: string): string {
  if (!VALIDATION_FAILED.test(message)) return message;
  const issues = message
    .split("\n\nProvided arguments:")[0]
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((issue) => issue !== "");
  return issues.length > 0 ? `Invalid input — ${issues.join("; ")}` : "Invalid input";
}

function findingStepLabel(input: Record<string, unknown> | null, succeeded: boolean): string | null {
  const subject = text(input?.subject);
  const label = text(input?.label);
  if (!subject || !label) return null;
  const verb = succeeded ? "Recorded" : "Recording";
  const name = lowerFirst(findingLabelName(subject, label));
  // An image URL says nothing at a glance; the findings list shows the image.
  if (label === "avatar_url") {
    const source = AVATAR_SOURCES[text(input?.method) ?? ""];
    return source ? `${verb} ${name} from ${source}` : `${verb} ${name}`;
  }
  if (label === "logo_url") return `${verb} ${name}`;
  const value = findingValueText(label, text(input?.value));
  return value ? `${verb} ${name}: ${value}` : `${verb} ${name}`;
}

// The value as the model sent it: fit scores arrive as integers from 0 to 100,
// and URLs read better without their scheme.
function findingValueText(label: string, value: string | null): string | null {
  if (!value) return null;
  if (label === "fit_score") {
    const score = Number(value);
    if (!Number.isFinite(score)) return clip(value);
    // Tolerate a 0–1 fraction, the stored form, in case a model sends it.
    const percent = score > 0 && score < 1 ? score * 100 : score;
    return `${Math.round(Math.min(100, Math.max(0, percent)))}%`;
  }
  if (label === "social_links" || label === "public_profiles") return pageLabel(value);
  return clip(value);
}

// "https://www.resend.com/about/?ref=x" → "resend.com/about".
function pageLabel(url: string | null): string | null {
  return url ? (compactUrl(url) ?? clip(url)) : null;
}

// "@zeno", "x.com/zeno" and "https://twitter.com/zeno?s=1" are all "zeno".
// Only for display: the X tool normalizes the handle it looks up.
function xHandle(value: string | null): string | null {
  if (!value) return null;
  const lastSegment = value.split(/[?#]/)[0]?.split("/").filter(Boolean).at(-1) ?? "";
  const handle = lastSegment.replace(/^@+/, "");
  return /^\w{1,50}$/.test(handle) ? handle : null;
}

// Tool names are matched like runs.ts matches spans to messages: ignoring
// case and punctuation, whatever key the tool is registered under.
function toolKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// "Company name" → "company name", but "HQ location" keeps its capitals.
function lowerFirst(name: string): string {
  return /^\p{Lu}{2}/u.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
}

function clip(value: string): string {
  return truncate(value, MAX_SUBJECT_CHARS);
}

// A trimmed, whitespace-collapsed string argument, or null when it's missing,
// empty or not a string.
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed === "" ? null : collapsed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
