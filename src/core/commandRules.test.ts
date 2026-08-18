import assert from "node:assert/strict";
import test from "node:test";
import { annotateCommand, extractToolTags, looksLikeCommandBlock } from "./commandRules.js";

test("looksLikeCommandBlock recognizes a pure command block", () => {
  assert.equal(looksLikeCommandBlock("git push --force"), true);
  assert.equal(looksLikeCommandBlock("sudo systemctl restart nginx"), true);
  assert.equal(looksLikeCommandBlock("MY_VAR=1 npm run build"), true);
  assert.equal(looksLikeCommandBlock("# rebuild and restart\ndocker build .\ndocker compose up -d"), true);
});

test("looksLikeCommandBlock rejects prose that merely mentions a command", () => {
  assert.equal(looksLikeCommandBlock("Fixed the incident by running git push --force on main."), false);
  assert.equal(looksLikeCommandBlock("Root cause: the deploy hung.\ndocker ps showed nothing running."), false);
  assert.equal(looksLikeCommandBlock(""), false);
  assert.equal(looksLikeCommandBlock("   \n  "), false);
});

test("annotateCommand explains recognized commands and skips unrecognized ones", () => {
  assert.equal(annotateCommand("git push --force"), "强制推送，会覆盖远程分支历史，谨慎使用");
  assert.equal(annotateCommand("git status"), "查看 Git 工作区和暂存区状态");
  assert.equal(annotateCommand("docker system prune -af --volumes"), "清理未使用的 Docker 容器、网络和镜像");
  assert.equal(annotateCommand("some-obscure-tool --flag"), "");
});

test("annotateCommand joins explanations for multiple recognized lines and skips comments", () => {
  const result = annotateCommand("# build then deploy\ndocker build .\nkubectl apply -f deploy.yaml");
  assert.equal(result, "根据 Dockerfile 构建镜像\n应用一个 YAML 配置文件到集群");
});

test("extractToolTags pulls out distinct tool names", () => {
  assert.deepEqual(extractToolTags("docker build .\nkubectl apply -f deploy.yaml\ndocker ps"), ["docker", "kubectl"]);
  assert.deepEqual(extractToolTags("Just a note with no commands."), []);
});
