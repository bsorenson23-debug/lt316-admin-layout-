import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function slugifySegment(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildBranchName({ issue, section, slug }) {
  const issueSlug = slugifySegment(issue);
  const sectionSlug = slugifySegment(section);
  const slugPart = slugifySegment(slug);
  if (!issueSlug || !sectionSlug || !slugPart) {
    throw new Error("issue, section, and slug are required to build a branch name.");
  }
  return `codex/${issueSlug}-${sectionSlug}-${slugPart}`;
}

export function buildWorktreeRoot(repoRoot) {
  return path.resolve(repoRoot, "..", "lt316-admin-layout--worktrees");
}

export function buildWorktreePath({ repoRoot, issue, slug }) {
  const issueSlug = slugifySegment(issue);
  const slugPart = slugifySegment(slug);
  if (!issueSlug || !slugPart) {
    throw new Error("issue and slug are required to build a worktree path.");
  }
  return path.join(buildWorktreeRoot(repoRoot), `${issueSlug}-${slugPart}`);
}

export function parsePorcelainWorktreeList(output) {
  const entries = [];
  let current = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      if (current) entries.push(current);
      current = null;
      continue;
    }

    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ").trim();
    if (key === "worktree") {
      if (current) entries.push(current);
      current = { worktree: path.normalize(value) };
      continue;
    }
    if (!current) continue;

    if (key === "bare" || key === "detached") {
      current[key] = true;
      continue;
    }
    current[key] = value || true;
  }

  if (current) entries.push(current);
  return entries;
}

export function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git command failed").trim());
  }

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

export function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

export function resolveBranchForWorktree(repoRoot, branchName) {
  const list = parsePorcelainWorktreeList(
    runGit(repoRoot, ["worktree", "list", "--porcelain"]).stdout,
  );
  return list.find((entry) => entry.branch === `refs/heads/${branchName}`) ?? null;
}
