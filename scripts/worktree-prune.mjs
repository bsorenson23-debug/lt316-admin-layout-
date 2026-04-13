#!/usr/bin/env node
import { parsePorcelainWorktreeList, runGit } from "./worktree-lib.mjs";

const repoRoot = process.cwd();
runGit(repoRoot, ["worktree", "prune"]);
const remaining = parsePorcelainWorktreeList(
  runGit(repoRoot, ["worktree", "list", "--porcelain"]).stdout,
);
console.log(JSON.stringify(remaining, null, 2));
