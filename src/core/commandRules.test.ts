import assert from "node:assert/strict";
import test from "node:test";
import { annotateCommand, extractComments, extractToolTags } from "./commandRules.js";

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
