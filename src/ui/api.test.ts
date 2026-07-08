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

test("reports a clear error when an API response is HTML", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<!doctype html><html></html>", {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });

  try {
    await assert.rejects(
      getSummary(),
      /Expected JSON from \/api\/summary but received text\/html/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
