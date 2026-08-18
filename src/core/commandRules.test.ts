import assert from "node:assert/strict";
import test from "node:test";
import { annotateCommand, commandSignature, extractComments, extractSeparatedOverview, extractToolTags, isCommentLine, normalizeCommandBody, skipLeadingComments, splitCommandUnits } from "./commandRules.js";

test("extractComments splits a full-line # comment from the command", () => {
  const result = extractComments("#还原最近一个提交到stage\ngit reset HEAD~1");
  assert.equal(result.body, "git reset HEAD~1");
  assert.equal(result.annotation, "还原最近一个提交到stage");
});

test("extractComments splits a trailing # comment from the command", () => {
  const result = extractComments("git reset HEAD~1  # go back one commit");
  assert.equal(result.body, "git reset HEAD~1");
  assert.equal(result.annotation, "go back one commit");
});

test("extractComments recognizes -- and // comment styles but never CLI flags", () => {
  const dashComment = extractComments("SELECT 1;\n-- fetch a sanity row");
  assert.equal(dashComment.body, "SELECT 1;");
  assert.equal(dashComment.annotation, "fetch a sanity row");

  const slashComment = extractComments("console.log(x); // debug output");
  assert.equal(slashComment.body, "console.log(x);");
  assert.equal(slashComment.annotation, "debug output");

  const flag = extractComments("git push --force");
  assert.equal(flag.body, "git push --force");
  assert.equal(flag.annotation, "");
});

test("extractComments never strips a shebang line", () => {
  const result = extractComments("#!/bin/bash\necho hi");
  assert.equal(result.body, "#!/bin/bash\necho hi");
  assert.equal(result.annotation, "");
});

test("extractComments does not false-positive on URLs containing # or //", () => {
  const result = extractComments("curl https://example.com/path#section");
  assert.equal(result.body, "curl https://example.com/path#section");
  assert.equal(result.annotation, "");
});

test("extractComments returns no annotation when nothing is commented", () => {
  const result = extractComments("docker ps");
  assert.equal(result.body, "docker ps");
  assert.equal(result.annotation, "");
});

test("annotateCommand explains recognized commands and skips unrecognized ones", () => {
  assert.equal(annotateCommand("git push --force"), "强制推送，会覆盖远程分支历史，谨慎使用");
  assert.equal(annotateCommand("git status"), "查看 Git 工作区和暂存区状态");
  assert.equal(annotateCommand("docker system prune -af --volumes"), "清理未使用的 Docker 容器、网络和镜像");
  assert.equal(annotateCommand("some-obscure-tool --flag"), "");
});

test("extractToolTags pulls out distinct tool names", () => {
  assert.deepEqual(extractToolTags("docker build .\nkubectl apply -f deploy.yaml\ndocker ps"), ["docker", "kubectl"]);
  assert.deepEqual(extractToolTags("Just a note with no commands."), []);
});

test("splitCommandUnits pairs each command with its own preceding comment", () => {
  const units = splitCommandUnits("# check status\ngit status\n# force push\ngit push --force");
  assert.deepEqual(units, [
    { body: "git status", annotation: "check status" },
    { body: "git push --force", annotation: "force push" }
  ]);
});

test("splitCommandUnits splits consecutive command lines with no comment between them", () => {
  const units = splitCommandUnits("git status\ngit push --force");
  assert.deepEqual(units, [
    { body: "git status", annotation: "" },
    { body: "git push --force", annotation: "" }
  ]);
});

test("splitCommandUnits attaches a trailing same-line comment only to its own line", () => {
  const units = splitCommandUnits("git status # check first\ngit push --force");
  assert.deepEqual(units, [
    { body: "git status", annotation: "check first" },
    { body: "git push --force", annotation: "" }
  ]);
});

test("splitCommandUnits does not carry a comment over to a second command line", () => {
  const units = splitCommandUnits("# housekeeping\ngit fetch\ngit gc");
  assert.deepEqual(units, [
    { body: "git fetch", annotation: "housekeeping" },
    { body: "git gc", annotation: "" }
  ]);
});

test("splitCommandUnits ignores blank lines between commands", () => {
  const units = splitCommandUnits("git status\n\ngit push --force");
  assert.equal(units.length, 2);
});

