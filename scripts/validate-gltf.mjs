import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const validator = require("gltf-validator");

const repoRoot = process.cwd();
const targetRoots = [
  "public/models",
  "tests/fixtures",
  ".local/generated-models",
];

const gltfExtensions = new Set([".glb", ".gltf"]);
const skippedDirectoryNames = new Set([
  ".git",
  ".next",
  "node_modules",
  "playwright-report",
  "test-results",
  "tmp",
]);

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function relativeRepoPath(absolutePath) {
  return toPosixPath(path.relative(repoRoot, absolutePath));
}

function buildAuditAbsolutePath(glbAbsolutePath) {
  const parsed = path.parse(glbAbsolutePath);
  return path.join(parsed.dir, `${parsed.name}.audit.json`);
}

async function pathExists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function collectAssetFiles(rootRelativePath) {
  const rootAbsolutePath = path.join(repoRoot, rootRelativePath);
  if (!(await pathExists(rootAbsolutePath))) {
    return [];
  }

  const results = [];
  async function walk(currentAbsolutePath) {
    const entries = await readdir(currentAbsolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".local") {
        continue;
      }
      const entryAbsolutePath = path.join(currentAbsolutePath, entry.name);
      if (entry.isDirectory()) {
        if (!skippedDirectoryNames.has(entry.name)) {
          await walk(entryAbsolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (gltfExtensions.has(path.extname(entry.name).toLowerCase())) {
        if (rootRelativePath === ".local/generated-models") {
          const auditAbsolutePath = buildAuditAbsolutePath(entryAbsolutePath);
          if (!(await pathExists(auditAbsolutePath))) {
            continue;
          }
        }
        results.push(entryAbsolutePath);
      }
    }
  }

  await walk(rootAbsolutePath);
  return results;
}

function readUint8Array(buffer) {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function hashBufferSha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function validateAssetFile(absolutePath) {
  const relativePath = relativeRepoPath(absolutePath);
  const rawBytes = await readFile(absolutePath);
  const format = path.extname(absolutePath).toLowerCase() === ".gltf" ? "gltf" : "glb";
  const auditAbsolutePath = buildAuditAbsolutePath(absolutePath);
  const auditExists = await pathExists(auditAbsolutePath);
  const glbHash = hashBufferSha256(rawBytes);

  const report = await validator.validateBytes(readUint8Array(rawBytes), {
    uri: relativePath,
    format,
    writeTimestamp: false,
    maxIssues: 0,
    externalResourceFunction: async (resourceUri) => {
      const resourceAbsolutePath = path.resolve(path.dirname(absolutePath), decodeURIComponent(resourceUri));
      const resourceBytes = await readFile(resourceAbsolutePath);
      return readUint8Array(resourceBytes);
    },
  });

  const errors = [];
  const warnings = [];

  if (!auditExists && relativePath.startsWith(".local/generated-models/")) {
    warnings.push(
      `Local generated GLB has no audit sidecar: ${relativeRepoPath(auditAbsolutePath)}. Treating it as a legacy local artifact.`,
    );
  }

  if (auditExists) {
    try {
      const auditRaw = await readFile(auditAbsolutePath, "utf8");
      const audit = JSON.parse(auditRaw);

      if (typeof audit.contractVersion !== "string" || audit.contractVersion.length === 0) {
        errors.push("Audit JSON is missing contractVersion.");
      }
      if (typeof audit.generatedAt !== "string" || audit.generatedAt.length === 0) {
        errors.push("Audit JSON is missing generatedAt.");
      }
      if (typeof audit.mode !== "string" || audit.mode.length === 0) {
        errors.push("Audit JSON is missing mode.");
      }

      const sourceHash = audit?.source?.hash;
      const sourceHashMissingReason = audit?.source?.hashMissingReason;
      if (
        (typeof sourceHash !== "string" || sourceHash.length === 0) &&
        (typeof sourceHashMissingReason !== "string" || sourceHashMissingReason.length === 0)
      ) {
        errors.push("Audit JSON must include source.hash or source.hashMissingReason.");
      }

      const auditGlbHash = audit?.glb?.hash;
      if (typeof auditGlbHash !== "string" || auditGlbHash.length === 0) {
        errors.push("Audit JSON is missing glb.hash.");
      } else if (auditGlbHash !== glbHash) {
        errors.push(`Audit GLB hash mismatch: expected ${glbHash}, received ${auditGlbHash}.`);
      }

      const auditMeshNames = audit?.meshes?.names;
      if (!Array.isArray(auditMeshNames) || auditMeshNames.length === 0) {
        errors.push("Audit JSON is missing meshes.names.");
      }

      const validationStatus = audit?.validation?.status;
      if (typeof validationStatus !== "string" || validationStatus.length === 0) {
        errors.push("Audit JSON is missing validation.status.");
      }

      const auditWarnings = audit?.validation?.warnings;
      if (Array.isArray(auditWarnings)) {
        warnings.push(...auditWarnings.map((warning) => `audit: ${warning}`));
      }
    } catch (error) {
      errors.push(`Audit JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    absolutePath,
    relativePath,
    glbHash,
    auditRelativePath: auditExists ? relativeRepoPath(auditAbsolutePath) : null,
    report,
    errors,
    warnings,
  };
}

function summarizeIssues(report) {
  return `errors=${report.issues.numErrors} warnings=${report.issues.numWarnings} infos=${report.issues.numInfos} hints=${report.issues.numHints}`;
}

function logResult(result) {
  const status = result.report.issues.numErrors > 0 || result.errors.length > 0 ? "FAIL" : "PASS";
  const info = result.report.info ?? {};
  const metrics = [];
  if (typeof info.totalVertexCount === "number") {
    metrics.push(`verts=${info.totalVertexCount}`);
  }
  if (typeof info.totalTriangleCount === "number") {
    metrics.push(`tris=${info.totalTriangleCount}`);
  }
  if (typeof info.drawCallCount === "number") {
    metrics.push(`drawCalls=${info.drawCallCount}`);
  }

  console.log(`${status} ${result.relativePath}`);
  console.log(`  glTF validator: ${summarizeIssues(result.report)}${metrics.length > 0 ? ` ${metrics.join(" ")}` : ""}`);
  console.log(`  glb.sha256: ${result.glbHash}`);
  if (result.auditRelativePath) {
    console.log(`  audit: ${result.auditRelativePath}`);
  } else if (result.relativePath.startsWith(".local/generated-models/")) {
    console.log("  audit: missing (legacy local artifact)");
  } else {
    console.log("  audit: n/a");
  }

  for (const message of result.report.issues.messages ?? []) {
    const level = typeof message.severity === "number" && message.severity <= 1 ? "error" : "warn";
    console.log(`    ${level}: [${message.code}] ${message.message}`);
  }
  for (const error of result.errors) {
    console.log(`    error: ${error}`);
  }
  for (const warning of result.warnings) {
    console.log(`    warn: ${warning}`);
  }
}

async function main() {
  const discoveredPaths = new Set();
  for (const rootRelativePath of targetRoots) {
    const files = await collectAssetFiles(rootRelativePath);
    for (const file of files) {
      discoveredPaths.add(path.resolve(file));
    }
  }

  const assetPaths = [...discoveredPaths].sort((left, right) => left.localeCompare(right));
  if (assetPaths.length === 0) {
    console.error("No .glb or .gltf assets were found under the configured validation roots.");
    process.exitCode = 1;
    return;
  }

  console.log(`Validating ${assetPaths.length} glTF assets with Khronos glTF Validator ${validator.version()}`);

  let failedCount = 0;
  let warningCount = 0;

  for (const assetPath of assetPaths) {
    const result = await validateAssetFile(assetPath);
    logResult(result);

    const hasErrors = result.report.issues.numErrors > 0 || result.errors.length > 0;
    const hasWarnings = result.report.issues.numWarnings > 0 || result.warnings.length > 0;
    if (hasErrors) {
      failedCount += 1;
    } else if (hasWarnings) {
      warningCount += 1;
    }
  }

  console.log("");
  console.log(`GLTF validation summary: total=${assetPaths.length} failed=${failedCount} warned=${warningCount}`);
  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

await main();
