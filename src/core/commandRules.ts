const TOOL_NAMES = [
  "git", "docker", "docker-compose", "npm", "pnpm", "yarn", "kubectl", "curl", "wget",
  "ssh", "ssh-keygen", "scp", "rsync", "tar", "grep", "find", "sed", "awk", "chmod", "chown",
  "systemctl", "ps", "kill", "ls", "cd", "rm", "mv", "cp", "ln", "df", "du", "top",
  "journalctl", "apt", "apt-get", "brew", "pip", "pip3", "cargo", "go", "make", "jq"
];

const TOOL_NAME_SET = new Set(TOOL_NAMES);

interface AnnotationRule {
  pattern: RegExp;
  describe: string;
}

const ANNOTATION_RULES: AnnotationRule[] = [
  { pattern: /^git\s+status\b/, describe: "查看 Git 工作区和暂存区状态" },
  { pattern: /^git\s+commit\b.*(-{1,2}amend)\b/, describe: "修改最近一次提交，不新建提交记录" },
  { pattern: /^git\s+push\b.*(-f\b|--force\b)/, describe: "强制推送，会覆盖远程分支历史，谨慎使用" },
  { pattern: /^git\s+push\b/, describe: "推送本地提交到远程仓库" },
  { pattern: /^git\s+pull\b/, describe: "拉取并合并远程分支的最新提交" },
  { pattern: /^git\s+log\b.*--oneline/, describe: "以单行精简格式查看提交历史" },
  { pattern: /^git\s+log\b/, describe: "查看提交历史" },
  { pattern: /^git\s+reset\b.*--hard/, describe: "丢弃工作区和暂存区的改动，硬重置到指定提交，不可恢复" },
  { pattern: /^git\s+reset\b/, describe: "回退当前分支到指定提交（默认保留工作区改动）" },
  { pattern: /^git\s+checkout\s+-b\b/, describe: "创建并切换到一个新分支" },
  { pattern: /^git\s+stash\b/, describe: "暂存当前未提交的改动" },
  { pattern: /^git\s+rebase\b.*-i\b/, describe: "交互式变基，可修改/合并/重排提交" },
  { pattern: /^docker\s+system\s+prune\b/, describe: "清理未使用的 Docker 容器、网络和镜像" },
  { pattern: /^docker\s+ps\b/, describe: "列出正在运行的容器" },
  { pattern: /^docker\s+build\b/, describe: "根据 Dockerfile 构建镜像" },
  { pattern: /^docker\s+exec\b.*-it\b/, describe: "在运行中的容器内打开一个交互式终端" },
  { pattern: /^docker[\s-]compose\s+up\b/, describe: "启动 docker-compose 定义的所有服务" },
  { pattern: /^kubectl\s+get\s+pods\b/, describe: "列出当前命名空间下的 Pod" },
  { pattern: /^kubectl\s+logs\b/, describe: "查看 Pod 的日志输出" },
  { pattern: /^kubectl\s+apply\s+-f\b/, describe: "应用一个 YAML 配置文件到集群" },
  { pattern: /^kubectl\s+rollout\s+restart\b/, describe: "滚动重启一个 Deployment" },
  { pattern: /^npm\s+install\b/, describe: "安装 package.json 中声明的依赖" },
  { pattern: /^npm\s+run\b/, describe: "运行 package.json 中定义的脚本" },
  { pattern: /^chmod\s+\+x\b/, describe: "为文件添加可执行权限" },
  { pattern: /^chmod\s+-R\b/, describe: "递归修改目录及其内容的权限" },
  { pattern: /^rm\s+-rf\b/, describe: "强制递归删除文件或目录，不可恢复，谨慎使用" },
  { pattern: /^tar\s+-?xzf\b/, describe: "解压一个 .tar.gz 归档文件" },
  { pattern: /^tar\s+-?czf\b/, describe: "将文件打包压缩为 .tar.gz" },
  { pattern: /^ssh-keygen\b/, describe: "生成一对新的 SSH 密钥" },
  { pattern: /^scp\b/, describe: "通过 SSH 在本地和远程主机之间复制文件" },
  { pattern: /^rsync\b.*-a/, describe: "增量同步文件/目录，保留权限和时间戳" },
  { pattern: /^curl\b.*-o\b/, describe: "下载 URL 内容并保存为文件" },
  { pattern: /^systemctl\s+restart\b/, describe: "重启一个系统服务" },
  { pattern: /^systemctl\s+status\b/, describe: "查看一个系统服务的运行状态" }
];

export interface ExtractedComments {
  body: string;
  annotation: string;
}

/**
 * Splits a raw pasted command block into pure command lines and any comments
 * the user wrote themselves (#, "-- ", "// " — full-line or trailing). A `#!`
 * shebang is never treated as a comment. `--flag`/`--force`-style CLI flags
 * are never mistaken for a "-- comment" because that form requires a space
 * right after the dashes, which real flags never have.
 */
