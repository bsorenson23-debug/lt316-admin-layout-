# Gemini Onboarding - LT316 Admin

Use this file to quickly align Gemini in VS Code with this repository.

## Project Identity

- Name: LT316 Admin
- Type: Next.js 16 admin tool for laser engraving operators
- Main workflows:
  - SVG library management and placement on laser bed
  - Flat-bed and tumbler-wrap workspace modes
  - AI-assisted tumbler/flat-bed detection
  - LightBurn export (SVG + sidecar JSON)
  - Calibration workflows (rotary, SPR, lens, bed reference)
  - Optional 3D model preview and template-driven setup

## Stack

- Next.js 16 (App Router), React 19, TypeScript strict
- Konva + react-konva for 2D workspace
- Three.js + @react-three/fiber + @react-three/drei for 3D
- Node native test runner with --experimental-strip-types

## Source of Truth Files

- High-level architecture and constraints: AGENTS.md
- Secondary mirror doc: CLAUDE.md
- Main app shell/state: src/components/admin/AdminLayoutShell.tsx
- Types: src/types/
- Utilities and domain logic: src/utils/
- API routes: src/app/api/admin/
- Server orchestration: src/server/

## Critical Constraints (Do Not Break)

- Keep all domain measurements in millimeters.
- Keep workspace mode gating strict:
  - tumbler auto-detect only in tumbler-wrap mode
  - flat-bed auto-detect only in flat-bed mode
- Do not change LightBurn layer palette order in src/types/laserLayer.ts.
- In ModelViewer, blob URL creation must stay in useEffect (not useMemo).
- Keep Three.js Canvas frameloop="demand".
- Do not add Environment preset fetches (offline-safe manual lights only).
- Use CSS tokens from src/app/globals.css; avoid arbitrary raw hex in module CSS.

## Environment

Use .env.local for real secrets. Use .env.example as template.

Required for full feature set:
- ANTHROPIC_API_KEY
- REPLICATE_API_TOKEN

Optional:
- TUMBLER_SPEC_PROVIDER=mock (default)
- TUMBLER_SPEC_SEARCH_ENDPOINT
- TUMBLER_SPEC_SEARCH_API_KEY

## Runbook

- Install: npm install
- Dev server: npm run dev
- Lint: npm run lint
- Build: npm run build

Targeted tests:
- npm run test:tumbler-auto-size
- npm run test:tumbler-guides
- npm run test:tumbler-identification
- npm run test:tumbler-export-placement
- npm run test:fiber-color

## How Gemini Should Work In This Repo

When proposing edits:

1. Prefer minimal, surgical changes.
2. Preserve existing naming and public API shape.
3. Do not reformat unrelated files.
4. Add or update tests when behavior changes.
5. Call out risks in calibration, dimension math, export placement, and mode gating.

For reviews, focus first on:
- behavioral regressions
- dimension/units bugs
- export correctness for LightBurn
- mode-gating violations
- missing tests for changed logic

## First Prompt To Paste Into Gemini

Use this exact prompt:

"You are assisting on LT316 Admin. Read AGENTS.md first and treat it as authoritative. Before any coding task, summarize relevant constraints from AGENTS.md, then inspect affected files. Keep all changes minimal and mm-based. If task touches workspace mode or export, verify tumbler/flat-bed gating and LightBurn assumptions. If task changes behavior, propose or implement focused tests."
