import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.js";

const env = {
  ASSETS: {
    fetch: async () => new Response("<!doctype html><html></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  }
};

test("worker returns JSON for summary instead of falling back to HTML", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/summary"), env);

  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  const payload = await response.json() as { entries: unknown[]; projects: unknown[]; inbox: unknown[]; tags: unknown[] };
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(payload.entries), true);
  assert.equal(Array.isArray(payload.projects), true);
  assert.equal(Array.isArray(payload.inbox), true);
  assert.equal(Array.isArray(payload.tags), true);
});

test("worker returns JSON errors for unsupported API routes", async () => {
  const response = await worker.fetch(new Request("https://example.com/api/entries", { method: "POST" }), env);

  assert.equal(response.status, 501);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), {
    error: "This Cloudflare deployment is read-only. Run the local app for write and Git operations."
  });
});
