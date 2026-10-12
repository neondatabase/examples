import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarkdown, TARGET_CHUNK_CHARS } from "../src/chunking.ts";

test("Markdown headings create sections with parent context; code fences do not", () => {
  const text =
    "Intro paragraph.\n\n# Guide\n\nFirst paragraph.\n\n## Branches\n\nCreate a branch.\n\n```md\n# not a section\n```\n\n## Storage\n\nUpload a file.";
  const chunks = chunkMarkdown(text);
  assert.deepEqual(
    chunks.map((chunk) => chunk.heading),
    ["", "Guide", "Guide > Branches", "Guide > Storage"],
  );
  assert.match(chunks[2]!.content, /# not a section/);
  assert.match(chunks[2]!.content, /Create a branch/);
});

test("Setext headings are parsed and neighboring paragraphs stay together", () => {
  const chunks = chunkMarkdown(
    "Guide\n=====\n\nOne paragraph.\n\nAnother paragraph.",
  );
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]!.heading, "Guide");
  assert.match(chunks[0]!.content, /One paragraph\.\n\nAnother paragraph\./);
});

test("whole lists and fenced code stay intact", () => {
  const list = "- first\n- second";
  const code = "```ts\nconst value = 1;\n```";
  const chunks = chunkMarkdown(
    `# Guide\n\n${"x".repeat(TARGET_CHUNK_CHARS - 200)}\n\n${list}\n\n${code}`,
  );
  assert.ok(chunks.some((chunk) => chunk.content.includes(list)));
  assert.ok(chunks.some((chunk) => chunk.content.includes(code)));
  assert.ok(
    chunks.every((chunk) => chunk.content.length <= TARGET_CHUNK_CHARS),
  );
});

test("large blocks are bounded without losing Unicode characters", () => {
  const text = "x" + "😀".repeat(TARGET_CHUNK_CHARS);
  const chunks = chunkMarkdown(text);
  assert.equal(chunks.map((chunk) => chunk.content).join(""), text);
  assert.ok(
    chunks.every((chunk) => chunk.content.length <= TARGET_CHUNK_CHARS),
  );
  assert.ok(
    chunks.every(
      (chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk.content),
    ),
  );
});

test("too many small sections fail before any embedding work", () => {
  assert.throws(
    () =>
      chunkMarkdown(
        Array.from({ length: 101 }, (_, i) => `# Heading ${i}\n\ntext`).join(
          "\n\n",
        ),
      ),
    /more than 100/,
  );
});

test("parent headings provide context without creating heading-only chunks", () => {
  assert.deepEqual(
    chunkMarkdown("# Guide\n\n## Branches\n\nCreate a branch."),
    [{ content: "Create a branch.", heading: "Guide > Branches" }],
  );
  assert.deepEqual(chunkMarkdown("# Guide"), [
    { content: "# Guide", heading: "Guide" },
  ]);
});

test("oversized code, GFM tables, lists, quotes, and HTML remain atomic", () => {
  const code = "```sql\n" + "SELECT 1;\n".repeat(500) + "```";
  const table =
    "| Key | Value |\n| --- | --- |\n" +
    "| branching | isolated environments |\n".repeat(150);
  const list = "- an indivisible list item\n".repeat(200).trim();
  const quote = "> a quoted paragraph\n".repeat(250).trim();
  const html = "<pre>\n" + "an HTML block\n".repeat(350) + "</pre>";
  for (const block of [code, table.trim(), list, quote, html]) {
    assert.ok(block.length > TARGET_CHUNK_CHARS);
    const chunks = chunkMarkdown(`# Section\n\nBefore.\n\n${block}\n\nAfter.`);
    assert.deepEqual(
      chunks.map((chunk) => chunk.content),
      ["Before.", block, "After."],
    );
    assert.ok(chunks.every((chunk) => chunk.heading === "Section"));
  }
});

test("indented code preserves indentation and formatted headings use AST text", () => {
  const code = "    SELECT 1;\n    SELECT 2;";
  assert.deepEqual(chunkMarkdown(code), [{ content: code, heading: "" }]);
  assert.deepEqual(chunkMarkdown("  ## **Branches** and `SQL`\n\n" + code), [
    { content: code, heading: "Branches and SQL" },
  ]);
});

test("YAML and TOML front matter never become chunks or heading context", () => {
  for (const prefix of [
    "---\ntitle: Metadata title\ntags: [branching]\n---\n\n",
    '+++\ntitle = "Metadata title"\ntags = ["branching"]\n+++\n\n',
  ]) {
    assert.deepEqual(
      chunkMarkdown(prefix + "# Guide\n\n## Branches\n\nCreate a branch."),
      [{ content: "Create a branch.", heading: "Guide > Branches" }],
    );
    assert.deepEqual(chunkMarkdown(prefix), []);
    assert.deepEqual(chunkMarkdown(prefix + "# Guide"), [
      { content: "# Guide", heading: "Guide" },
    ]);
  }
});

test("front-matter delimiters in code and body content are preserved", () => {
  const code =
    '```md\n---\ntitle: Code example\n---\n+++\ntitle = "Code example"\n+++\n```';
  assert.deepEqual(chunkMarkdown("# Guide\n\n" + code), [
    { content: code, heading: "Guide" },
  ]);
  const body = "Before.\n\n---\n\n+++\n\nAfter.";
  assert.deepEqual(chunkMarkdown(body), [{ content: body, heading: "" }]);
});

test("a leading BOM keeps parser offsets aligned for YAML and TOML front matter", () => {
  for (const prefix of [
    "---\ntitle: Metadata title\n---\n\n",
    '+++\ntitle = "Metadata title"\n+++\n\n',
  ]) {
    assert.deepEqual(chunkMarkdown("\uFEFF" + prefix + "# Guide\n\nBody."), [
      { content: "Body.", heading: "Guide" },
    ]);
    assert.deepEqual(chunkMarkdown("\uFEFF" + prefix.trimEnd()), []);
    assert.deepEqual(chunkMarkdown("\uFEFF" + prefix + "# Guide"), [
      { content: "# Guide", heading: "Guide" },
    ]);
    const code = "```sql\nSELECT 1;\n```";
    assert.deepEqual(chunkMarkdown("\uFEFF" + prefix + "# Guide\n\n" + code), [
      { content: code, heading: "Guide" },
    ]);
  }
});

test("a leading BOM also preserves ordinary Markdown and indented code", () => {
  assert.deepEqual(chunkMarkdown("\uFEFFBody."), [
    { content: "Body.", heading: "" },
  ]);
  const code = "    SELECT 1;\n    SELECT 2;";
  assert.deepEqual(chunkMarkdown("\uFEFF" + code), [
    { content: code, heading: "" },
  ]);
});
