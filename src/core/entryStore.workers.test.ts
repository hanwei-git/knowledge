import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createEntry, deleteEntry, getSummary, searchEntries, updateEntry } from "./entryStore.js";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM entries");
});

describe("entryStore", () => {
  it("creates an entry and returns it in the summary", async () => {
    const created = await createEntry(env.DB, {
      title: "Redis pool exhausted",
      type: "troubleshooting",
      project: "ap2",
      tags: ["redis", "incident"],
      status: "active",
      source: "",
      body: "Connections leaked under load."
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Redis pool exhausted");

    const summary = await getSummary(env.DB);
    expect(summary.entries).toHaveLength(1);
    expect(summary.projects).toEqual(["ap2"]);
    expect(summary.tags).toEqual(["incident", "redis"]);
  });

  it("updates an entry", async () => {
    const created = await createEntry(env.DB, {
      title: "Draft note",
      type: "note",
      project: "",
      tags: [],
      status: "draft",
      source: "",
      body: "Rough thought."
    });

    const updated = await updateEntry(env.DB, created.id, { project: "ap2", status: "active" });
    expect(updated.project).toBe("ap2");
    expect(updated.status).toBe("active");
    expect(updated.updatedAt >= created.createdAt).toBe(true);
  });

  it("deletes an entry", async () => {
    const created = await createEntry(env.DB, {
      title: "Temp",
      type: "note",
      project: "",
      tags: [],
      status: "draft",
      source: "",
      body: "Delete me."
    });

    await deleteEntry(env.DB, created.id);
    const summary = await getSummary(env.DB);
    expect(summary.entries).toHaveLength(0);
  });

  it("searches by query, project, type, tag, and status", async () => {
    await createEntry(env.DB, {
      title: "Kubernetes rollout runbook",
      type: "runbook",
      project: "ap2",
      tags: ["kubernetes"],
      status: "active",
      source: "",
      body: "Steps to roll out safely."
    });
    await createEntry(env.DB, {
      title: "Unrelated note",
      type: "note",
      project: "",
      tags: [],
      status: "draft",
      source: "",
      body: "Nothing to see here."
    });

    const results = await searchEntries(env.DB, { query: "rollout", project: "ap2", type: "runbook", tag: "kubernetes", status: "active" });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Kubernetes rollout runbook");
  });
});
