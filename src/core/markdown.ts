import type { EntryMetadata } from "./types.js";

const FRONTMATTER_BOUNDARY = "---";

export function serializeMarkdown(metadata: EntryMetadata, body: string): string {
  const lines = [
    FRONTMATTER_BOUNDARY,
    `title: ${quote(metadata.title)}`,
    `type: ${quote(metadata.type)}`,
    `project: ${quote(metadata.project)}`,
    `tags: [${metadata.tags.map(quote).join(", ")}]`,
    `status: ${quote(metadata.status)}`,
    `createdAt: ${quote(metadata.createdAt)}`,
    `updatedAt: ${quote(metadata.updatedAt)}`,
    `source: ${quote(metadata.source)}`,
    FRONTMATTER_BOUNDARY,
    "",
    body.trim(),
    ""
  ];
  return lines.join("\n");
}

export function parseMarkdown(content: string): { metadata: EntryMetadata; body: string } {
  if (!content.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    throw new Error("Markdown entry is missing frontmatter.");
  }

  const end = content.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1);
  if (end < 0) {
    throw new Error("Markdown entry frontmatter is not closed.");
  }

  const rawFrontmatter = content.slice(FRONTMATTER_BOUNDARY.length + 1, end);
  const body = content.slice(end + FRONTMATTER_BOUNDARY.length + 2).trim();
  const values = Object.fromEntries(
    rawFrontmatter.split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const colon = line.indexOf(":");
        if (colon < 0) {
          throw new Error(`Invalid frontmatter line: ${line}`);
        }
        return [line.slice(0, colon).trim(), parseValue(line.slice(colon + 1).trim())];
      })
  );

  return {
    metadata: {
      title: stringValue(values.title),
      type: stringValue(values.type) as EntryMetadata["type"],
      project: stringValue(values.project),
      tags: Array.isArray(values.tags) ? values.tags.map(String) : [],
      status: stringValue(values.status) as EntryMetadata["status"],
      createdAt: stringValue(values.createdAt),
      updatedAt: stringValue(values.updatedAt),
      source: stringValue(values.source)
    },
    body
  };
}

function parseValue(value: string): unknown {
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(",").map((item) => unquote(item.trim()));
  }
  return unquote(value);
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
