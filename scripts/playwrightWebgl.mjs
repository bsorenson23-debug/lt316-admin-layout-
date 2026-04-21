import { mkdir, writeFile } from "fs/promises";
import path from "path";

const repoRoot = process.cwd();
export const WEBGL_DIAGNOSTICS_DIR = path.join(repoRoot, "tmp", "audit");

function sanitizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeFileSegment(value) {
  const normalized = sanitizeString(value) ?? "webgl-probe";
  return normalized.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "webgl-probe";
}

export function normalizeWebGlProbeResult(rawResult, {
  label = "webgl-probe",
  rendererMode = null,
} = {}) {
  const ok = Boolean(rawResult?.ok);
  const failures = Array.isArray(rawResult?.failures)
    ? rawResult.failures
        .map((failure) => ({
          contextName: sanitizeString(failure?.contextName),
          message: sanitizeString(failure?.message),
        }))
        .filter((failure) => failure.contextName || failure.message)
    : [];
  const attemptedContexts = Array.isArray(rawResult?.attemptedContexts)
    ? rawResult.attemptedContexts.map((contextName) => sanitizeString(contextName)).filter(Boolean)
    : [];

  return {
    ok,
    status: ok ? "ok" : "webgl-unavailable",
    label: sanitizeString(label) ?? "webgl-probe",
    rendererMode: sanitizeString(rendererMode),
    contextName: sanitizeString(rawResult?.contextName),
    vendor: sanitizeString(rawResult?.vendor),
    renderer: sanitizeString(rawResult?.renderer),
    version: sanitizeString(rawResult?.version),
    shadingLanguageVersion: sanitizeString(rawResult?.shadingLanguageVersion),
    userAgent: sanitizeString(rawResult?.userAgent),
    attemptedContexts,
    failures,
    generatedAt: new Date().toISOString(),
  };
}

export function formatWebGlProbeFailure(result) {
  const attemptedContexts = result.attemptedContexts.length > 0
    ? result.attemptedContexts.join(", ")
    : "webgl2, webgl";
  const failureDetails = result.failures.length > 0
    ? result.failures
        .map((failure) => `${failure.contextName ?? "unknown"}${failure.message ? ` (${failure.message})` : ""}`)
        .join("; ")
    : "no context could be created";
  const rendererMode = result.rendererMode ?? "auto";
  return `WebGL unavailable for ${result.label} (renderer mode: ${rendererMode}; attempted: ${attemptedContexts}; details: ${failureDetails}).`;
}

export async function writeWebGlDiagnostics(result, {
  filePath,
} = {}) {
  const resolvedFilePath =
    filePath ?? path.join(WEBGL_DIAGNOSTICS_DIR, `${sanitizeFileSegment(result.label)}-webgl.json`);
  await mkdir(path.dirname(resolvedFilePath), { recursive: true });
  await writeFile(resolvedFilePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return resolvedFilePath;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{
 *   label?: string;
 *   rendererMode?: string | null;
 *   diagnosticsFilePath?: string;
 * }} [options]
 */
export async function probeWebGlSupport(page, {
  label = "webgl-probe",
  rendererMode = null,
  diagnosticsFilePath,
} = {}) {
  let rawResult;
  try {
    rawResult = await page.evaluate(() => {
      const attemptedContexts = [];
      const failures = [];
      const canvas = document.createElement("canvas");

      for (const contextName of ["webgl2", "webgl"]) {
        attemptedContexts.push(contextName);
        try {
          const context = canvas.getContext(contextName, {
            antialias: false,
            depth: true,
            stencil: false,
            failIfMajorPerformanceCaveat: false,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
          });
          if (!context) {
            failures.push({ contextName, message: "context returned null" });
            continue;
          }

          const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
          const vendor = debugInfo
            ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
            : context.getParameter(context.VENDOR);
          const renderer = debugInfo
            ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : context.getParameter(context.RENDERER);

          return {
            ok: true,
            contextName,
            vendor: String(vendor ?? ""),
            renderer: String(renderer ?? ""),
            version: String(context.getParameter(context.VERSION) ?? ""),
            shadingLanguageVersion: String(context.getParameter(context.SHADING_LANGUAGE_VERSION) ?? ""),
            attemptedContexts,
            failures,
            userAgent: navigator.userAgent,
          };
        } catch (error) {
          failures.push({
            contextName,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        ok: false,
        attemptedContexts,
        failures,
        userAgent: navigator.userAgent,
      };
    });
  } catch (error) {
    rawResult = {
      ok: false,
      attemptedContexts: ["webgl2", "webgl"],
      failures: [
        {
          contextName: "probe",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      userAgent: null,
    };
  }

  const result = normalizeWebGlProbeResult(rawResult, { label, rendererMode });
  const diagnosticsPath = await writeWebGlDiagnostics(result, { filePath: diagnosticsFilePath });
  return { ...result, diagnosticsPath };
}
