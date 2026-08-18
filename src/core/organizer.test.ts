import assert from "node:assert/strict";
import test from "node:test";
import { organizeDraft, organizeDrafts } from "./organizer.js";

test("prefers the user's own comment as the annotation over the curated guess", () => {
  const result = organizeDraft({ body: "# revert last commit\ngit reset HEAD~1", tags: [] });

  assert.equal(result.body, "git reset HEAD~1");
  assert.equal(result.annotation, "revert last commit");
  assert.ok(result.tags.includes("git"));
});

test("falls back to the curated rule guess when the user wrote no comment", () => {
  const result = organizeDraft({ body: "git push --force", tags: [] });

  assert.equal(result.body, "git push --force");
  assert.equal(result.annotation, "强制推送，会覆盖远程分支历史，谨慎使用");
});

test("leaves annotation empty when there is no comment and no curated match", () => {
  const result = organizeDraft({ body: "ls -la", tags: [] });

  assert.equal(result.annotation, "");
  assert.ok(result.tags.includes("ls"));
});

test("generates title from the first pure command line, not from a comment line", () => {
  const result = organizeDraft({ body: "# housekeeping\ndocker system prune -af", tags: [] });

  assert.equal(result.title, "docker system prune -af");
});

test("keeps tags to short core keywords and rejects an overly long reused tag even when it's mentioned in the text", () => {
  const longTag = "docker-cleanup-and-prune-everything-unused";
  const result = organizeDraft({
    body: `# ${longTag} note\ndocker system prune -af`,
    tags: [longTag]
  });

  assert.ok(result.tags.every((tag) => tag.length <= 24 && !tag.includes(" ")));
  assert.deepEqual(result.tags, ["docker"]);
});

test("extracts an inline hashtag from the user's comment as a tag", () => {
  const result = organizeDraft({ body: "# rollback for #hotfix\ngit reset HEAD~1", tags: [] });

  assert.ok(result.tags.includes("hotfix"));
});

test("organizeDrafts splits a multi-command paste into separate drafts when split is true", () => {
  const results = organizeDrafts({ body: "# check status\ngit status\n# force push\ngit push --force", tags: [], split: true });

  assert.equal(results.length, 2);
  assert.equal(results[0].body, "git status");
  assert.equal(results[0].annotation, "check status");
  assert.equal(results[1].body, "git push --force");
  assert.equal(results[1].annotation, "force push");
});

test("organizeDrafts keeps a multi-command paste as one draft when split is false", () => {
  const results = organizeDrafts({ body: "git status\ngit push --force", tags: [], split: false });

  assert.equal(results.length, 1);
  assert.equal(results[0].body, "git status\ngit push --force");
});

test("organizeDrafts returns a single draft for a single command regardless of split", () => {
  const split = organizeDrafts({ body: "git status", tags: [], split: true });
  const combined = organizeDrafts({ body: "git status", tags: [], split: false });

  assert.equal(split.length, 1);
  assert.equal(combined.length, 1);
  assert.deepEqual(split[0], combined[0]);
});

test("a combined multi-command draft keeps per-line comments inline instead of stripping them", () => {
  const result = organizeDraft({ body: "git fetch\n# force push\ngit push --force", tags: [] });

  assert.equal(result.body, "git fetch\n# force push\ngit push --force");
});

test("a combined multi-command draft never treats the first command's own comment as a special overview — it stays inline and in the summary like any other", () => {
  const result = organizeDraft({ body: "# weekly cleanup routine\ngit fetch\n# force push\ngit push --force", tags: [] });

  assert.equal(result.body, "# weekly cleanup routine\ngit fetch\n# force push\ngit push --force");
  assert.equal(result.annotation, "weekly cleanup routine\nforce push");
  assert.equal(result.title, "git fetch");
});

test("a combined multi-command draft extracts a genuine overview only when it's separated from the first command by a blank line", () => {
  const result = organizeDraft({ body: "# weekly cleanup routine\n\ngit fetch\n# force push\ngit push --force", tags: [] });

  assert.equal(result.annotation, "weekly cleanup routine");
  assert.equal(result.body, "git fetch\n# force push\ngit push --force");
  assert.equal(result.title, "git fetch");
});

test("a combined multi-command draft summarizes all per-line comments as the annotation", () => {
  const result = organizeDraft({ body: "git fetch\n# force push\ngit push --force", tags: [] });

  assert.equal(result.annotation, "force push");
});

test("a combined multi-command draft falls back to the curated guess when there are no comments anywhere", () => {
  const result = organizeDraft({ body: "git status\ngit push --force", tags: [] });

  assert.equal(result.annotation, "查看 Git 工作区和暂存区状态\n强制推送，会覆盖远程分支历史，谨慎使用");
  assert.equal(result.body, "git status\ngit push --force");
});
