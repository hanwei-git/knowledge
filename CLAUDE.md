# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-purpose personal snippet manager with two entry types, `command` and `note`. Paste a shell command (one line or a block) — comments you write yourself (`#`, `-- `, `// `) are extracted as the description and kept out of the copyable command body, tags are auto-generated from recognized CLI tool names — or write a note (a sequence of steps or freeform text), which gets a title inferred from its first line and tags from inline `#hashtags` plus reused tags, with no shell-comment parsing since notes aren't shell syntax. Everything syncs live across devices. Backed by Cloudflare D1 with real-time sync over a Durable Object WebSocket — no local files, no Git-backed storage.

This app was previously a general multi-type knowledge wiki (troubleshooting/decision/reference/runbook/note entries, project grouping, a Browse view). That was deliberately cut down to just commands, then the `note` type was reintroduced by explicit ask (see `migrations/0004_add_entry_type.sql`) as a second, narrowly-scoped entry type alongside commands. Don't reintroduce the other old types/fields (`project`, `status`, `source`) or the Browse view without being asked — those are still removed on purpose.

## Commands

```bash
npm install
npm run dev              # vite — runs the real Worker (D1 + Durable Object) inside the Vite dev process via @cloudflare/vite-plugin
npm test                 # tsx --test (pure-function tests) && vitest run (D1/Worker/DO tests via @cloudflare/vitest-pool-workers)
npm run build             # tsc --noEmit && vite build (client -> dist/client, worker bundle -> dist/<worker-name>)
npm run deploy             # build + apply any unapplied remote D1 migrations + wrangler deploy
npm run deploy:dry-run        # build + wrangler deploy --dry-run
npm run preview            # build + wrangler dev (serve the built Worker locally)
```

