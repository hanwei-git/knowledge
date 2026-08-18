import assert from "node:assert/strict";
import test from "node:test";
import { organizeDraft } from "./organizer.js";

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
