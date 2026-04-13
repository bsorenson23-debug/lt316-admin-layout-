#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const featureRoot = path.join(repoRoot, "src", "features", "admin");
const legacyComponentRoot = path.join(repoRoot, "src", "components", "admin");

const MAX_ROUTE_LINES = 300;
const MAX_FEATURE_FILE_LINES = 500;
const MAX_FEATURE_COMPONENT_LINES = 800;

const LEGACY_BASELINES = new Map([
  ["src/components/admin/TemplateCreateForm.tsx", 9255],
  ["src/components/admin/EngravableZoneEditor.tsx", 7790],
  ["src/components/admin/AdminLayoutShell.tsx", 3279],
  ["src/components/admin/ModelViewer.tsx", 2970],
  ["src/components/admin/RasterToSvgPanel.tsx", 2610],
  ["src/components/admin/LaserBedWorkspace.tsx", 1970],
  ["src/components/admin/CalibrationWorkspace.tsx", 1695],
  ["src/components/admin/TumblerExportPanel.tsx", 1084],
  ["src/components/admin/TumblerMappingWizard.tsx", 975],
]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(target, files);
      continue;
    }
    files.push(target);
  }
  return files;
}

function getLineCount(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function auditFeatureFiles(errors) {
  if (!fs.existsSync(featureRoot)) return;
  for (const filePath of walk(featureRoot)) {
    if (!/\.(ts|tsx)$/.test(filePath)) continue;
    const repoPath = toRepoPath(filePath);
    const lineCount = getLineCount(filePath);
    const isComponent = repoPath.includes("/components/") && repoPath.endsWith(".tsx");
    const limit = isComponent ? MAX_FEATURE_COMPONENT_LINES : MAX_FEATURE_FILE_LINES;
    if (lineCount > limit) {
      errors.push(`${repoPath}: ${lineCount} lines exceeds feature limit ${limit}`);
    }

    const content = fs.readFileSync(filePath, "utf8");
    const featureMatch = repoPath.match(/^src\/features\/admin\/([^/]+)\//);
    const currentFeature = featureMatch?.[1] ?? null;
    if (!currentFeature) continue;

    const importMatches = content.matchAll(/from\s+["']@\/features\/admin\/([^"']+)["']/g);
    for (const match of importMatches) {
      const imported = match[1];
      const [targetFeature, ...rest] = imported.split("/");
      if (!targetFeature || targetFeature === "shared" || targetFeature === currentFeature) continue;
      if (rest.length > 0) {
        errors.push(`${repoPath}: cross-feature import must use public entrypoint '@/features/admin/${targetFeature}'`);
      }
    }
  }
}

function auditRoutes(errors) {
  const appDir = path.join(repoRoot, "src", "app");
  if (!fs.existsSync(appDir)) return;
  for (const filePath of walk(appDir)) {
    const repoPath = toRepoPath(filePath);
    if (!/(page|layout|loading|error)\.tsx$/.test(repoPath)) continue;
    const lineCount = getLineCount(filePath);
    if (lineCount > MAX_ROUTE_LINES) {
      errors.push(`${repoPath}: ${lineCount} lines exceeds route composition limit ${MAX_ROUTE_LINES}`);
    }
  }
}

function auditLegacyBaselines(errors) {
  for (const [repoPath, baseline] of LEGACY_BASELINES.entries()) {
    const absolutePath = path.join(repoRoot, repoPath);
    if (!fs.existsSync(absolutePath)) continue;
    const lineCount = getLineCount(absolutePath);
    if (lineCount > baseline) {
      errors.push(`${repoPath}: ${lineCount} lines exceeds frozen legacy baseline ${baseline}`);
    }
  }
}

const errors = [];
auditFeatureFiles(errors);
auditRoutes(errors);
auditLegacyBaselines(errors);

if (errors.length > 0) {
  console.error("Structure audit failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Structure audit passed.");
