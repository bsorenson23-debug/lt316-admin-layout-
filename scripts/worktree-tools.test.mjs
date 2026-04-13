import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildBranchName,
  buildWorktreePath,
  parsePorcelainWorktreeList,
  runGit,
} from "./worktree-lib.mjs";

test("buildBranchName normalizes issue, section, and slug", () => {
  assert.equal(
    buildBranchName({ issue: "#123", section: "Template.Source", slug: "Review Flow" }),
    "codex/123-template-source-review-flow",
  );
});

test("buildWorktreePath uses sibling worktree root", () => {
  const repoRoot = path.join("C:", "repo", "lt316-admin-layout-");
  assert.equal(
    buildWorktreePath({ repoRoot, issue: "123", slug: "review-flow" }),
    path.join("C:", "repo", "lt316-admin-layout--worktrees", "123-review-flow"),
  );
});

test("parsePorcelainWorktreeList parses porcelain output", () => {
  const parsed = parsePorcelainWorktreeList([
    "worktree C:/repo",
    "HEAD abc123",
    "branch refs/heads/main",
    "",
    "worktree C:/repo-wt",
    "HEAD def456",
    "branch refs/heads/codex/123-template-source-review-flow",
    "",
  ].join("\n"));

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].worktree, path.normalize("C:/repo"));
  assert.equal(parsed[1].branch, "refs/heads/codex/123-template-source-review-flow");
});

test("runGit can inspect worktrees in a temporary repo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lt316-worktree-test-"));
  const repoRoot = path.join(root, "repo");
  const siblingWorktree = path.join(root, "repo-worktree");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "README.md"), "test\n", "utf8");

  runGit(repoRoot, ["init"]);
  runGit(repoRoot, ["config", "user.email", "codex@example.com"]);
  runGit(repoRoot, ["config", "user.name", "Codex"]);
  runGit(repoRoot, ["add", "README.md"]);
  runGit(repoRoot, ["commit", "-m", "init"]);
  runGit(repoRoot, ["worktree", "add", "-b", "codex/123-template-source-smoke", siblingWorktree, "HEAD"]);

  const listed = parsePorcelainWorktreeList(
    runGit(repoRoot, ["worktree", "list", "--porcelain"]).stdout,
  );

  assert.ok(listed.some((entry) => entry.worktree === siblingWorktree));

  runGit(repoRoot, ["worktree", "remove", siblingWorktree]);
});
