import type { EntryType, KnowledgeEntry, ProjectWiki, SearchFilters } from "./core/types.js";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

interface Summary {
  entries: KnowledgeEntry[];
  projects: ProjectWiki[];
  inbox: KnowledgeEntry[];
  tags: string[];
}

const GROUP_TYPES: EntryType[] = ["project", "troubleshooting", "decision", "reference", "runbook", "note"];

const entries: KnowledgeEntry[] = [
  {
    relativePath: "projects/ap2/index.md",
    absolutePath: "knowledge/projects/ap2/index.md",
    metadata: {
      title: "APPLIES 2",
      type: "project",
      project: "ap2",
      tags: [],
      status: "active",
      createdAt: "2026-07-06",
      updatedAt: "2026-07-06",
      source: ""
    },
    body: "# APPLIES 2\n\nImmigration Project\n\n## Context\n\n## Key links\n\n## Open questions",
    excerpt: "APPLIES 2 Immigration Project Context Key links Open questions"
  }
];

const projects = buildProjects(entries);
const summary: Summary = {
  entries,
  projects,
  inbox: [],
  tags: []
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/summary" && request.method === "GET") {
      return json(summary);
    }

    if (url.pathname === "/api/search" && request.method === "GET") {
      return json(searchEntries(url));
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: "This Cloudflare deployment is read-only. Run the local app for write and Git operations."
      }, 501);
    }

    return env.ASSETS.fetch(request);
  }
};

function searchEntries(url: URL): KnowledgeEntry[] {
  const filters: SearchFilters = {
    query: url.searchParams.get("query") ?? "",
    project: url.searchParams.get("project") ?? "",
    type: (url.searchParams.get("type") ?? "") as SearchFilters["type"],
    tag: url.searchParams.get("tag") ?? "",
    status: (url.searchParams.get("status") ?? "") as SearchFilters["status"]
  };
  const query = filters.query?.trim().toLowerCase() ?? "";
  return entries.filter((entry) => {
    const haystack = `${entry.metadata.title}\n${entry.body}\n${entry.metadata.tags.join(" ")}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (!filters.project || entry.metadata.project === filters.project)
      && (!filters.type || entry.metadata.type === filters.type)
      && (!filters.tag || entry.metadata.tags.includes(filters.tag))
      && (!filters.status || entry.metadata.status === filters.status);
  });
}

function buildProjects(allEntries: KnowledgeEntry[]): ProjectWiki[] {
  const slugs = [...new Set(allEntries.map((entry) => entry.metadata.project).filter(Boolean))];
  return slugs.map((slug) => {
    const projectEntries = allEntries.filter((entry) => entry.metadata.project === slug);
    const index = projectEntries.find((entry) => entry.metadata.type === "project");
    const groups = Object.fromEntries(GROUP_TYPES.map((type) => [type, [] as KnowledgeEntry[]])) as ProjectWiki["groups"];
    for (const entry of projectEntries) {
      groups[entry.metadata.type].push(entry);
    }
    return {
      slug,
      title: index?.metadata.title ?? slug,
      summary: firstParagraph(index?.body ?? ""),
      index,
      groups,
      recent: projectEntries.filter((entry) => entry.metadata.type !== "project")
    };
  });
}

function firstParagraph(body: string): string {
  return body.split(/\n\s*\n/).map((part) => part.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
