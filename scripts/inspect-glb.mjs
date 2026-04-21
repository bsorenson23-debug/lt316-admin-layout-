import path from "node:path";

import { inspectGlbFile } from "../src/server/models/inspectGlbFile.ts";

function formatBounds(label, bounds) {
  if (!bounds) {
    return `- ${label}: unavailable`;
  }
  return `- ${label}: ${bounds.width} x ${bounds.height} x ${bounds.depth} (min ${bounds.minX}, ${bounds.minY}, ${bounds.minZ}; max ${bounds.maxX}, ${bounds.maxY}, ${bounds.maxZ})`;
}

function formatList(label, values) {
  if (!values || values.length === 0) {
    return `- ${label}: none`;
  }
  return `- ${label}: ${values.join(", ")}`;
}

function formatReport(report) {
  const lines = [];
  lines.push(`GLB Inspection: ${report.file.name}`);
  lines.push(`Path: ${report.file.path}`);
  lines.push(`SHA-256: ${report.file.sha256}`);
  lines.push(`Size: ${report.file.sizeBytes} bytes`);
  lines.push("");
  lines.push("Asset");
  lines.push(`- version: ${report.asset.version ?? "unknown"}`);
  lines.push(`- generator: ${report.asset.generator ?? "unknown"}`);
  lines.push(`- minVersion: ${report.asset.minVersion ?? "n/a"}`);
  lines.push(`- copyright: ${report.asset.copyright ?? "n/a"}`);
  lines.push(formatList("extensionsUsed", report.asset.extensionsUsed));
  lines.push(formatList("extensionsRequired", report.asset.extensionsRequired));
  lines.push("");
  lines.push("Scenes");
  lines.push(`- sceneCount: ${report.scenes.count}`);
  lines.push(`- defaultSceneIndex: ${report.scenes.defaultSceneIndex ?? "n/a"}`);
  lines.push(formatList("sceneNames", report.scenes.names));
  lines.push("");
  lines.push("Nodes");
  lines.push(`- nodeCount: ${report.nodes.count}`);
  lines.push(`- unnamedNodes: ${report.nodes.unnamedCount}`);
  lines.push(formatList("nodeNames", report.nodes.names));
  lines.push("");
  lines.push("Meshes");
  lines.push(formatList("meshNames", report.meshes.meshNames));
  lines.push(formatList("visibleMeshNames", report.meshes.visibleMeshNames));
  lines.push(formatList("bodyMeshNames", report.meshes.bodyMeshNames));
  lines.push(formatList("accessoryMeshNames", report.meshes.accessoryMeshNames));
  lines.push(formatList("fallbackMeshNames", report.meshes.fallbackMeshNames));
  lines.push(formatList("unexpectedMeshNames", report.meshes.unexpectedMeshNames));
  lines.push(formatList("materialNames", report.meshes.materialNames));
  lines.push(`- fallbackDetected: ${report.meshes.fallbackDetected ? "yes" : "no"}`);
  lines.push(`- primitiveCount: ${report.meshes.primitiveCount}`);
  lines.push(`- approximateVertexCount: ${report.meshes.totalVertexCount}`);
  lines.push(`- approximateTriangleCount: ${report.meshes.totalTriangleCount}`);
  lines.push("");
  lines.push("Bounds");
  lines.push(`- source: ${report.bounds.source}`);
  lines.push(`- units: ${report.bounds.units}`);
  lines.push(formatBounds("fullScene", report.bounds.fullScene));
  lines.push(formatBounds("body", report.bounds.body));
  lines.push(formatBounds("accessory", report.bounds.accessory));
  lines.push(formatBounds("fallback", report.bounds.fallback));
  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function printUsage() {
  console.error("Usage: npm run inspect:glb -- <path-to-model.glb> [--json]");
}

async function main() {
  const args = process.argv.slice(2);
  const jsonFlagIndex = args.indexOf("--json");
  const jsonOutput = jsonFlagIndex >= 0;
  if (jsonFlagIndex >= 0) {
    args.splice(jsonFlagIndex, 1);
  }

  const targetPath = args[0];
  if (!targetPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const resolvedPath = path.resolve(targetPath);
  const report = await inspectGlbFile(resolvedPath);
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  process.stdout.write(formatReport(report));
}

await main();
