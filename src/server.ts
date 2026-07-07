import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import {
  archiveInboxEntry,
  createEntry,
  createProject,
  ensureKnowledgeBase,
  listEntries,
  listInbox,
  listProjects,
  searchEntries
} from "./core/knowledgeStore.js";
import { commitKnowledge, getGitStatus, getKnowledgeDiff, getKnowledgeLog } from "./core/gitService.js";
import { organizeDraft } from "./core/organizer.js";
import type { CreateEntryInput, CreateProjectInput, EntryMetadata, SearchFilters } from "./core/types.js";

const repoRoot = resolve(process.env.KNOWLEDGE_WIKI_ROOT ?? process.cwd());
const port = Number(process.env.PORT ?? 4317);

await ensureKnowledgeBase(repoRoot);

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Knowledge Wiki API listening on http://127.0.0.1:${port}`);
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (url.pathname.startsWith("/api/")) {
    await routeApi(request, response, url);
    return;
  }

  await serveStatic(response, url.pathname);
}

async function routeApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method === "GET" && url.pathname === "/api/summary") {
    const [entries, projects, inbox] = await Promise.all([listEntries(repoRoot), listProjects(repoRoot), listInbox(repoRoot)]);
    sendJson(response, 200, {
      entries,
      projects,
      inbox,
      tags: [...new Set(entries.flatMap((entry) => entry.metadata.tags))].sort()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/search") {
    const filters: SearchFilters = {
      query: url.searchParams.get("query") ?? "",
      project: url.searchParams.get("project") ?? "",
      type: (url.searchParams.get("type") ?? "") as SearchFilters["type"],
      tag: url.searchParams.get("tag") ?? "",
      status: (url.searchParams.get("status") ?? "") as SearchFilters["status"]
    };
    sendJson(response, 200, await searchEntries(repoRoot, filters));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/entries") {
    sendJson(response, 201, await createEntry(repoRoot, await readJson<CreateEntryInput>(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/organize") {
    const body = await readJson<{ body: string }>(request);
    const [projects, entries] = await Promise.all([listProjects(repoRoot), listEntries(repoRoot)]);
    sendJson(response, 200, organizeDraft({
      body: body.body ?? "",
      projects,
      tags: [...new Set(entries.flatMap((entry) => entry.metadata.tags))].sort()
    }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/projects") {
    sendJson(response, 201, await createProject(repoRoot, await readJson<CreateProjectInput>(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/archive") {
    const body = await readJson<{ relativePath: string; updates: Pick<EntryMetadata, "project" | "type" | "tags" | "status"> }>(request);
    sendJson(response, 200, await archiveInboxEntry(repoRoot, body.relativePath, body.updates));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/git/status") {
    sendJson(response, 200, await safeGit(() => getGitStatus(repoRoot), []));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/git/diff") {
    sendJson(response, 200, { diff: await safeGit(() => getKnowledgeDiff(repoRoot), "") });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/git/log") {
    sendJson(response, 200, await safeGit(() => getKnowledgeLog(repoRoot), []));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/git/commit") {
    const body = await readJson<{ message: string }>(request);
    sendJson(response, 200, { output: await commitKnowledge(repoRoot, body.message) });
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function safeGit<T>(action: () => Promise<T>, fallback: T): Promise<T | { error: string; fallback: T }> {
  try {
    return await action();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      fallback
    };
  }
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function serveStatic(response: ServerResponse, pathname: string): Promise<void> {
  const distRoot = join(repoRoot, "dist", "client");
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = join(distRoot, requested);
  try {
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": contentType(file) });
    response.end(content);
  } catch {
    try {
      const content = await readFile(join(distRoot, "index.html"));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(content);
    } catch {
      sendJson(response, 404, { error: "Static app is not built. Run npm run dev or npm run build first." });
    }
  }
}

function contentType(file: string): string {
  switch (extname(file)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}
