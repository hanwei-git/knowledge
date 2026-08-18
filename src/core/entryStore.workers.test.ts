import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createEntry, deleteEntry, getSummary, updateEntry } from "./entryStore.js";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM entries");
});

describe("entryStore", () => {
  it("creates a command entry and returns it in the summary", async () => {
    const created = await createEntry(env.DB, {
      title: "Revert last commit",
      type: "command",
      body: "git reset HEAD~1",
      annotation: "还原最近一个提交到stage",
      tags: ["git"]
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Revert last commit");
    expect(created.type).toBe("command");
    expect(created.body).toBe("git reset HEAD~1");
    expect(created.annotation).toBe("还原最近一个提交到stage");

    const summary = await getSummary(env.DB);
    expect(summary.entries).toHaveLength(1);
    expect(summary.tags).toEqual(["git"]);
  });

  it("creates a note entry", async () => {
    const created = await createEntry(env.DB, {
      title: "Deploy checklist",
      type: "note",
      body: "1. Run tests\n2. Tag release\n3. Deploy",
      annotation: "Steps for a manual release",
      tags: ["release"]
    });

    expect(created.type).toBe("note");
    expect(created.body).toBe("1. Run tests\n2. Tag release\n3. Deploy");

    const summary = await getSummary(env.DB);
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].type).toBe("note");
  });

  it("updates an entry", async () => {
    const created = await createEntry(env.DB, {
      title: "Draft",
      type: "command",
      body: "docker ps",
      annotation: "",
      tags: []
    });

    const updated = await updateEntry(env.DB, created.id, { tags: ["docker"], annotation: "list running containers" });
    expect(updated.tags).toEqual(["docker"]);
    expect(updated.annotation).toBe("list running containers");
    expect(updated.updatedAt >= created.createdAt).toBe(true);
  });

  it("deletes an entry", async () => {
    const created = await createEntry(env.DB, {
      title: "Temp",
      type: "command",
      body: "echo hi",
      annotation: "",
      tags: []
    });

    await deleteEntry(env.DB, created.id);
    const summary = await getSummary(env.DB);
    expect(summary.entries).toHaveLength(0);
  });
});
