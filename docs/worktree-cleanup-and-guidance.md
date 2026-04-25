# Worktree Cleanup And Guidance

Use this checklist before starting branch work, before committing, and before opening a PR. It keeps local diagnostics, runtime caches, generated models, and sibling worktrees out of feature branches.

## Clean Worktree Gate

Start from the intended checkout:

```powershell
cd C:\Users\brennen\Documents\GitHub\lt316-admin-layout-laserbed-clean
git switch main
git pull --ff-only origin main
git status --short
git branch --show-current
git rev-parse HEAD
```

Continue only when tracked source files are clean. If a tracked source file is dirty before the task starts, stop unless that file is explicitly part of the current task.

Allowed local artifacts may remain untracked, but they must not be staged or committed:

- `.codex-diagnostics/`
- `.local/`
- `.playwright-mcp/`
- `public/models/generated/` runtime captures, when untracked
- `public/models/test-fixtures/` only for intentional fixture or test generation
- `storage/`
- `test-results/`
- screenshots, logs, and runtime captures
- `.next/`

## Never Commit

Do not commit these paths or values unless the task explicitly says fixture or artifact changes are in scope:

- generated GLBs or generated audit sidecars
- `.local/`
- `.codex-diagnostics/`
- `.playwright-mcp/`
- `.next/`
- `test-results/`
- screenshots
- runtime logs
- temporary files
- credentials, secrets, tokens, cookies, or local environment values

## Before Commit

Run:

```powershell
git diff --name-only
git diff --stat
git diff --check
git status --short
```

Confirm:

- the diff only contains task-scope files
- no diagnostics, generated artifacts, local caches, screenshots, logs, or runtime storage files are staged
- generated GLBs and audits are absent unless explicitly in scope
- staging is explicit, for example `git add docs/worktree-cleanup-and-guidance.md README.md`

If a file was staged by mistake:

```powershell
git restore --staged <path>
```

If an unrelated tracked file changed locally and should return to the committed version:

```powershell
git restore <path>
```

Do not use broad restore commands against paths you have not inspected.

## Before PR

Choose validation for the touched surface:

```powershell
npx tsc --noEmit --pretty false
npm run build
npm run test:body-reference-contract
npm run validate:gltf
```

Add targeted Node tests when helper files changed. Run Playwright when UI or e2e selectors changed. Run a real UI smoke when an operator flow changed.

In the PR body, include:

- summary
- files changed
- validation results
- Playwright result, or why it was skipped
- UI smoke result, or why it was skipped
- out-of-scope confirmation
- remaining local artifacts
- confirmation that diagnostics, local caches, generated artifacts, screenshots, logs, and runtime storage files were not committed

## Safe Cleanup Checks

Use dry runs first:

```powershell
git clean -ndX
git clean -nd
```

Review every path before deleting anything. Do not use `git clean -fdx` as a casual default.

If `.next/` needs cleanup, stop any running `next dev` process first. Removing `.next/` while the dev server is live can corrupt the active Turbopack session and produce misleading route errors.

For generated model noise, prefer restoring tracked generated files instead of editing or deleting them:

```powershell
git restore public/models/generated/<file>.glb
git restore public/models/generated/<file>.audit.json
```

If the repo later adds a cleanup script, read its help or source before running it and keep behavior changes out of docs-only branches.

## Worktree Safety

List attached worktrees:

```powershell
git worktree list --porcelain
```

Before using any older worktree:

1. Run `git status --short`.
2. Check its branch with `git branch --show-current`.
3. Use it only if it is on `main` or the exact branch required by the task.

Do not start a new feature in a historical worktree just because it is already open.

Remove a worktree only after its branch is no longer needed and the worktree is clean:

```powershell
git -C C:\path\to\worktree status --short
git worktree remove C:\path\to\worktree
git worktree prune
```

## Branch And PR Handoff

Use this final report shape for branch handoff:

- Branch
- Commit
- PR URL
- Files changed
- Validation
- Playwright
- Normal-mode smoke
- Debug-mode smoke
- Diff scope confirmation
- Remaining local artifacts
- Final status

## Feature Boundaries

Cleanup and hygiene branches must not change:

- BODY CUTOUT QA validation
- GLB generation
- BODY REFERENCE v1/v2 generation
- v2 readiness rules
- WRAP / EXPORT behavior
- artwork persistence
- engraving overlay behavior
- product appearance references
- Docker/dev infrastructure, unless explicitly in scope
