import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parseMarkdown, serializeMarkdown } from "./markdown.js";
import type {
  CreateEntryInput,
  CreateProjectInput,
  EntryMetadata,
  EntryType,
  KnowledgeEntry,
  ProjectWiki,
  SearchFilters
} from "./types.js";

const TYPE_FOLDERS: Record<EntryType, string> = {
  project: "",
  troubleshooting: "troubleshooting",
  decision: "decisions",
  reference: "references",
  runbook: "runbooks",
  note: "notes"
};

const GROUP_TYPES: EntryType[] = ["project", "troubleshooting", "decision", "reference", "runbook", "note"];

export function knowledgeDir(root: string): string {
  return join(root, "knowledge");
}

export async function ensureKnowledgeBase(root: string): Promise<void> {
  const base = knowledgeDir(root);
  await mkdir(join(base, "inbox"), { recursive: true });
  await mkdir(join(base, "projects"), { recursive: true });
  await mkdir(join(base, "indexes"), { recursive: true });
}

export async function createEntry(root: string, input: CreateEntryInput): Promise<KnowledgeEntry> {
  await ensureKnowledgeBase(root);
  const now = today();
  const metadata: EntryMetadata = {
    title: input.title.trim(),
    type: input.type,
    project: input.project.trim(),
    tags: uniqueClean(input.tags),
    status: input.status,
    createdAt: now,
    updatedAt: now,
    source: input.source.trim()
  };
  const relativePath = entryPath(metadata, true);
  const absolutePath = join(knowledgeDir(root), relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, serializeMarkdown(metadata, input.body), "utf8");
  return toEntry(root, relativePath, serializeMarkdown(metadata, input.body));
}

export async function createProject(root: string, input: CreateProjectInput): Promise<KnowledgeEntry> {
  await ensureKnowledgeBase(root);
  const slug = slugify(input.slug || input.title);
  const body = `# ${input.title}\n\n${input.summary}\n\n## Context\n\n## Key links\n\n## Open questions`;
  const metadata: EntryMetadata = {
    title: input.title.trim(),
    type: "project",
    project: slug,
    tags: [],
    status: "active",
    createdAt: today(),
    updatedAt: today(),
    source: ""
  };
  const relativePath = `projects/${slug}/index.md`;
  const absolutePath = join(knowledgeDir(root), relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const content = serializeMarkdown(metadata, body);
  await writeFile(absolutePath, content, "utf8");
  return toEntry(root, relativePath, content);
}

export async function archiveInboxEntry(
  root: string,
  relativePath: string,
  updates: Pick<EntryMetadata, "project" | "type" | "tags" | "status">
): Promise<KnowledgeEntry> {
  const sourcePath = join(knowledgeDir(root), normalizeRelativePath(relativePath));
  const content = await readFile(sourcePath, "utf8");
  const parsed = parseMarkdown(content);
  const metadata: EntryMetadata = {
    ...parsed.metadata,
    project: slugify(updates.project),
    type: updates.type,
    tags: uniqueClean(updates.tags),
    status: updates.status,
    updatedAt: today()
  };
  const nextRelativePath = entryPath(metadata, false);
  const targetPath = join(knowledgeDir(root), nextRelativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, serializeMarkdown(metadata, parsed.body), "utf8");
  await rm(sourcePath);
  return toEntry(root, nextRelativePath, serializeMarkdown(metadata, parsed.body));
}

export async function listInbox(root: string): Promise<KnowledgeEntry[]> {
  return (await listEntries(root)).filter((entry) => entry.relativePath.startsWith("inbox/"));
}

export async function listProjects(root: string): Promise<ProjectWiki[]> {
  const entries = await listEntries(root);
  const projectSlugs = new Set(
    entries
      .filter((entry) => entry.metadata.project)
      .map((entry) => entry.metadata.project)
  );

  const projects: ProjectWiki[] = [];
  for (const slug of projectSlugs) {
    const projectEntries = entries.filter((entry) => entry.metadata.project === slug);
    const index = projectEntries.find((entry) => entry.metadata.type === "project");
    const groups = Object.fromEntries(GROUP_TYPES.map((type) => [type, [] as KnowledgeEntry[]])) as ProjectWiki["groups"];
    for (const entry of projectEntries) {
      groups[entry.metadata.type].push(entry);
    }
    for (const type of GROUP_TYPES) {
      groups[type].sort(byUpdatedDesc);
    }
    const contentEntries = projectEntries.filter((entry) => entry.metadata.type !== "project");
    projects.push({
      slug,
      title: index?.metadata.title ?? titleFromSlug(slug),
      summary: firstParagraph(index?.body ?? ""),
      index,
      groups,
      recent: [...contentEntries].sort(byUpdatedDesc).slice(0, 6)
    });
  }

  return projects.sort((a, b) => a.title.localeCompare(b.title));
}

export async function listEntries(root: string): Promise<KnowledgeEntry[]> {
  await ensureKnowledgeBase(root);
  const base = knowledgeDir(root);
  const files = await walkMarkdown(base);
  const entries = await Promise.all(files.map(async (file) => {
    const content = await readFile(file, "utf8");
    return toEntry(root, toKnowledgeRelative(root, file), content);
  }));
  return entries.sort(byUpdatedDesc);
}

export async function searchEntries(root: string, filters: SearchFilters): Promise<KnowledgeEntry[]> {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return (await listEntries(root)).filter((entry) => {
    const haystack = `${entry.metadata.title}\n${entry.body}\n${entry.metadata.tags.join(" ")}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (!filters.project || entry.metadata.project === filters.project)
      && (!filters.type || entry.metadata.type === filters.type)
      && (!filters.tag || entry.metadata.tags.includes(filters.tag))
      && (!filters.status || entry.metadata.status === filters.status);
  });
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}

function entryPath(metadata: EntryMetadata, allowInbox: boolean): string {
  const slug = slugify(metadata.title);
  if (allowInbox && !metadata.project) {
    return `inbox/${metadata.createdAt}-${slug}.md`;
  }
  const project = slugify(metadata.project);
  if (metadata.type === "project") {
    return `projects/${project}/index.md`;
  }
  return `projects/${project}/${TYPE_FOLDERS[metadata.type]}/${slug}.md`;
}

function toEntry(root: string, relativePath: string, content: string): KnowledgeEntry {
  const { metadata, body } = parseMarkdown(content);
  return {
    relativePath: normalizeRelativePath(relativePath),
    absolutePath: join(knowledgeDir(root), normalizeRelativePath(relativePath)),
    metadata,
    body,
    excerpt: excerpt(body)
  };
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const result: string[] = [];
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const item of items) {
    const absolute = join(dir, item.name);
    if (item.isDirectory()) {
      result.push(...await walkMarkdown(absolute));
    } else if (item.isFile() && item.name.endsWith(".md")) {
      result.push(absolute);
    }
  }
  return result;
}

function toKnowledgeRelative(root: string, file: string): string {
  return normalizeRelativePath(relative(knowledgeDir(root), file));
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function uniqueClean(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function excerpt(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

function firstParagraph(body: string): string {
  return body.split(/\n\s*\n/).map((part) => part.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";
}

function byUpdatedDesc(a: KnowledgeEntry, b: KnowledgeEntry): number {
  return b.metadata.updatedAt.localeCompare(a.metadata.updatedAt)
    || a.metadata.title.localeCompare(b.metadata.title);
}

function titleFromSlug(slug: string): string {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
