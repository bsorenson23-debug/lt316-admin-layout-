# LT316 Admin

Next.js admin tooling for laser engraving workflows, artwork placement, and LightBurn export.

## Docker Desktop workflow

Start the web app and the asset pipeline together:

```bash
npm run dev:codex
```

Rebuild the images after Dockerfile or dependency changes:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/start-admin-dev.ps1 -Build
```

Services:

- Admin app: [http://localhost:3000/admin](http://localhost:3000/admin)
- Asset pipeline: [http://localhost:3100](http://localhost:3100)

## Local workflow

If you want to run the Next.js app without containers:

```bash
npm run dev
```

## Repo hygiene

Clean local-only runtime artifacts without touching source files:

```bash
npm run clean:local
```

Include build caches as well:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/clean-local-artifacts.ps1 -IncludeBuildCache
```

Install a browser for local visual audits. This reuses a preinstalled Chromium binary when available and only downloads a Playwright-managed bundle when needed:

```bash
npm run setup:playwright
```

Run the visual audit in a local or Docker-backed environment:

```bash
npm run audit:visual
```

If you run that from Codex web or another restricted container, the command now stops with a GitHub Actions fallback link instead of a Playwright download error. To force the direct local runner when you already have browser access, use:

```bash
npm run audit:visual:local
```