- `npm run dev` is a single process — there is no separate API server to start. `@cloudflare/vite-plugin` runs `src/worker.ts` with real local D1 and Durable Object bindings inside Vite, so `ws://127.0.0.1:5173/api/sync` and D1 reads/writes behave the same in dev as in prod.
- To run a single pure-function test: `tsx --test src/core/organizer.test.ts`.
- To run a single D1/Worker test file: `npx vitest run src/core/entryStore.workers.test.ts`.
- Local D1 schema must be applied once (and after any migration changes) before `npm run dev`/`npm test` will see the right tables: `npx wrangler d1 migrations apply knowledge-db --local`.
- Remote D1 schema is applied automatically as part of `npm run deploy` (`wrangler d1 migrations apply knowledge-db --remote`, before `wrangler deploy`) — no separate manual step needed. In a non-interactive shell (CI, or this being run from an agent) wrangler skips the confirmation prompt but still takes a pre-migration backup. If a deploy ever fails with a D1 `no column named ...` error, it means the Worker got deployed without this migration step running first (e.g. a Cloudflare dashboard build that doesn't invoke `npm run deploy`) — run `npx wrangler d1 migrations apply knowledge-db --remote` directly against the account that owns `wrangler.jsonc`'s `database_id`.
- There is no separate lint script; `npm run build` runs `tsc --noEmit` for type checking. `src/**/*.workers.test.ts` is excluded from that `tsc` pass (see `tsconfig.json` `exclude`) since it depends on the `cloudflare:test` module only resolvable under the Vitest Workers pool.

## Architecture: one Worker, D1 + Durable Object

`src/worker.ts` is the sole backend, in both dev and prod — there is no local Node server. It handles all `/api/*` routes, serves static assets from `dist/client` via the `ASSETS` binding for everything else, and re-exports the `SyncHub` Durable Object class (required so Wrangler can resolve `durable_objects.bindings[].class_name` from the `main` module in `wrangler.jsonc`).

- **D1** (binding `DB`, database name `knowledge-db`) is the single source of truth. Schema is built up across `migrations/0001_init.sql` → `0002_add_command_type_and_annotation.sql` → `0003_command_only_schema.sql` → `0004_add_entry_type.sql` (each is a full SQLite table-rebuild migration, since SQLite can't `ALTER ... CHECK`/drop columns directly — see `0004` for the current pattern if another schema change is needed). The current schema is `id, title, type, body, annotation, tags, created_at, updated_at` — one `entries` table, `tags` a JSON string column (no join table), `type` a `CHECK (type IN ('command','note'))` column defaulting to `'command'`. There is no `project`/`status`/`source` field anymore. `type` is set once at creation (`CreateEntryInput.type`) and never changed by `updateEntry` — there is no UI to convert an entry from one type to the other.
- **Durable Object** `SyncHub` (`src/worker/syncHub.ts`, binding `SYNC_HUB`) is a *singleton* (`idFromName("singleton")`) that holds live WebSocket connections via the hibernatable WebSockets API (`ctx.acceptWebSocket`/`ctx.getWebSockets()`) and fans out a broadcast. Every mutating route (`POST /api/entries`, `PATCH /api/entries/:id`, `DELETE /api/entries/:id`) calls `stub.fetch(".../broadcast", ...)` after a successful D1 write. The broadcast payload is a cheap `{ type: "entries-changed", at }` signal, not a diff — clients just refetch `/api/summary` on receipt (see `subscribeToChanges` in `src/ui/api.ts`). Don't add row-level diffing to this path without a real reason; D1 reads are cheap at this app's scale.
- Any new mutating route must call `broadcast(env)` (see `src/worker.ts`) after its D1 write, or other open tabs/devices won't see the change until a manual refresh.

## Core modules (`src/core/`)

- `types.ts` — `EntryType = "command" | "note"`, `Entry { id, title, type, body, annotation, tags, createdAt, updatedAt }`, `CreateEntryInput`, `SearchFilters`, `Summary`. Deliberately minimal beyond `type` — resist adding other fields back (`project`, `status`, `source`) without an explicit ask.
- `commandRules.ts` — the actual command-domain logic, pure/no I/O, used only for the `command` entry type:
  - `extractComments(raw)` splits a pasted block into pure command lines (`body`) and any comments the user wrote themselves (`annotation`), recognizing `#`, `-- ` (dash-dash-**space**), and `// ` (slash-slash-**space**), both full-line and same-line-trailing. The required trailing space on `--`/`//` is load-bearing: it's what stops a CLI flag like `--force` from ever being misread as a `-- comment`. A `#!` shebang line is never treated as a comment.
  - `annotateCommand(body)` is a small curated `ANNOTATION_RULES` regex table (~10 tools) used only as a **fallback** guess when the user wrote no comment at all — see `organizer.ts` for the precedence.
  - `extractToolTags(body)` recognizes ~40 common CLI tool names (`TOOL_NAMES`) as the primary tag source.
- `organizer.ts` — pure/no I/O, safe to import directly into the browser bundle (see below):
  - `organizeDraft({ body, tags })` (commands): runs `extractComments`, prefers the user's own extracted comment as `annotation` and only falls back to `annotateCommand()` on the comment-stripped body when the user wrote nothing; infers `title` from the first pure command line; infers `tags` from tool names + inline `#hashtags` found *inside the annotation text* + reused existing tags, all filtered through `TAG_PATTERN`.
  - `organizeNoteDraft({ body, annotation, tags })` (notes): no comment extraction or per-tool annotation guessing — `body` is kept exactly as written, `annotation` is whatever the user typed (trimmed, no fallback guess). `title` is inferred the same way as commands (first line of `body`, via the shared `inferTitle`). Tags come only from inline `#hashtags` in `body`+`annotation` plus previously-used tags mentioned in that text — no tool-name detection, since note text isn't shell syntax.
  - Both tag-inference paths are filtered through the same `TAG_PATTERN` (`/^[a-z0-9][a-z0-9._-]{0,23}$/`), which rejects anything with a space or over 24 chars — this is what keeps tags to short core keywords instead of long descriptive phrases; do not relax this without being asked.

## UI (`src/ui/`)

- `main.tsx` — single-file React app, three views: **Capture** (paste a command, live-preview of the auto-extracted title/tags/annotation via `organizeDraft()` called **directly in the browser** — not through an API round-trip, since it's pure — with each field individually overridable before hitting Save), **Commands** (client-side text filter + tag-chip filter over `summary.entries` narrowed to `type === "command"`, a monospace command block per card, and a Copy button that copies `entry.body` only — never the annotation), and **Notes** (the same filter/tag-chip pattern narrowed to `type === "note"`; capture is a plain body + annotation textarea pair via `organizeNoteDraft()` — no split-multiple-entries toggle, no per-line copy button, since a note's body is prose/steps rather than one-command-per-line). Both Commands and Notes embed their own compact quick-add bar (`CaptureWorkspace`/`NoteCaptureWorkspace` with `compact`) inline above their list, in addition to the full-size dedicated `capture` tab (commands only).
- A saved note's `body` is rendered as Markdown (`react-markdown`, no `rehype-raw`/`dangerouslySetInnerHTML` — so raw HTML in a note is never executed, only markdown syntax) in `NoteCard`, styled via `.note-body` in `styles.css`. The *editor* stays a plain textarea — there's no live WYSIWYG preview while typing, only on the saved card. Commands are unaffected; `entry.body` there stays plain preformatted text (it must remain byte-identical to what Copy puts on the clipboard).
- `api.ts` — thin fetch wrapper around `/api/*` (`getSummary`, `createEntry`, `updateEntry`, `deleteEntry`), plus `subscribeToChanges(onChange)` for the `/api/sync` WebSocket (auto-reconnects with backoff on close). There is no `/api/search` or `/api/organize` route — search/organize both happen client-side now that there's no server-only state they depend on. Generic across both entry types — routes don't branch on `type`.

## Testing split

- `src/core/organizer.test.ts`, `src/ui/api.test.ts` — plain `node:test`, no Workers runtime needed.
- `src/core/entryStore.workers.test.ts`, `src/worker.workers.test.ts` — run inside the real `workerd` runtime via `@cloudflare/vitest-pool-workers` (`vitest.config.ts`), with a real local D1 instance (migrated via `test/applyMigrations.ts` + `applyD1Migrations`) and real Durable Object bindings, including genuine WebSocket semantics. New Workers-runtime tests must be named `*.workers.test.ts` to be picked up (see `vitest.config.ts` `test.include`) and must **not** match `src/**/*.test.ts` in a way that would make `tsx --test` try to run them — `package.json`'s `test` script lists the `node:test` files explicitly rather than globbing, on purpose.

## Deployment / going live

- `wrangler.jsonc`'s `database_id` is a placeholder (`REPLACE_WITH_DATABASE_ID_FROM_WRANGLER_D1_CREATE`) until someone runs `wrangler login` then `wrangler d1 create knowledge-db` and pastes the real ID in. After that, `npm run deploy` applies remote migrations itself (see the `## Commands` section) — no separate manual `wrangler d1 migrations apply --remote` step in the normal flow.
- **There is no authentication anywhere in this app.** It's meant to sit behind a Cloudflare Access application (requires attaching a custom domain to the Worker first — Access policies are documented against custom domains, not bare `workers.dev` subdomains) rather than any in-app login. Don't add app-level auth code unless that decision changes; if Access turns out not to cleanly gate the `/api/sync` WebSocket upgrade, the documented fallback is a shared-secret header/cookie check applied uniformly to all routes in `worker.ts`.
- `dist/client` is committed (see the `dist/*` / `!dist/client/**` carve-out in `.gitignore`) for Cloudflare dashboard build setups that run `wrangler deploy` with no build step — refresh it with `npm run build` before committing app changes if that's the deploy path in use. `dist/<worker-name>` (the SSR worker bundle) is not committed.

## Secret scanning (repo-level, separate from `secretScanner.ts`)

Two things named similarly, don't conflate them:
- `src/core/secretScanner.ts` is an **app feature** — advisory, in-browser warnings when a *user pastes a command* that looks like it contains a secret. Scoped to command text only.
- `.gitleaks.toml` + `.githooks/pre-commit` + `.github/workflows/secret-scan.yml` is **repo tooling** — hard-blocks *git commits/PRs to this repository* that contain secrets, credentialed URLs, any URL, any IPv4, or (once populated) denylisted names. `npm install` wires the local hook via the `prepare` script (`git config core.hooksPath .githooks`); CI is the real backstop since the local hook can be skipped with `--no-verify`.
- Git only invokes a hook file named exactly `pre-commit` (no extension) under `core.hooksPath` — this silently fails to fire if renamed with an extension.
- Both the hook and CI must run `gitleaks` with `--source .` (relative, from repo root), not an absolute path — `.gitleaks.toml`'s `[allowlist].paths` regexes are anchored (`^dist/.*` etc.) and won't match absolute paths.
- `any-url`/`any-ipv4` are intentionally broad and *will* flag legitimate infra/doc content, not just real secrets — false positives get cleared via `[allowlist].paths` for whole files that are inherently full of legitimate URLs (CI/tooling scripts) or an inline `// gitleaks:allow` comment for a one-off legitimate line inside application source (keeps the rest of that file scanned).