test("normalizeCommandBody collapses whitespace differences but preserves case", () => {
  assert.equal(normalizeCommandBody("git   status\n"), "git status");
  assert.equal(normalizeCommandBody("  git status  "), "git status");
  assert.equal(normalizeCommandBody("git status"), normalizeCommandBody("  git   status  "));
  assert.notEqual(normalizeCommandBody("Git Status"), normalizeCommandBody("git status"));
});

test("normalizeCommandBody normalizes whitespace per line for multi-line bodies", () => {
  assert.equal(normalizeCommandBody("git fetch\n  git   merge origin/main  "), "git fetch\ngit merge origin/main");
});

test("skipLeadingComments skips past a leading comment block to find the first real command", () => {
  assert.equal(skipLeadingComments("# weekly cleanup routine\ngit fetch\n# force push\ngit push --force"), "git fetch\n# force push\ngit push --force");
  assert.equal(skipLeadingComments("# step 1\n# step 2\ngit status"), "git status");
});

test("skipLeadingComments is a no-op when the paste already starts with a command", () => {
  assert.equal(skipLeadingComments("git status\n# force push\ngit push --force"), "git status\n# force push\ngit push --force");
});

test("skipLeadingComments never treats a shebang as a leading comment", () => {
  assert.equal(skipLeadingComments("#!/bin/bash\necho hi"), "#!/bin/bash\necho hi");
});

test("extractSeparatedOverview extracts a leading comment block only when a blank line separates it from the first command", () => {
  const result = extractSeparatedOverview("# weekly cleanup routine\n\ngit fetch\n# force push\ngit push --force");
  assert.equal(result.overview, "weekly cleanup routine");
  assert.equal(result.body, "git fetch\n# force push\ngit push --force");
});

test("extractSeparatedOverview treats a comment with no blank-line separator as that command's own comment, not an overview", () => {
  const result = extractSeparatedOverview("# check status\ngit status\n# force push\ngit push --force");
  assert.equal(result.overview, "");
  assert.equal(result.body, "# check status\ngit status\n# force push\ngit push --force");
});

test("extractSeparatedOverview finds nothing to extract when the paste starts with a command", () => {
  const result = extractSeparatedOverview("git status\n# force push\ngit push --force");
  assert.equal(result.overview, "");
  assert.equal(result.body, "git status\n# force push\ngit push --force");
});

test("extractSeparatedOverview joins a multi-line leading comment block before the blank-line separator", () => {
  const result = extractSeparatedOverview("# step 1\n# step 2\n\ngit status");
  assert.equal(result.overview, "step 1\nstep 2");
  assert.equal(result.body, "git status");
});

test("commandSignature is the tool plus its sorted flags, ignoring subcommands and positional arguments", () => {
  assert.equal(commandSignature("kubectl rollout restart deployment/api"), "kubectl");
  assert.equal(commandSignature("kubectl rollout restart deployment/web"), "kubectl");
  assert.equal(commandSignature("kubectl get pods -n prod"), "kubectl -n");
  assert.equal(commandSignature("kubectl get pods -n staging"), "kubectl -n");
});

test("commandSignature treats flag order as irrelevant but a different flag set as a different signature", () => {
  assert.equal(commandSignature("rsync -a -v src/ dest/"), commandSignature("rsync -v -a src2/ dest2/"));
  assert.notEqual(commandSignature("git push --force"), commandSignature("git push"));
});

test("commandSignature strips a leading sudo before reading the tool", () => {
  assert.equal(commandSignature("sudo systemctl restart nginx"), commandSignature("systemctl restart nginx"));
});

test("commandSignature returns null for an empty body", () => {
  assert.equal(commandSignature(""), null);
  assert.equal(commandSignature("   "), null);
});

test("isCommentLine recognizes #, -- , and // comment lines but not a shebang or a real command", () => {
  assert.equal(isCommentLine("# force push"), true);
  assert.equal(isCommentLine("-- fetch a sanity row"), true);
  assert.equal(isCommentLine("// debug output"), true);
  assert.equal(isCommentLine("#!/bin/bash"), false);
  assert.equal(isCommentLine("git push --force"), false);
});
