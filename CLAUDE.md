# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal engineering knowledge wiki: quick capture with heuristic auto-classification, full-text-ish search with tag/type/status filters, and project grouping. Backed by Cloudflare D1, with real-time multi-device sync over a Durable Object WebSocket — no local files, no Git-backed storage.

## Commands

```bash
npm install
npm run dev              # vite — runs the real Worker (D1 + Durable Object) inside the Vite dev process via @cloudflare/vite-plugin
npm test                 # tsx --test (pure-function tests) && vitest run (D1/Worker/DO tests via @cloudflare/vitest-pool-workers)
npm run build             # tsc --noEmit && vite build (client -> dist/client, worker bundle -> dist/<worker-name>)
npm run deploy             # build + wrangler deploy
npm run deploy:dry-run        # build + wrangler deploy --dry-run
npm run preview            # build + wrangler dev (serve the built Worker locally)
```

- `npm run dev` is a single process — there is no separate API server to start. `@cloudflare/vite-plugin` runs `src/worker.ts` with real local D1 and Durable Object bindings inside Vite, so `ws://127.0.0.1:5173/api/sync` and D1 reads/writes behave the same in dev as in prod.
- To run a single pure-function test: `tsx --test src/core/organizer.test.ts`.
- To run a single D1/Worker test file: `npx vitest run src/core/entryStore.workers.test.ts`.
- Local D1 schema must be applied once (and after any migration changes) before `npm run dev`/`npm test` will see the right tables: `npx wrangler d1 migrations apply knowledge-db --local`.
- There is no separate lint script; `npm run build` runs `tsc --noEmit` for type checking. `src/**/*.workers.test.ts` is excluded from that `tsc` pass (see `tsconfig.json` `exclude`) since it depends on the `cloudflare:test` module only resolvable under the Vitest Workers pool.

## Architecture: one Worker, D1 + Durable Object

`src/worker.ts` is the sole backend, in both dev and prod — there is no local Node server. It handles all `/api/*` routes, serves static assets from `dist/client` via the `ASSETS` binding for everything else, and re-exports the `SyncHub` Durable Object class (required so Wrangler can resolve `durable_objects.bindings[].class_name` from the `main` module in `wrangler.jsonc`).

- **D1** (binding `DB`, database name `knowledge-db`) is the single source of truth. Schema lives in `migrations/0001_init.sql` — one `entries` table, `tags` stored as a JSON string column (no join table), `project` is a **plain free-text grouping string**, not a separate entity — there is no "create project" step or project CRUD; a project is just a value some entries share, the same way a tag is. Search is plain SQL `LIKE` over title/body/tags, not FTS5 (documented as a future upgrade in the table if entry volume ever grows enough to need it).
- **Durable Object** `SyncHub` (`src/worker/syncHub.ts`, binding `SYNC_HUB`) is a *singleton* (`idFromName("singleton")`) that holds live WebSocket connections via the hibernatable WebSockets API (`ctx.acceptWebSocket`/`ctx.getWebSockets()`) and fans out a broadcast. Every mutating route (`POST /api/entries`, `PATCH /api/entries/:id`, `DELETE /api/entries/:id`) calls `stub.fetch(".../broadcast", ...)` after a successful D1 write. The broadcast payload is a cheap `{ type: "entries-changed", at }` signal, not a diff — clients just refetch `/api/summary` on receipt (see `subscribeToChanges` in `src/ui/api.ts`). Don't add row-level diffing to this path without a real reason; D1 reads are cheap at this app's scale.
- Any new mutating route must call `broadcast(env)` (see `src/worker.ts`) after its D1 write, or other open tabs/devices won't see the change until a manual refresh.

## Core modules (`src/core/`)

- `types.ts` — `Entry`, `EntryType` (`troubleshooting|decision|reference|runbook|note` — no `"project"` type), `EntryStatus` (`draft|active|archived`), `SearchFilters`, `CreateEntryInput`, `Summary`.
- `entryStore.ts` — all D1 queries (`createEntry`, `updateEntry`, `deleteEntry`, `getSummary`, `searchEntries`, `listEntries`), each `(db: D1Database, ...)`-first. `rowToEntry()` maps `snake_case` D1 columns to the camelCase `Entry` type — extend both together if the schema changes.
- `organizer.ts` — `organizeDraft()` heuristically infers title/type/project/tags/source from raw capture text (keyword matching against `TYPE_KEYWORDS`/`TECH_KEYWORDS`, inline `#tag` extraction, URL detection, and matching existing project *strings* mentioned in the text). Pure/no I/O, unchanged in spirit since before the D1 rewrite — this is the "capture-first, auto-classify" behavior the app is built around, don't casually rework it.

## UI (`src/ui/`)

- `main.tsx` — single-file React app, two views only: **Capture** (large-textarea auto-classify flow with a collapsible "Review details" override — the only entry-creation path) and **Browse** (search/filter form + entry list; draft-status entries get inline triage controls instead of a separate Inbox page; "project" is just a filter value, not a page).
- `api.ts` — thin fetch wrapper around `/api/*`, plus `subscribeToChanges(onChange)` for the `/api/sync` WebSocket (auto-reconnects with backoff on close).

## Testing split

- `src/core/organizer.test.ts`, `src/ui/api.test.ts` — plain `node:test`, no Workers runtime needed.
- `src/core/entryStore.workers.test.ts`, `src/worker.workers.test.ts` — run inside the real `workerd` runtime via `@cloudflare/vitest-pool-workers` (`vitest.config.ts`), with a real local D1 instance (migrated via `test/applyMigrations.ts` + `applyD1Migrations`) and real Durable Object bindings, including genuine WebSocket semantics. New Workers-runtime tests must be named `*.workers.test.ts` to be picked up (see `vitest.config.ts` `test.include`) and must **not** match `src/**/*.test.ts` in a way that would make `tsx --test` try to run them — `package.json`'s `test` script lists the `node:test` files explicitly rather than globbing, on purpose.

## Deployment / going live

- `wrangler.jsonc`'s `database_id` is a placeholder (`REPLACE_WITH_DATABASE_ID_FROM_WRANGLER_D1_CREATE`) until someone runs `wrangler login` then `wrangler d1 create knowledge-db` and pastes the real ID in, then applies migrations remotely with `wrangler d1 migrations apply knowledge-db --remote`.
- **There is no authentication anywhere in this app.** It's meant to sit behind a Cloudflare Access application (requires attaching a custom domain to the Worker first — Access policies are documented against custom domains, not bare `workers.dev` subdomains) rather than any in-app login. Don't add app-level auth code unless that decision changes; if Access turns out not to cleanly gate the `/api/sync` WebSocket upgrade, the documented fallback is a shared-secret header/cookie check applied uniformly to all routes in `worker.ts`.
- `dist/client` is committed (see the `dist/*` / `!dist/client/**` carve-out in `.gitignore`) for Cloudflare dashboard build setups that run `wrangler deploy` with no build step — refresh it with `npm run build` before committing app changes if that's the deploy path in use. `dist/<worker-name>` (the SSR worker bundle) is not committed.
