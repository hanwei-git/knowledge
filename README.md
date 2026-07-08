# Engineering Knowledge Wiki

A local-first Web app for building a personal engineering knowledge wiki from Markdown files.

The app is designed around project/system pages, an Inbox for quick capture, structured engineering templates, full-text search, and local Git history.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://127.0.0.1:5173`.

The API server listens on `http://127.0.0.1:4317`; Vite proxies `/api` calls to it.

## Build and Test

```bash
npm test
npm run build
```

## Deploy

The Cloudflare Worker is named in `wrangler.jsonc`. Deploy from the repository root so Wrangler updates the existing `knowledge` Worker:

```bash
npm run deploy
```

## Data Layout

Knowledge is stored as portable Markdown under `knowledge/`:

```text
knowledge/
  inbox/
  projects/
    project-slug/
      index.md
      troubleshooting/
      decisions/
      references/
      runbooks/
  indexes/
```

Each Markdown file has frontmatter:

```yaml
---
title: "Redis connection pool exhausted"
type: "troubleshooting"
project: "order-system"
tags: ["redis", "incident"]
status: "active"
createdAt: "2026-07-06"
updatedAt: "2026-07-06"
source: ""
---
```

## Scope

First version:

- Local Web app
- Markdown as the source of truth
- Project-first Wiki organization
- Inbox capture and archive flow
- Full-text search with filters
- Local Git status, diff, log, and commit for `knowledge/`

Not included in v1:

- AI features
- Remote sync
- Multi-user collaboration
- Branching, pushing, or conflict resolution
