import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { frontmatter } from "micromark-extension-frontmatter";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import type { Literal, PhrasingContent } from "mdast";
import { InputError } from "./input.ts";

// Register the TOML nodes enabled by the front-matter extension.
declare module "mdast" {
  interface RootContentMap {
    toml: Literal & { type: "toml" };
  }
}

export const TARGET_CHUNK_CHARS = 4096;
export const MAX_DOCUMENT_CHUNKS = 100;

export type MarkdownChunk = { content: string; heading: string };

// Split only oversized prose paragraphs; structural Markdown blocks stay intact.
function splitBlock(text: string): string[] {
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > TARGET_CHUNK_CHARS) {
    let end = TARGET_CHUNK_CHARS;
    const boundary = remaining.slice(0, end).search(/\s+\S*$/);
    if (boundary >= end / 2) end = boundary;
    // Avoid cutting a Unicode surrogate pair when a block has no whitespace.
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    parts.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function headingText(node: PhrasingContent): string {
  if ("value" in node) return node.value;
  if ("children" in node) return node.children.map(headingText).join("");
  if ("alt" in node) return node.alt ?? "";
  return " ";
}

export function chunkMarkdown(markdown: string): MarkdownChunk[] {
  // micromark ignores a leading BOM; keep source slices on the same offsets.
  if (markdown.startsWith("\uFEFF")) markdown = markdown.slice(1);
  const tree = fromMarkdown(markdown, {
    extensions: [gfmTable(), frontmatter(["yaml", "toml"])],
    mdastExtensions: [
      gfmTableFromMarkdown(),
      frontmatterFromMarkdown(["yaml", "toml"]),
    ],
  });
  const chunks: MarkdownChunk[] = [];
  const headings: { depth: number; title: string }[] = [];
  let bodyStart = 0;
  let pending = "";
  let heading = "";
  function flush() {
    if (pending) chunks.push({ content: pending, heading });
    pending = "";
  }
  for (const node of tree.children) {
    if (node.type === "yaml" || node.type === "toml") {
      bodyStart = node.position!.end.offset!;
      continue;
    }
    if (node.type === "heading") {
      flush();
      while (headings.at(-1) && headings.at(-1)!.depth >= node.depth) {
        headings.pop();
      }
      const title = node.children.map(headingText).join("").trim();
      headings.push({ depth: node.depth, title });
      heading = headings.map((item) => item.title).join(" > ");
      continue;
    }
    const source = markdown.slice(
      node.position!.start.offset!,
      node.position!.end.offset!,
    );
    const parts = node.type === "paragraph" ? splitBlock(source) : [source];
    for (const part of parts) {
      if (pending && pending.length + 2 + part.length > TARGET_CHUNK_CHARS)
        flush();
      pending = pending ? `${pending}\n\n${part}` : part;
    }
  }
  flush();
  // Keep heading-only documents searchable without restoring front matter.
  const body = markdown.slice(bodyStart);
  if (chunks.length === 0 && body.trim()) {
    for (const content of splitBlock(body)) chunks.push({ content, heading });
  }
  if (chunks.length === 0) {
    throw new InputError("content must produce at least one searchable chunk");
  }
  if (chunks.length > MAX_DOCUMENT_CHUNKS) {
    throw new InputError(
      `content produces more than ${MAX_DOCUMENT_CHUNKS} markdown chunks`,
    );
  }
  return chunks;
}
