import assert from "node:assert/strict";
import test from "node:test";
import { organizeDraft } from "./organizer.js";
import type { ProjectWiki } from "./types.js";

const projects: ProjectWiki[] = [
  {
    slug: "ap2",
    title: "AP2 Platform",
    summary: "Application platform knowledge.",
    groups: {} as ProjectWiki["groups"],
    recent: []
  },
  {
    slug: "billing-system",
    title: "Billing System",
    summary: "Payment and invoice knowledge.",
    groups: {} as ProjectWiki["groups"],
    recent: []
  }
];

test("infers project from existing project title and slug", () => {
  const byTitle = organizeDraft({
    body: "AP2 Platform deployment failed during rollout.",
    projects,
    tags: []
  });
  const bySlug = organizeDraft({
    body: "ap2 rollback notes after timeout.",
    projects,
    tags: []
  });

  assert.equal(byTitle.project, "ap2");
  assert.equal(byTitle.saveTarget, "project");
  assert.equal(byTitle.status, "active");
  assert.equal(bySlug.project, "ap2");
});

test("infers troubleshooting, decision, runbook, reference, and note fallback types", () => {
  assert.equal(organizeDraft({ body: "Error timeout root cause fixed and verified.", projects, tags: [] }).type, "troubleshooting");
  assert.equal(organizeDraft({ body: "Decision: choose option B. Trade-off is slower recovery.", projects, tags: [] }).type, "decision");
  assert.equal(organizeDraft({ body: "Checklist steps: run command sequence, verify, rollback if needed.", projects, tags: [] }).type, "runbook");
  assert.equal(organizeDraft({ body: "https://example.test/docs\nhttps://example.test/article\nSource summary notes.", projects, tags: [] }).type, "reference");
  assert.equal(organizeDraft({ body: "Remember to revisit platform naming.", projects, tags: [] }).type, "note");
});

test("extracts inline tags, technical keywords, and existing tags", () => {
  const result = organizeDraft({
    body: "Redis timeout in #AP2 while checking Kubernetes logs and postgres metrics.",
    projects,
    tags: ["incident", "kubernetes", "postgres"]
  });

  assert.deepEqual(result.tags, ["ap2", "redis", "kubernetes", "postgres"]);
});

test("generates title from Markdown heading or first meaningful line", () => {
  const heading = organizeDraft({
    body: "\n# Redis outage notes\n\nRequests timed out.",
    projects,
    tags: []
  });
  const firstLine = organizeDraft({
    body: "\n\nBilling queue replay failed because the gateway timed out and this title is intentionally long enough to be truncated at a readable boundary.",
    projects,
    tags: []
  });

  assert.equal(heading.title, "Redis outage notes");
  assert.ok(firstLine.title.length <= 72);
  assert.match(firstLine.title, /^Billing queue replay failed/);
});

test("returns inbox draft target when no project is matched", () => {
  const result = organizeDraft({
    body: "Loose note that does not mention a known project.",
    projects,
    tags: []
  });

  assert.equal(result.project, "");
  assert.equal(result.status, "draft");
  assert.equal(result.saveTarget, "inbox");
});
