import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDuration,
  formatMoney,
  formatRelativeTime,
  hostname,
  humanizeLabel,
  initials,
  scorePercent,
  summarizeValue,
  truncate,
} from "~/lib/format";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  // Built in local time, like the short dates the function prints.
  const now = new Date(2026, 5, 15, 12, 0, 0);
  const ago = (ms: number) => formatRelativeTime(new Date(now.getTime() - ms), now);

  it("returns an empty string for a missing or invalid date", () => {
    assert.equal(formatRelativeTime(null, now), "");
    assert.equal(formatRelativeTime(undefined, now), "");
    assert.equal(formatRelativeTime(new Date("not a date"), now), "");
  });

  it("says just now for the first five seconds", () => {
    assert.equal(ago(0), "just now");
    assert.equal(ago(5 * SECOND - 1), "just now");
    assert.equal(ago(5 * SECOND), "5s ago");
  });

  it("says just now for a date slightly in the future, from clock skew", () => {
    assert.equal(ago(-3 * MINUTE), "just now");
  });

  it("counts seconds, then minutes, hours, and days", () => {
    assert.equal(ago(MINUTE - 1), "59s ago");
    assert.equal(ago(MINUTE), "1m ago");
    assert.equal(ago(HOUR - 1), "59m ago");
    assert.equal(ago(HOUR), "1h ago");
    assert.equal(ago(DAY - 1), "23h ago");
    assert.equal(ago(DAY), "1d ago");
    assert.equal(ago(7 * DAY - 1), "6d ago");
  });

  it("shows a short date from a week ago", () => {
    assert.equal(ago(7 * DAY), "Jun 8");
    assert.equal(formatRelativeTime(new Date(2026, 2, 1, 12), now), "Mar 1");
  });

  it("adds the year to a date from another year", () => {
    assert.equal(formatRelativeTime(new Date(2025, 11, 31, 12), now), "Dec 31, 2025");
  });
});

describe("formatDuration", () => {
  it("shows whole milliseconds under a second", () => {
    assert.equal(formatDuration(0), "0 ms");
    assert.equal(formatDuration(850), "850 ms");
    assert.equal(formatDuration(999.4), "999 ms");
  });

  it("treats negative and non-finite durations as zero", () => {
    assert.equal(formatDuration(-250), "0 ms");
    assert.equal(formatDuration(Number.NaN), "0 ms");
    assert.equal(formatDuration(Number.POSITIVE_INFINITY), "0 ms");
  });

  it("moves to seconds when rounding reaches a second", () => {
    assert.equal(formatDuration(999.6), "1.0 s");
  });

  it("shows seconds with one decimal under a minute", () => {
    assert.equal(formatDuration(2400), "2.4 s");
    assert.equal(formatDuration(59_940), "59.9 s");
  });

  it("moves to minutes when rounding reaches a minute", () => {
    assert.equal(formatDuration(59_960), "1 m");
  });

  it("shows minutes and seconds", () => {
    assert.equal(formatDuration(72 * SECOND), "1 m 12 s");
    assert.equal(formatDuration(5 * MINUTE), "5 m");
  });

  it("shows hours, with minutes when there are any", () => {
    assert.equal(formatDuration(HOUR), "1 h");
    assert.equal(formatDuration(2 * HOUR + 5 * MINUTE), "2 h 5 m");
  });
});

