import assert from "node:assert/strict";
import test from "node:test";
import { getSummary } from "./api.js";

test("reports an HTTP error when an API response has an empty body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 502, statusText: "Bad Gateway" });

  try {
    await assert.rejects(
      getSummary(),
      /Request failed with status 502 Bad Gateway/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
