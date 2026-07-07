import type { EntryStatus, EntryType, ProjectWiki } from "./types.js";

export interface OrganizeDraftInput {
  body: string;
  projects: ProjectWiki[];
  tags: string[];
}

export interface OrganizedDraft {
  title: string;
  type: EntryType;
  project: string;
  tags: string[];
  status: EntryStatus;
  source: string;
  body: string;
  saveTarget: "project" | "inbox";
  reason: string;
}

const TYPE_KEYWORDS: Record<Exclude<EntryType, "project">, string[]> = {
  troubleshooting: ["error", "exception", "failed", "failure", "timeout", "root cause", "fix", "resolved", "symptom", "cause", "verification"],
  decision: ["decision", "decide", "option", "trade-off", "tradeoff", "chosen", "alternative", "consequence"],
  runbook: ["steps", "procedure", "rollback", "checklist", "verify", "command sequence"],
  reference: ["http://", "https://", "article", "docs", "source summary"],
  note: []
};

const TECH_KEYWORDS = [
  "api",
  "auth",
  "cache",
  "ci",
  "deployment",
  "docker",
  "git",
  "graphql",
  "redis",
  "kubernetes",
  "mysql",
  "nginx",
  "node",
  "postgres",
  "typescript"
];

export function organizeDraft(input: OrganizeDraftInput): OrganizedDraft {
  const body = input.body.trim();
  const project = inferProject(body, input.projects);
  const type = inferType(body);
  const saveTarget = project ? "project" : "inbox";

  return {
    title: inferTitle(body),
    type,
    project,
    tags: inferTags(body, input.tags),
    status: saveTarget === "project" ? "active" : "draft",
    source: inferSource(body),
    body,
    saveTarget,
    reason: project ? `Matched project ${project}.` : "No project match; saved as inbox draft."
  };
}

function inferProject(body: string, projects: ProjectWiki[]): string {
  const normalizedBody = body.toLowerCase();
  for (const project of projects) {
    if (containsPhrase(normalizedBody, project.slug) || containsPhrase(normalizedBody, project.title)) {
      return project.slug;
    }
  }
  return "";
}

function inferType(body: string): Exclude<EntryType, "project"> {
  const normalizedBody = body.toLowerCase();
  const scores = Object.entries(TYPE_KEYWORDS)
    .filter(([type]) => type !== "note")
    .map(([type, keywords]) => ({
      type: type as Exclude<EntryType, "project" | "note">,
      score: keywords.reduce((count, keyword) => count + (normalizedBody.includes(keyword) ? 1 : 0), 0)
    }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score ? scores[0].type : "note";
}

function inferTags(body: string, existingTags: string[]): string[] {
  const normalizedBody = body.toLowerCase();
  const inlineTags = [...body.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((match) => cleanTag(match[1]));
  const keywordTags = TECH_KEYWORDS.filter((keyword) => containsPhrase(normalizedBody, keyword));
  const reusedTags = existingTags
    .map(cleanTag)
    .filter((tag) => tag && containsPhrase(normalizedBody, tag));
  return unique([...inlineTags, ...keywordTags, ...reusedTags]).slice(0, 6);
}

function inferTitle(body: string): string {
  const line = body
    .split("\n")
    .map((item) => item.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (!line) {
    return "Untitled note";
  }
  return line.length > 72 ? `${line.slice(0, 69).trimEnd()}...` : line;
}

function inferSource(body: string): string {
  return body.match(/https?:\/\/\S+/)?.[0].replace(/[),.;]+$/, "") ?? "";
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const cleanPhrase = phrase.trim().toLowerCase();
  if (!cleanPhrase) {
    return false;
  }
  return haystack.includes(cleanPhrase);
}

function cleanTag(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(cleanTag).filter(Boolean))];
}
