import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BodyGeometryBoundsMm,
  BodyGeometryContract,
  BodyGeometryValidationStatus,
} from "../../lib/bodyGeometryContract.ts";

export interface BodyGeometryAuditArtifact {
  contractVersion: string;
  generatedAt?: string;
  mode: BodyGeometryContract["mode"];
  source: {
    type: BodyGeometryContract["source"]["type"];
    filename?: string;
    hash?: string;
    widthPx?: number;
    heightPx?: number;
    viewBox?: string;
    detectedBodyOnly?: boolean;
  };
  glb: {
    path?: string;
    name?: string;
    hash?: string;
    sourceHash?: string;
    generatedAt?: string;
    freshRelativeToSource?: boolean;
  };
  meshes: {
    names: string[];
    bodyMeshNames: string[];
    accessoryMeshNames: string[];
    fallbackMeshNames: string[];
    fallbackDetected: boolean;
    unexpectedMeshes: string[];
  };
  dimensionsMm: {
    bodyBounds?: BodyGeometryBoundsMm;
    bodyBoundsUnits?: BodyGeometryContract["dimensionsMm"]["bodyBoundsUnits"];
    wrapDiameterMm?: number;
    wrapWidthMm?: number;
    frontVisibleWidthMm?: number;
    expectedBodyWidthMm?: number;
    expectedBodyHeightMm?: number;
    printableTopMm?: number;
    printableBottomMm?: number;
    scaleSource?: BodyGeometryContract["dimensionsMm"]["scaleSource"];
  };
  validation: {
    status: BodyGeometryValidationStatus;
    errors: string[];
    warnings: string[];
  };
}

function normalizeStringArray(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sortDeterministic(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortDeterministic(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortDeterministic(entry)]),
    );
  }
  return value;
}

export function buildBodyGeometryAuditArtifact(
  contract: BodyGeometryContract,
): BodyGeometryAuditArtifact {
  const glbName = contract.glb.path?.split("/").pop();

  return {
    contractVersion: contract.contractVersion,
    generatedAt: contract.glb.generatedAt,
    mode: contract.mode,
    source: {
      type: contract.source.type,
      filename: contract.source.filename,
      hash: contract.source.hash,
      widthPx: contract.source.widthPx,
      heightPx: contract.source.heightPx,
      viewBox: contract.source.viewBox,
      detectedBodyOnly: contract.source.detectedBodyOnly,
    },
    glb: {
      path: contract.glb.path,
      name: glbName,
      hash: contract.glb.hash,
      sourceHash: contract.glb.sourceHash,
      generatedAt: contract.glb.generatedAt,
      freshRelativeToSource: contract.glb.freshRelativeToSource,
    },
    meshes: {
      names: normalizeStringArray(contract.meshes.names),
      bodyMeshNames: normalizeStringArray(contract.meshes.bodyMeshNames),
      accessoryMeshNames: normalizeStringArray(contract.meshes.accessoryMeshNames),
      fallbackMeshNames: normalizeStringArray(contract.meshes.fallbackMeshNames),
      fallbackDetected: contract.meshes.fallbackDetected,
      unexpectedMeshes: normalizeStringArray(contract.meshes.unexpectedMeshes),
    },
    dimensionsMm: {
      bodyBounds: contract.dimensionsMm.bodyBounds,
      bodyBoundsUnits: contract.dimensionsMm.bodyBoundsUnits,
      wrapDiameterMm: contract.dimensionsMm.wrapDiameterMm,
      wrapWidthMm: contract.dimensionsMm.wrapWidthMm,
      frontVisibleWidthMm: contract.dimensionsMm.frontVisibleWidthMm,
      expectedBodyWidthMm: contract.dimensionsMm.expectedBodyWidthMm,
      expectedBodyHeightMm: contract.dimensionsMm.expectedBodyHeightMm,
      printableTopMm: contract.dimensionsMm.printableTopMm,
      printableBottomMm: contract.dimensionsMm.printableBottomMm,
      scaleSource: contract.dimensionsMm.scaleSource,
    },
    validation: {
      status: contract.validation.status,
      errors: normalizeStringArray(contract.validation.errors),
      warnings: normalizeStringArray(contract.validation.warnings),
    },
  };
}

export function buildBodyGeometryAuditAbsolutePath(glbAbsolutePath: string): string {
  const parsedPath = path.parse(glbAbsolutePath);
  return path.join(parsedPath.dir, `${parsedPath.name}.audit.json`);
}

export function serializeBodyGeometryAuditArtifact(
  artifact: BodyGeometryAuditArtifact,
): string {
  return `${JSON.stringify(sortDeterministic(artifact), null, 2)}\n`;
}

export async function writeBodyGeometryAuditArtifact(args: {
  glbAbsolutePath: string;
  contract: BodyGeometryContract;
}): Promise<{
  auditAbsolutePath: string | null;
  artifact: BodyGeometryAuditArtifact;
}> {
  const auditAbsolutePath = buildBodyGeometryAuditAbsolutePath(args.glbAbsolutePath);
  const artifact = buildBodyGeometryAuditArtifact(args.contract);
  try {
    await mkdir(path.dirname(auditAbsolutePath), { recursive: true });
    await writeFile(
      auditAbsolutePath,
      serializeBodyGeometryAuditArtifact(artifact),
      "utf8",
    );
    return {
      auditAbsolutePath,
      artifact,
    };
  } catch {
    return {
      auditAbsolutePath: null,
      artifact,
    };
  }
}