describe("formatMoney", () => {
  it("returns null for a missing or non-finite amount", () => {
    assert.equal(formatMoney(null), null);
    assert.equal(formatMoney(undefined), null);
    assert.equal(formatMoney(Number.NaN), null);
    assert.equal(formatMoney(Number.POSITIVE_INFINITY), null);
  });

  it("shows whole dollars under a thousand", () => {
    assert.equal(formatMoney(0), "$0");
    assert.equal(formatMoney(999), "$999");
    assert.equal(formatMoney(42.4), "$42");
  });

  it("shortens thousands, millions, and billions", () => {
    assert.equal(formatMoney(1000), "$1k");
    assert.equal(formatMoney(1500), "$1.5k");
    assert.equal(formatMoney(50_000), "$50k");
    assert.equal(formatMoney(1_200_000), "$1.2M");
    assert.equal(formatMoney(2_500_000_000), "$2.5B");
  });

  it("drops the decimal once the number has three digits", () => {
    assert.equal(formatMoney(250_000), "$250k");
  });

  it("moves to the next unit when rounding reaches it", () => {
    assert.equal(formatMoney(999.5), "$1k");
    assert.equal(formatMoney(999_950), "$1M");
  });

  it("puts the sign before the dollar sign", () => {
    assert.equal(formatMoney(-50_000), "-$50k");
    assert.equal(formatMoney(-1_200_000), "-$1.2M");
  });

  it("doesn't show a sign on an amount that rounds to zero", () => {
    assert.equal(formatMoney(-0.4), "$0");
  });
});

describe("scorePercent", () => {
  it("turns a 0 to 1 score into a whole percentage", () => {
    assert.equal(scorePercent(0), 0);
    assert.equal(scorePercent(0.5), 50);
    assert.equal(scorePercent(0.876), 88);
    assert.equal(scorePercent(1), 100);
  });

  it("clamps scores outside 0 to 1", () => {
    assert.equal(scorePercent(1.4), 100);
    assert.equal(scorePercent(-0.2), 0);
  });

  it("treats a non-finite score as 0", () => {
    assert.equal(scorePercent(Number.NaN), 0);
    assert.equal(scorePercent(Number.POSITIVE_INFINITY), 0);
  });
});

describe("truncate", () => {
  it("leaves text at or under the limit alone", () => {
    assert.equal(truncate("Hello", 10), "Hello");
    assert.equal(truncate("Hello", 5), "Hello");
  });

  it("cuts longer text to the limit, ellipsis included", () => {
    assert.equal(truncate("Hello world", 4), "Hel…");
  });

  it("rounds a fractional limit down", () => {
    assert.equal(truncate("Hello world", 2.7), "H…");
  });

  it("returns only the ellipsis for a limit of 1", () => {
    assert.equal(truncate("Hello", 1), "…");
  });

  it("returns an empty string for a limit of 0 or NaN", () => {
    assert.equal(truncate("Hello", 0), "");
    assert.equal(truncate("Hello", Number.NaN), "");
  });

  it("trims whitespace before the ellipsis", () => {
    assert.equal(truncate("Hello world", 7), "Hello…");
  });

  it("doesn't cut an emoji in half", () => {
    // "😀" is two UTF-16 code units, at indexes 2 and 3.
    assert.equal(truncate("ab😀cd", 4), "ab…");
    assert.equal(truncate("ab😀cd", 5), "ab😀…");
  });
});

describe("initials", () => {
  it("uses the first letters of the first and last words", () => {
    assert.equal(initials("Jane Doe"), "JD");
    assert.equal(initials("Mary Jane Watson"), "MW");
  });

  it("uses one letter for a single word", () => {
    assert.equal(initials("acme"), "A");
  });

  it("capitalizes, including accented letters", () => {
    assert.equal(initials("jane doe"), "JD");
    assert.equal(initials("élodie durand"), "ÉD");
  });

  it("ignores extra whitespace", () => {
    assert.equal(initials("  Jane   Doe  "), "JD");
  });

  it("skips punctuation at the start of a word", () => {
    assert.equal(initials('"Acme" (Holdings)'), "AH");
  });

  it("skips words with no letters or digits", () => {
    assert.equal(initials("— Acme"), "A");
  });

  it("counts digits as letters", () => {
    assert.equal(initials("3M Company"), "3C");
  });

  it("returns a question mark when there is no name", () => {
    assert.equal(initials(null), "?");
    assert.equal(initials(undefined), "?");
    assert.equal(initials(""), "?");
    assert.equal(initials("  "), "?");
  });
});