export function extractComments(raw: string): ExtractedComments {
  const commandLines: string[] = [];
  const comments: string[] = [];

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("#!")) {
      commandLines.push(line);
      continue;
    }

    const fullLineComment = matchFullLineComment(line);
    if (fullLineComment !== null) {
      comments.push(fullLineComment);
      continue;
    }

    const trailing = matchTrailingComment(line);
    if (trailing) {
      if (trailing.command) {
        commandLines.push(trailing.command);
      }
      comments.push(trailing.comment);
      continue;
    }

    commandLines.push(line);
  }

  return {
    body: commandLines.join("\n"),
    annotation: comments.join("\n")
  };
}

/**
 * Splits a raw pasted block into one unit per command line, pairing each
 * command with the comment(s) that belong to it: any full-line comments
 * directly preceding it (consumed, not shared with later lines) plus its
 * own trailing comment if it has one. Two command lines with nothing
 * (comment or otherwise) between them are still split into two units —
 * this is the "one line = one command" reading used when the user opts
 * into splitting a multi-command paste into individual entries.
 */
export function splitCommandUnits(raw: string): ExtractedComments[] {
  const units: ExtractedComments[] = [];
  let pendingComments: string[] = [];

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("#!")) {
      units.push({ body: line, annotation: pendingComments.join("\n") });
      pendingComments = [];
      continue;
    }

    const fullLineComment = matchFullLineComment(line);
    if (fullLineComment !== null) {
      pendingComments.push(fullLineComment);
      continue;
    }

    const trailing = matchTrailingComment(line);
    const comments = trailing ? [...pendingComments, trailing.comment] : pendingComments;
    const command = trailing ? trailing.command : line;
    if (command) {
      units.push({ body: command, annotation: comments.join("\n") });
    }
    pendingComments = [];
  }

  return units;
}

/**
 * Normalizes a command body for duplicate comparison: trims each line and
 * collapses internal whitespace runs to a single space, so purely
 * cosmetic differences (extra spaces, trailing whitespace) don't count as
 * a different command. Case is preserved — shell/SQL/etc. commands are
 * case-sensitive, so "Git Status" and "git status" are genuinely different.
 */
export function normalizeCommandBody(body: string): string {
  return body
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .trim();
}

export function extractToolTags(body: string): string[] {
  const tools = new Set<string>();
  for (const line of nonEmptyLines(body)) {
    const tool = commandTool(line);
    if (tool) {
      tools.add(tool);
    }
  }
  return [...tools];
}

/**
 * Finds where the first actual command line starts, skipping past any
 * leading full-line comments. Used only to infer a title without
 * accidentally picking a comment as the title — it does NOT imply those
 * leading comments should be stripped from the saved body. A comment
 * right before the first command is that command's own comment, exactly
 * like a comment before any later command; it has no special "overview"
 * status just by being first, and always stays inline in the body.
 */
export function skipLeadingComments(raw: string): string {
  const lines = raw.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index++;
      continue;
    }
    if (line.startsWith("#!")) {
      break;
    }
    if (matchFullLineComment(line) === null) {
      break;
    }
    index++;
  }

  const remainder = lines.slice(index).join("\n").trim();
  return remainder || raw.trim();
}

export function annotateCommand(body: string): string {
  const explanations: string[] = [];
  for (const line of nonEmptyLines(body)) {
    const rule = ANNOTATION_RULES.find((candidate) => candidate.pattern.test(line));
    if (rule) {
      explanations.push(rule.describe);
    }
  }
  return explanations.join("\n");
}

function matchFullLineComment(line: string): string | null {
  if (line.startsWith("#")) {
    return line.slice(1).trim();
  }
  if (line.startsWith("-- ")) {
    return line.slice(3).trim();
  }
  if (line.startsWith("// ")) {
    return line.slice(3).trim();
  }
  return null;
}

function matchTrailingComment(line: string): { command: string; comment: string } | null {
  const patterns = [/\s#\s*(.+)$/, /\s--\s+(.+)$/, /\s\/\/\s*(.+)$/];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match && typeof match.index === "number" && match.index > 0) {
      return {
        command: line.slice(0, match.index).trim(),
        comment: match[1].trim()
      };
    }
  }
  return null;
}

function nonEmptyLines(body: string): string[] {
  return body.split("\n").map((line) => line.trim()).filter(Boolean);
}

function commandTool(line: string): string | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  let index = 0;
  if (tokens[index] === "sudo") {
    index++;
  }
  while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    index++;
  }
  const candidate = tokens[index];
  return candidate && TOOL_NAME_SET.has(candidate) ? candidate : null;
}
