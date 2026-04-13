#!/usr/bin/env node
import path from "node:path";
import {
  buildBranchName,
  buildWorktreePath,
  ensureDirectory,
  parseCliArgs,
  runGit,
} from "./worktree-lib.mjs";

const args = parseCliArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const issue = args.issue;
const section = args.section;
const slug = args.slug;
const branch = args.branch || buildBranchName({ issue, section, slug });
const worktreePath = args.path || buildWorktreePath({ repoRoot, issue, slug });
const baseRef = args.base || "HEAD";

if (!issue || !section || !slug) {
  throw new Error("Usage: npm run worktree:new -- --issue <id> --section <section> --slug <slug> [--base <ref>] [--branch <name>]");
}

ensureDirectory(path.dirname(worktreePath));
runGit(repoRoot, ["worktree", "add", "-b", branch, worktreePath, baseRef]);
console.log(JSON.stringify({ branch, worktreePath, baseRef }, null, 2));