describe("hostname", () => {
  it("returns the host of a URL without www.", () => {
    assert.equal(hostname("https://www.acme.com/about?x=1"), "acme.com");
  });

  it("keeps other subdomains", () => {
    assert.equal(hostname("http://blog.acme.com"), "blog.acme.com");
  });

  it("accepts a bare domain and lowercases it", () => {
    assert.equal(hostname("acme.com"), "acme.com");
    assert.equal(hostname("WWW.Acme.com"), "acme.com");
  });

  it("returns null for a missing value", () => {
    assert.equal(hostname(null), null);
    assert.equal(hostname(undefined), null);
    assert.equal(hostname(""), null);
  });

  it("returns null for something that isn't a web link", () => {
    assert.equal(hostname("not a url"), null);
    assert.equal(hostname("jane@acme.com"), null);
    assert.equal(hostname("ftp://acme.com"), null);
    assert.equal(hostname("localhost"), null);
  });
});

describe("humanizeLabel", () => {
  it("turns snake_case and camelCase into sentence case", () => {
    assert.equal(humanizeLabel("size_band"), "Size band");
    assert.equal(humanizeLabel("sizeBand"), "Size band");
  });

  it("splits on hyphens and repeated separators", () => {
    assert.equal(humanizeLabel("funding-round"), "Funding round");
    assert.equal(humanizeLabel("  employee__count "), "Employee count");
  });

  it("splits an acronym from the word after it", () => {
    assert.equal(humanizeLabel("HTMLParser"), "HTML parser");
  });

  it("splits an acronym from the word before it", () => {
    assert.equal(humanizeLabel("linkedinURL"), "Linkedin URL");
  });

  it("keeps words that are all capitals", () => {
    assert.equal(humanizeLabel("Series B"), "Series B");
    assert.equal(humanizeLabel("ARR"), "ARR");
  });

  it("returns an empty string for an empty label", () => {
    assert.equal(humanizeLabel(""), "");
  });
});

describe("summarizeValue", () => {
  it("returns strings as they are", () => {
    assert.equal(summarizeValue("Acme raised a Series B"), "Acme raised a Series B");
  });

  it("returns an empty string for undefined", () => {
    assert.equal(summarizeValue(undefined), "");
  });

  it("renders other values as compact JSON", () => {
    assert.equal(summarizeValue(null), "null");
    assert.equal(summarizeValue(42), "42");
    assert.equal(summarizeValue({ query: "Acme", limit: [1, 2] }), '{"query":"Acme","limit":[1,2]}');
  });

  it("shows an error's name and message", () => {
    assert.equal(summarizeValue(new TypeError("bad input")), "TypeError: bad input");
  });

  it("renders a bigint, at the top level or nested", () => {
    assert.equal(summarizeValue(10n), "10");
    assert.equal(summarizeValue({ total: 10n }), '{"total":"10"}');
  });

  it("marks a circular reference", () => {
    const node: Record<string, unknown> = { name: "a" };
    node.self = node;
    assert.equal(summarizeValue(node), '{"name":"a","self":"[Circular]"}');
  });

  it("renders a shared reference that isn't circular in full", () => {
    const shared = { x: 1 };
    assert.equal(summarizeValue({ left: shared, right: shared }), '{"left":{"x":1},"right":{"x":1}}');
  });

  it("never throws, even when toJSON does", () => {
    const value = {
      toJSON() {
        throw new Error("nope");
      },
    };
    assert.equal(summarizeValue(value), "[unserializable]");
  });

  it("collapses whitespace onto one line", () => {
    assert.equal(summarizeValue("  line one\n\n  line two\t"), "line one line two");
  });

  it("cuts long text to max, 160 by default", () => {
    assert.equal(summarizeValue("abcdefghij", 5), "abcd…");
    const summary = summarizeValue("x".repeat(200));
    assert.equal(summary.length, 160);
    assert.ok(summary.endsWith("…"));
  });
});
