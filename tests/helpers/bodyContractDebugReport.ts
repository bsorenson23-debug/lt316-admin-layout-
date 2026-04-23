import fs from "node:fs/promises";
import path from "node:path";

import { parseBodyGeometryAuditArtifact } from "../../src/lib/adminApi.schema";
import {
  createEmptyBodyGeometryContract,
  mergeAuditContractWithLoadedInspection,
} from "../../src/lib/bodyGeometryContract";
import { buildBodyGeometryDebugReport } from "../../src/lib/bodyGeometryDebugReport";
import { inspectGlbFile } from "../../src/server/models/inspectGlbFile";

type GeneratedBodyGeometryPayload = {
  bodyGeometryContract?: Record<string, unknown>;
  auditJsonPath?: string;
  glbPath?: string;
};

function generatedModelFilePath(glbPath: string): string {
  const fileName = glbPath.split("/").pop();
  if (!fileName) {
    throw new Error(`Expected generated model path to include a file name: ${glbPath}`);
  }
  return path.join(process.cwd(), ".local", "generated-models", fileName);
}

function buildLoadedInspectionContractFromReport(
  report: Awaited<ReturnType<typeof inspectGlbFile>>,
  seedContract: Record<string, unknown>,
): Record<string, unknown> {
  const emptyContract = createEmptyBodyGeometryContract();
  const seedDimensions = (seedContract.dimensionsMm ?? {}) as Record<string, unknown>;
  const seededBodyBounds = seedDimensions.bodyBounds;
  const seededBodyBoundsUnits = seedDimensions.bodyBoundsUnits;

  return {
    ...emptyContract,
    mode: seedContract.mode ?? "unknown",
    glb: {
      ...(emptyContract.glb ?? {}),
      path: (seedContract.glb as Record<string, unknown> | undefined)?.path,
      hash: report.file.sha256,
      sourceHash: (seedContract.glb as Record<string, unknown> | undefined)?.sourceHash,
      generatedAt: (seedContract.glb as Record<string, unknown> | undefined)?.generatedAt,
      freshRelativeToSource: (seedContract.glb as Record<string, unknown> | undefined)?.freshRelativeToSource,
    },
    meshes: {
      ...(emptyContract.meshes ?? {}),
      names: report.meshes.meshNames,
      visibleMeshNames: report.meshes.visibleMeshNames,
      materialNames: report.meshes.materialNames,
      bodyMeshNames: report.meshes.bodyMeshNames,
      accessoryMeshNames: report.meshes.accessoryMeshNames,
      fallbackMeshNames: report.meshes.fallbackMeshNames,
      fallbackDetected: report.meshes.fallbackDetected,
      unexpectedMeshes: report.meshes.unexpectedMeshNames,
      totalVertexCount: report.meshes.totalVertexCount,
      totalTriangleCount: report.meshes.totalTriangleCount,
    },
    dimensionsMm: {
      ...seedDimensions,
      bodyBounds: seededBodyBounds ??
        (report.bounds.body
          ? {
              width: report.bounds.body.width,
              height: report.bounds.body.height,
              depth: report.bounds.body.depth,
            }
          : undefined),
      bodyBoundsUnits: seededBodyBounds ? (seededBodyBoundsUnits ?? "mm") : report.bounds.units,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: seededBodyBounds ? [] : report.warnings,
    },
  };
}

export async function buildProgrammaticBodyContractDebugReport(
  generationPayload: GeneratedBodyGeometryPayload,
  outputPath: string,
  href: string,
): Promise<Record<string, unknown>> {
  if (!generationPayload.bodyGeometryContract) {
    throw new Error("Expected generation payload to include bodyGeometryContract.");
  }
  if (!generationPayload.auditJsonPath) {
    throw new Error("Expected generation payload to include auditJsonPath.");
  }
  if (!generationPayload.glbPath) {
    throw new Error("Expected generation payload to include glbPath.");
  }

  const glbAbsolutePath = generatedModelFilePath(generationPayload.glbPath);
  const inspectionReport = await inspectGlbFile(glbAbsolutePath);
  const auditArtifactRaw = JSON.parse(await fs.readFile(generationPayload.auditJsonPath, "utf8"));
  const auditArtifact = parseBodyGeometryAuditArtifact(auditArtifactRaw);
  if (!auditArtifact) {
    throw new Error("Expected generated audit artifact to parse.");
  }

  const auditContract = generationPayload.bodyGeometryContract;
  const mergedContract = mergeAuditContractWithLoadedInspection({
    auditContract: auditContract as never,
    loadedInspectionContract: buildLoadedInspectionContractFromReport(inspectionReport, auditContract) as never,
    metadataSeed: auditContract as never,
    currentMode: (auditContract.mode ?? "unknown") as never,
    currentSourceHash: (auditContract.source as Record<string, unknown> | undefined)?.hash as string | undefined,
    loadedGlbHash: inspectionReport.file.sha256,
    runtimeInspection: {
      status: "complete",
      glbUrl: generationPayload.glbPath,
      inspectedAt: new Date().toISOString(),
      auditArtifactPresent: true,
      auditArtifactOptionalMissing: false,
      auditArtifactRequiredMissing: false,
    },
  });

  const debugReport = buildBodyGeometryDebugReport({
    contract: mergedContract,
    auditArtifact,
    exportedAt: new Date().toISOString(),
    environment: {
      pathname: "/admin",
      href,
      page: "/admin",
      userAgent: "playwright-admin-v2-operator-flow",
      featureFlags: {
        adminDebug: true,
        showBodyContractInspector: false,
      },
    },
  }) as unknown as Record<string, unknown>;

  await fs.writeFile(outputPath, JSON.stringify(debugReport, null, 2));
  return debugReport;
}
