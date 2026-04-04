import { execFileSync, spawn } from "child_process";
import { accessSync, constants, readdirSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { resolveChromiumExecutablePath } from "./playwrightBrowser.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(repoRoot, ".playwright-browsers");
const baseUrl = process.env.VISUAL_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const adminUrl = `${baseUrl.replace(/\/$/, "")}/admin`;
const localAuditScript = path.join(scriptDir, "visual-audit.mjs");
const auditOutDir = path.join(repoRoot, "tmp", "audit");
const diagnosticsPath = path.join(auditOutDir, "runtime-diagnostics.json");

process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

export function originUrlToActionsWorkflowUrl(originUrl) {
  if (!originUrl) {
    return null;
  }

  const normalized = originUrl.trim().replace(/\.git$/i, "");

  if (normalized.startsWith("git@github.com:")) {
    return `https://github.com/${normalized.slice("git@github.com:".length)}/actions/workflows/visual-audit.yml`;
  }

  if (normalized.startsWith("https://github.com/")) {
    return `${normalized}/actions/workflows/visual-audit.yml`;
  }

  return null;
}

function pathExists(targetPath) {
  try {
    accessSync(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function hasPlaywrightBrowserBundle(targetPath = browsersPath) {
  if (!pathExists(targetPath)) {
    return false;
  }

  try {
    const entries = readdirSync(targetPath, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory() && /^(chromium|chrome|chromium_headless_shell)-/i.test(entry.name));
  } catch {
    return false;
  }
}

export async function isAdminReachable(url = adminUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || [301, 302, 307, 308].includes(response.status);
  } catch {
    return false;
  }
}

function getActionsWorkflowUrl() {
  try {
    const originUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return originUrlToActionsWorkflowUrl(originUrl);
  } catch {
    return null;
  }
}

function printFallback(reasons) {
  const workflowUrl = getActionsWorkflowUrl();

  console.error("[audit:visual] Local screenshot generation is unavailable in this environment.");
  for (const reason of reasons) {
    console.error(`- ${reason}`);
  }
  console.error("");
  console.error("Best workflow from Codex web: run the Visual Audit GitHub Actions workflow instead.");
  if (workflowUrl) {
    console.error(workflowUrl);
  }
  console.error("");
  console.error("Local/container fallback when you do have browser access:");
  console.error("npm run audit:visual:local");
}

async function writeRuntimeDiagnostics(payload) {
  await mkdir(auditOutDir, { recursive: true });
  await writeFile(diagnosticsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.error(`[audit:visual] Wrote runtime diagnostics to ${diagnosticsPath}`);
}

async function main() {
  const reasons = [];
  const executablePath = resolveChromiumExecutablePath();
  const hasBrowser = Boolean(executablePath) || hasPlaywrightBrowserBundle();

  if (!hasBrowser) {
    reasons.push(
      `No usable Chromium binary or Playwright browser bundle was found (checked ${browsersPath}).`
    );
  }

  if (!(await isAdminReachable())) {
    reasons.push(`The admin app is not reachable at ${adminUrl}.`);
  }

  if (reasons.length > 0) {
    await writeRuntimeDiagnostics({
      ok: false,
      generatedAt: new Date().toISOString(),
      mode: "fallback",
      adminUrl,
      browsersPath,
      executablePath,
      reasons,
      workflowUrl: getActionsWorkflowUrl(),
      cwd: repoRoot,
    });
    printFallback(reasons);
    process.exit(1);
  }

  await writeRuntimeDiagnostics({
    ok: true,
    generatedAt: new Date().toISOString(),
    mode: "local-browser",
    adminUrl,
    browsersPath,
    executablePath,
    reasons: [],
    workflowUrl: getActionsWorkflowUrl(),
    cwd: repoRoot,
  });

  const child = spawn(process.execPath, [localAuditScript], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

const isMainModule =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  await main();
}
