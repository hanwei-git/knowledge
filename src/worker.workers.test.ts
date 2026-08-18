import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM entries");
});

describe("worker API", () => {
  it("creates, reads, updates, and deletes an entry", async () => {
    const createResponse = await SELF.fetch("https://example.com/api/entries", {
      method: "POST",
      body: JSON.stringify({ title: "Note", type: "note", project: "", tags: [], status: "draft", source: "", body: "Body" })
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { id: string };

    const summaryResponse = await SELF.fetch("https://example.com/api/summary");
    const summary = await summaryResponse.json() as { entries: unknown[] };
    expect(summary.entries).toHaveLength(1);

    const patchResponse = await SELF.fetch(`https://example.com/api/entries/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ project: "ap2", status: "active" })
    });
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json() as { project: string };
    expect(patched.project).toBe("ap2");

    const deleteResponse = await SELF.fetch(`https://example.com/api/entries/${created.id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(204);
  });

  it("organizes a draft using stored projects and tags", async () => {
    await SELF.fetch("https://example.com/api/entries", {
      method: "POST",
      body: JSON.stringify({ title: "AP2 home", type: "note", project: "ap2", tags: ["redis"], status: "active", source: "", body: "x" })
    });

    const response = await SELF.fetch("https://example.com/api/organize", {
      method: "POST",
      body: JSON.stringify({ body: "AP2 redis timeout during rollout." })
    });
    const organized = await response.json() as { project: string };
    expect(organized.project).toBe("ap2");
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
      body: JSON.stringify({ title: "Note", type: "note", project: "", tags: [], status: "draft", source: "", body: "Body" })
    });

    const payload = JSON.parse(await message) as { type: string };
    expect(payload.type).toBe("entries-changed");
  });
});
