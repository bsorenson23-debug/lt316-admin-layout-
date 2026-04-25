This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Local worktree hygiene

Before starting branch work or opening a PR, use the local cleanup checklist in [docs/worktree-cleanup-and-guidance.md](docs/worktree-cleanup-and-guidance.md). It covers allowed local artifacts, safe dry-run cleanup commands, and the commit/PR scope checks for this repo.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Visual snapshots (Playwright)

Run the visual snapshot audit with:

```bash
npm run audit:visual
```

This command captures screenshots to `tmp/audit/`.

### Hosted runtime fallback behavior

In locked-down hosted containers (including Codex web), Playwright can fail to launch when:

- no preinstalled browser is available,
- `PLAYWRIGHT_EXECUTABLE_PATH` is not set, and
- browser download hosts are blocked.

When that happens, the script exits cleanly and writes diagnostics to `tmp/audit/runtime-diagnostics.json`.

### Reliable screenshot backend

Use the **Visual Audit** GitHub Actions workflow (`.github/workflows/visual-audit.yml`) for a reliable hosted screenshot runner.
