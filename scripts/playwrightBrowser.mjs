import { accessSync, constants } from "fs";
import path from "path";
import { chromium } from "@playwright/test";

const EXECUTABLE_ENV_KEYS = ["PLAYWRIGHT_EXECUTABLE_PATH", "CHROME_BIN", "CHROMIUM_PATH"];

function isUsableFile(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => value.trim()).filter(Boolean))];
}

function linuxCandidates() {
  return [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
  ];
}

function macCandidates() {
  return [
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
}

function windowsCandidates(env) {
  return [
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Chromium", "Application", "chrome.exe") : null,
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null,
    env.ProgramFiles ? path.join(env.ProgramFiles, "Chromium", "Application", "chrome.exe") : null,
    env.ProgramFiles ? path.join(env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe") : null,
    env["ProgramFiles(x86)"] ? path.join(env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe") : null,
  ];
}

export function listChromiumExecutableCandidates({
  env = process.env,
  platform = process.platform,
} = {}) {
  const envCandidates = EXECUTABLE_ENV_KEYS.map((key) => env[key]);

  const platformCandidates =
    platform === "linux"
      ? linuxCandidates()
      : platform === "darwin"
        ? macCandidates()
        : platform === "win32"
          ? windowsCandidates(env)
          : [];

  return unique([...envCandidates, ...platformCandidates]);
}

export function resolveChromiumExecutablePath({
  env = process.env,
  platform = process.platform,
  exists = isUsableFile,
} = {}) {
  return listChromiumExecutableCandidates({ env, platform }).find((candidate) => exists(candidate)) ?? null;
}

export function getChromiumLaunchOptions({
  env = process.env,
  platform = process.platform,
  exists = isUsableFile,
  headless = true,
} = {}) {
  const executablePath = resolveChromiumExecutablePath({ env, platform, exists });
  const args = platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];

  if (executablePath) {
    return { executablePath, headless, args };
  }

  return args.length > 0 ? { headless, args } : { headless };
}

export async function launchChromium(options = {}) {
  return chromium.launch(getChromiumLaunchOptions(options));
}
