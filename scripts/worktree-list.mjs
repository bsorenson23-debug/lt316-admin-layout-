#!/usr/bin/env node
import { parsePorcelainWorktreeList, runGit } from "./worktree-lib.mjs";

const repoRoot = process.cwd();
const parsed = parsePorcelainWorktreeList(
  runGit(repoRoot, ["worktree", "list", "--porcelain"]).stdout,
);

console.log(JSON.stringify(parsed, null, 2));
