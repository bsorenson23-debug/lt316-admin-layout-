# Worktree Cleanup And Guidance

This repo now has more than one local worktree. Use this file to keep new work on the right checkout, restore local generated artifacts safely, and retire old worktrees without mixing branch stacks.

## Current Recommended Worktree

- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-laserbed-clean`
  - Current clean worktree.
  - Attached to `main`.
  - Use this path when starting a new queue task unless the task explicitly says otherwise.

## Historical Or Do-Not-Use Worktrees

- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-runtime-truth-clean`
  - Historical branch-attached worktree.
  - Keep only if you still need its old branch context.
  - Do not start new feature or polish work here.

- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-`
  - Older branch-attached worktree with unrelated local dirt.
  - Treat as historical unless you intentionally need that exact branch state.
  - Do not use it as the default checkout for new queued work.

- `C:\Users\brennen\.codex\worktrees\843f\lt316-admin-layout-`
  - Detached Codex temp worktree.
  - Remove or prune it if it is no longer active.

## Quick Status Check

From the worktree you plan to use:

```powershell
git status --short
git rev-parse HEAD
git branch --show-current
```

Expected clean-state pattern for the preferred queue worktree:

- no tracked source changes
- only local runtime artifacts such as `.codex-diagnostics/` and `.local/`

If a generated GLB shows up as modified, restore it before switching branches or merging:

```powershell
git restore -- public/models/generated/stanley-iceflow-30-bodyfit-v5.glb
git status --short
```

Use the same `git restore -- <path>` pattern for any tracked generated GLB that should remain at the committed version.

## Safe Main Sync

When preparing a clean worktree for the next task:

```powershell
git switch main
git fetch origin
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

If your local Git config ever causes `git pull --ff-only origin main` to complain about multiple branches, confirm that `main` still matches `origin/main` before doing anything broader:

```powershell
git rev-parse HEAD
git rev-parse origin/main
```

If those hashes match, the worktree is already current.

## Switching Between Worktrees Safely

Use `git worktree list --porcelain` to see every attached checkout and what branch it is pinned to.

Before using any older worktree:

1. Run `git status --short`.
2. Check its branch with `git branch --show-current`.
3. If it is not `main` or the exact branch you intend to use, stop and switch to the correct worktree instead.

Do not start a new feature in a historical worktree just because it is already open. That is how branch stacks get crossed and queue state becomes hard to trust.

## Cleaning Old Worktree Directories

List attached worktrees:

```powershell
git worktree list --porcelain
```

Remove a worktree only after its branch is no longer needed and the worktree is clean:

```powershell
git -C C:\path\to\worktree status --short
git worktree remove C:\path\to\worktree
git worktree prune
```

Use `git worktree prune` to clear stale metadata for removed or missing worktrees, especially under `.codex\worktrees\...`.

## Recommended Naming

Keep branch names and local worktree folders paired.

- Branches:
  - `codex/<task-name>`
  - Example: `codex/cleanup-local-worktree-guidance-docs`

- Local clean worktree folders:
  - `lt316-admin-layout-<topic>-clean`
  - Keep one clearly preferred clean queue worktree on `main`.
  - Reserve historical folders for branch-specific archaeology only.

Examples:

- branch: `codex/polish-disabled-action-reasons`
- worktree folder: `lt316-admin-layout-laserbed-clean`

## Simple Rules

- Start new queued work from the preferred clean `main` worktree.
- Do not mix new features into old historical worktrees.
- Restore tracked generated GLBs with `git restore` instead of editing or deleting them.
- Use `git status --short` before branching, before merging, and before switching worktrees.
- Remove detached temp worktrees when they are no longer needed.
