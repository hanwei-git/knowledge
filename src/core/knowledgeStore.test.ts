import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  archiveInboxEntry,
  createEntry,
  createProject,
  listInbox,
  listProjects,
  searchEntries
} from "./knowledgeStore.js";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "knowledge-store-"));
}

test("creates inbox entries as portable Markdown with frontmatter", async () => {
  const root = await tempRoot();

  const entry = await createEntry(root, {
    title: "Redis connection pool exhausted",
    type: "troubleshooting",
    project: "",
    tags: ["redis", "incident"],
    status: "draft",
    source: "https://example.test/redis",
    body: "Symptom: requests timeout."
  });

  assert.equal(entry.metadata.title, "Redis connection pool exhausted");
  assert.equal(entry.metadata.type, "troubleshooting");
  assert.equal(entry.metadata.project, "");
  assert.match(entry.relativePath, /^inbox\/\d{4}-\d{2}-\d{2}-redis-connection-pool-exhausted\.md$/);

  const file = await readFile(join(root, "knowledge", entry.relativePath), "utf8");
  assert.match(file, /^---\ntitle: "Redis connection pool exhausted"/);
  assert.match(file, /tags: \["redis", "incident"\]/);
  assert.match(file, /source: "https:\/\/example\.test\/redis"/);
  assert.match(file, /Symptom: requests timeout\./);
});

test("archives inbox entries into project category folders and updates metadata", async () => {
  const root = await tempRoot();
  const inboxEntry = await createEntry(root, {
    title: "OAuth callback mismatch",
    type: "troubleshooting",
    project: "",
    tags: ["oauth"],
    status: "draft",
    source: "",
    body: "Callback URI differs by environment."
  });

  const archived = await archiveInboxEntry(root, inboxEntry.relativePath, {
    project: "identity-platform",
    type: "troubleshooting",
    tags: ["oauth", "login"],
    status: "active"
  });

  assert.equal(archived.metadata.project, "identity-platform");
  assert.equal(archived.metadata.status, "active");
  assert.deepEqual(archived.metadata.tags, ["oauth", "login"]);
  assert.equal(archived.relativePath, "projects/identity-platform/troubleshooting/oauth-callback-mismatch.md");

  const inbox = await listInbox(root);
  assert.equal(inbox.length, 0);
});

test("lists project wiki pages with grouped entries and recent updates", async () => {
  const root = await tempRoot();

  await createProject(root, {
    slug: "billing-system",
    title: "Billing System",
    summary: "Payment and invoice knowledge."
  });
  await createEntry(root, {
    title: "Invoice retry decision",
    type: "decision",
    project: "billing-system",
    tags: ["invoice"],
    status: "active",
    source: "",
    body: "Use delayed retry for transient gateway errors."
  });
  await createEntry(root, {
    title: "Gateway timeout runbook",
    type: "runbook",
    project: "billing-system",
    tags: ["gateway"],
    status: "active",
    source: "",
    body: "Check gateway health before replay."
  });

  const projects = await listProjects(root);
  const project = projects.find((item) => item.slug === "billing-system");

  assert.ok(project);
  assert.equal(project.title, "Billing System");
  assert.equal(project.groups.decision.length, 1);
  assert.equal(project.groups.runbook.length, 1);
  assert.equal(project.recent.length, 2);
});

test("searches Markdown content with project, type, tag, and status filters", async () => {
  const root = await tempRoot();

  await createEntry(root, {
    title: "Redis pool incident",
    type: "troubleshooting",
    project: "order-system",
    tags: ["redis", "incident"],
    status: "active",
    source: "",
    body: "Connection pool saturation caused checkout timeout."
  });
  await createEntry(root, {
    title: "Redis study note",
    type: "reference",
    project: "learning",
    tags: ["redis"],
    status: "draft",
    source: "",
    body: "General notes about Redis persistence."
  });

  const results = await searchEntries(root, {
    query: "checkout",
    project: "order-system",
    type: "troubleshooting",
    tag: "incident",
    status: "active"
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].metadata.title, "Redis pool incident");
  assert.match(results[0].excerpt, /checkout timeout/);
});
