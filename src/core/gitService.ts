import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitChange {
  code: string;
  path: string;
  staged: boolean;
}

export interface GitCommands {
  status: string[];
  diff: string[];
  log: string[];
  add: string[];
  commit: string[];
}

export function parseGitStatus(output: string): GitChange[] {
  return output.split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line[0] ?? " ";
      const worktree = line[1] ?? " ";
      const rawPath = line.slice(3).trim();
      const code = index === "?" && worktree === "?" ? "?" : (index.trim() || worktree.trim());
      return {
        code,
        path: rawPath,
        staged: index !== " " && index !== "?"
      };
    });
}

export function buildGitCommands(repoRoot: string, message: string): GitCommands {
  return {
    status: ["git", "-C", repoRoot, "status", "--porcelain"],
    diff: ["git", "-C", repoRoot, "diff", "--", "knowledge"],
    log: ["git", "-C", repoRoot, "log", "--oneline", "-20", "--", "knowledge"],
    add: ["git", "-C", repoRoot, "add", "knowledge"],
    commit: ["git", "-C", repoRoot, "commit", "-m", message]
  };
}

export async function getGitStatus(repoRoot: string): Promise<GitChange[]> {
  const { stdout } = await exec("git", ["-C", repoRoot, "status", "--porcelain"]);
  return parseGitStatus(stdout);
}

export async function getKnowledgeDiff(repoRoot: string): Promise<string> {
  const { stdout } = await exec("git", ["-C", repoRoot, "diff", "--", "knowledge"]);
  return stdout;
}

export async function getKnowledgeLog(repoRoot: string): Promise<string[]> {
  const { stdout } = await exec("git", ["-C", repoRoot, "log", "--oneline", "-20", "--", "knowledge"]);
  return stdout.split(/\r?\n/).filter(Boolean);
}

export async function commitKnowledge(repoRoot: string, message: string): Promise<string> {
  const cleanMessage = message.trim();
  if (!cleanMessage) {
    throw new Error("Commit message is required.");
  }
  await exec("git", ["-C", repoRoot, "add", "knowledge"]);
  const { stdout, stderr } = await exec("git", ["-C", repoRoot, "commit", "-m", cleanMessage]);
  return `${stdout}${stderr}`.trim();
}
