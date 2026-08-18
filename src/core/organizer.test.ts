import assert from "node:assert/strict";
import test from "node:test";
import { organizeDraft } from "./organizer.js";

const projects = ["ap2", "billing-system"];

test("infers project from an existing project value mentioned in the body", () => {
  const byName = organizeDraft({
    body: "AP2 deployment failed during rollout.",
    projects,
    tags: []
  });
  const lowerCase = organizeDraft({
    body: "ap2 rollback notes after timeout.",
    projects,
    tags: []
  });

  assert.equal(byName.project, "ap2");
  assert.equal(byName.saveTarget, "project");
  assert.equal(byName.status, "active");
  assert.equal(lowerCase.project, "ap2");
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

test("classifies a recognized command block as type command with an auto-generated annotation and tool tags", () => {
  const result = organizeDraft({ body: "git push --force", projects, tags: [] });

  assert.equal(result.type, "command");
  assert.equal(result.annotation, "强制推送，会覆盖远程分支历史，谨慎使用");
  assert.ok(result.tags.includes("git"));
});

test("classifies a recognized tool with no curated annotation rule as command with an empty annotation", () => {
  const result = organizeDraft({ body: "ls -la", projects, tags: [] });

  assert.equal(result.type, "command");
  assert.equal(result.annotation, "");
});

test("does not misclassify prose that only mentions a command as type command", () => {
  const result = organizeDraft({ body: "some-obscure-tool --flag", projects, tags: [] });

  assert.notEqual(result.type, "command");
  assert.equal(result.annotation, "");
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
