import assert from "node:assert/strict";
import test from "node:test";
import { buildGitCommands, parseGitStatus } from "./gitService.js";

test("parses porcelain status into readable file changes", () => {
  const changes = parseGitStatus(" M knowledge/inbox/a.md\n?? knowledge/projects/order/index.md\nA  README.md\n");

  assert.deepEqual(changes, [
    { code: "M", path: "knowledge/inbox/a.md", staged: false },
    { code: "?", path: "knowledge/projects/order/index.md", staged: false },
    { code: "A", path: "README.md", staged: true }
  ]);
});

test("builds local-only git commands for status, diff, log, and commit", () => {
  assert.deepEqual(buildGitCommands("C:/repo", "Capture Redis note"), {
    status: ["git", "-C", "C:/repo", "status", "--porcelain"],
    diff: ["git", "-C", "C:/repo", "diff", "--", "knowledge"],
    log: ["git", "-C", "C:/repo", "log", "--oneline", "-20", "--", "knowledge"],
    add: ["git", "-C", "C:/repo", "add", "knowledge"],
    commit: ["git", "-C", "C:/repo", "commit", "-m", "Capture Redis note"]
  });
});
