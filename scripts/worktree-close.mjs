#!/usr/bin/env node
import { parseCliArgs, parsePorcelainWorktreeList, runGit, resolveBranchForWorktree } from "./worktree-lib.mjs";

const args = parseCliArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const branch = typeof args.branch === "string" ? args.branch : null;
const explicitPath = typeof args.path === "string" ? args.path : null;
const force = Boolean(args.force);
const deleteBranch = Boolean(args["delete-branch"]);

if (!branch && !explicitPath) {
  throw new Error("Usage: npm run worktree:close -- --branch <name> | --path <path> [--force] [--delete-branch]");
}

const target =
  explicitPath
    ? { worktree: explicitPath, branch: branch ? `refs/heads/${branch}` : null }
    : resolveBranchForWorktree(repoRoot, branch);

if (!target) {
  throw new Error("Could not resolve the requested worktree.");
}

runGit(repoRoot, ["worktree", "remove", ...(force ? ["--force"] : []), target.worktree]);

if (deleteBranch && branch) {
  runGit(repoRoot, ["branch", "-D", branch]);
}

const remaining = parsePorcelainWorktreeList(
  runGit(repoRoot, ["worktree", "list", "--porcelain"]).stdout,
);
console.log(JSON.stringify({ removed: target.worktree, remaining }, null, 2));
