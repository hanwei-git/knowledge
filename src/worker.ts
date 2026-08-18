import { createEntry, deleteEntry, getSummary, searchEntries, updateEntry } from "./core/entryStore.js";
import { organizeDraft } from "./core/organizer.js";
import type { CreateEntryInput, SearchFilters } from "./core/types.js";

export { SyncHub } from "./worker/syncHub.js";

interface Env {
  DB: D1Database;
  SYNC_HUB: DurableObjectNamespace;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/sync") {
        return env.SYNC_HUB.get(env.SYNC_HUB.idFromName("singleton")).fetch(request);
      }

      if (url.pathname.startsWith("/api/")) {
        return await routeApi(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }
};

async function routeApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/summary") {
    return json(await getSummary(env.DB));
  }

  if (request.method === "GET" && url.pathname === "/api/search") {
    const filters: SearchFilters = {
      query: url.searchParams.get("query") ?? "",
      project: url.searchParams.get("project") ?? "",
      type: (url.searchParams.get("type") ?? "") as SearchFilters["type"],
      tag: url.searchParams.get("tag") ?? "",
      status: (url.searchParams.get("status") ?? "") as SearchFilters["status"]
    };
    return json(await searchEntries(env.DB, filters));
  }

  if (request.method === "POST" && url.pathname === "/api/entries") {
    const input = await readJson<CreateEntryInput>(request);
    const entry = await createEntry(env.DB, input);
    await broadcast(env);
    return json(entry, 201);
  }

  const entryIdMatch = url.pathname.match(/^\/api\/entries\/([^/]+)$/);
  if (entryIdMatch) {
    const id = decodeURIComponent(entryIdMatch[1]);
    if (request.method === "PATCH") {
      const updates = await readJson<Partial<CreateEntryInput>>(request);
      const entry = await updateEntry(env.DB, id, updates);
      await broadcast(env);
      return json(entry);
    }
    if (request.method === "DELETE") {
      await deleteEntry(env.DB, id);
      await broadcast(env);
      return new Response(null, { status: 204 });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/organize") {
    const body = await readJson<{ body: string }>(request);
    const summary = await getSummary(env.DB);
    return json(organizeDraft({ body: body.body ?? "", projects: summary.projects, tags: summary.tags }));
  }

  return json({ error: "API route not found." }, 404);
}

async function broadcast(env: Env): Promise<void> {
  const stub = env.SYNC_HUB.get(env.SYNC_HUB.idFromName("singleton"));
  await stub.fetch("https://sync-hub/broadcast", {
    method: "POST",
    body: JSON.stringify({ type: "entries-changed", at: new Date().toISOString() })
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  return (text ? JSON.parse(text) : {}) as T;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
