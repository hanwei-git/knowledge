import assert from "node:assert/strict";
import test from "node:test";
import { formatNoteBody, organizeDraft, organizeDrafts, organizeNoteDraft } from "./organizer.js";

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

test("carries tags forward from a previously-saved command with the same tool and flags, even though the trailing argument differs", () => {
  const entries = [
    {
      id: "1",
      title: "kubectl rollout restart deployment/api",
      type: "command" as const,
      body: "kubectl rollout restart deployment/api",
      annotation: "",
      tags: ["prod-cluster"],
      createdAt: "",
      updatedAt: ""
    }
  ];
  const result = organizeDraft({ body: "kubectl rollout restart deployment/web", tags: [], entries });

  assert.ok(result.tags.includes("prod-cluster"));
});

test("does not carry tags forward when the tool or flags differ", () => {
  const entries = [
    {
      id: "1",
      title: "kubectl get pods -n prod",
      type: "command" as const,
      body: "kubectl get pods -n prod",
      annotation: "",
      tags: ["prod-cluster"],
      createdAt: "",
      updatedAt: ""
    }
  ];
  const differentTool = organizeDraft({ body: "docker ps -a", tags: [], entries });
  assert.ok(!differentTool.tags.includes("prod-cluster"));

  const differentFlags = organizeDraft({ body: "kubectl get pods --all-namespaces", tags: [], entries });
  assert.ok(!differentFlags.tags.includes("prod-cluster"));
});

test("organizeNoteDraft infers a title from the first line and leaves the body untouched", () => {
  const result = organizeNoteDraft({
    body: "1. Take a DB snapshot\n2. Run the migration\n3. Verify row counts",
    annotation: "",
    tags: []
  });

  assert.equal(result.title, "1. Take a DB snapshot");
});

test("organizeNoteDraft does not strip # lines the way command comment extraction does", () => {
  const result = organizeNoteDraft({
    body: "# Deploy steps\n1. Build\n2. Push",
    annotation: "",
    tags: []
  });

  assert.equal(result.title, "# Deploy steps");
});

test("organizeNoteDraft extracts an inline hashtag as a tag", () => {
  const result = organizeNoteDraft({
    body: "Steps to rotate credentials #security",
    annotation: "",
    tags: []
  });

  assert.ok(result.tags.includes("security"));
});

test("organizeNoteDraft reuses an existing tag mentioned in the text", () => {
  const result = organizeNoteDraft({
    body: "Runbook for the onboarding flow",
    annotation: "covers onboarding end to end",
    tags: ["onboarding"]
  });

  assert.ok(result.tags.includes("onboarding"));
});

test("organizeNoteDraft trims the annotation and leaves it empty when not provided", () => {
  const result = organizeNoteDraft({ body: "Some steps", annotation: "  ", tags: [] });

  assert.equal(result.annotation, "");
});

test("formatNoteBody flush-lefts plain paragraph lines, stripping stray leading whitespace", () => {
  const result = formatNoteBody("  Some intro text\n    with a stray indent");

  assert.equal(result, "Some intro text\nwith a stray indent");
});

test("formatNoteBody snaps ragged list indentation to a consistent 2-spaces-per-level nesting", () => {
  const result = formatNoteBody(
    "1. Step one\n   - sub a\n     - sub sub\n   - sub b\n2. Step two"
  );

  assert.equal(
    result,
    "1. Step one\n  - sub a\n    - sub sub\n  - sub b\n2. Step two"
  );
});

test("formatNoteBody inserts a blank-line section break between a list block and surrounding paragraph text", () => {
  const result = formatNoteBody("Deploy steps\n1. Build\n2. Push\nDone for today");

  assert.equal(result, "Deploy steps\n\n1. Build\n2. Push\n\nDone for today");
});

test("formatNoteBody collapses runs of multiple blank lines to a single one", () => {
  const result = formatNoteBody("First paragraph\n\n\n\nSecond paragraph");

  assert.equal(result, "First paragraph\n\nSecond paragraph");
});

test("formatNoteBody trims leading and trailing blank lines", () => {
  const result = formatNoteBody("\n\nHello\n\n");

  assert.equal(result, "Hello");
});

test("formatNoteBody never mistakes a decimal number or a horizontal rule for a list item", () => {
  const result = formatNoteBody("  3.14 is pi\n---");

  assert.equal(result, "3.14 is pi\n---");
});

test("organizeDrafts carries similar-command tags into every split draft that matches", () => {
  const entries = [
    {
      id: "1",
      title: "kubectl rollout restart deployment/api",
      type: "command" as const,
      body: "kubectl rollout restart deployment/api",
      annotation: "",
      tags: ["prod-cluster"],
      createdAt: "",
      updatedAt: ""
    }
  ];
  const results = organizeDrafts({
    body: "kubectl rollout restart deployment/web\nkubectl rollout restart deployment/worker",
    tags: [],
    entries,
    split: true
  });

  assert.equal(results.length, 2);
  assert.ok(results[0].tags.includes("prod-cluster"));
  assert.ok(results[1].tags.includes("prod-cluster"));
});
