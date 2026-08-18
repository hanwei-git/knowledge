import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM entries");
});

describe("worker API", () => {
  it("creates, reads, updates, and deletes a command entry", async () => {
    const createResponse = await SELF.fetch("https://example.com/api/entries", {
      method: "POST",
      body: JSON.stringify({ title: "Revert last commit", body: "git reset HEAD~1", annotation: "还原最近一个提交到stage", tags: ["git"] })
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { id: string };

    const summaryResponse = await SELF.fetch("https://example.com/api/summary");
    const summary = await summaryResponse.json() as { entries: unknown[]; tags: string[] };
    expect(summary.entries).toHaveLength(1);
    expect(summary.tags).toEqual(["git"]);

    const patchResponse = await SELF.fetch(`https://example.com/api/entries/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ tags: ["git", "rollback"] })
    });
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json() as { tags: string[] };
    expect(patched.tags).toEqual(["git", "rollback"]);

    const deleteResponse = await SELF.fetch(`https://example.com/api/entries/${created.id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(204);
  });

  it("broadcasts a change over the sync WebSocket after a mutation", async () => {
    const upgrade = await SELF.fetch("https://example.com/api/sync", {
      headers: { Upgrade: "websocket" }
    });
    const socket = upgrade.webSocket;
    if (!socket) {
      throw new Error("Expected a WebSocket upgrade response.");
    }
    socket.accept();

    const message = new Promise<string>((resolve) => {
      socket.addEventListener("message", (event) => resolve(event.data as string));
    });

    await SELF.fetch("https://example.com/api/entries", {
      method: "POST",
      body: JSON.stringify({ title: "Note", body: "echo hi", annotation: "", tags: [] })
    });

    const payload = JSON.parse(await message) as { type: string };
    expect(payload.type).toBe("entries-changed");
  });
});
