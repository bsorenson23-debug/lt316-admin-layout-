import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  CanonicalHandleProfile,
  EditableBodyOutline,
} from "@/types/productTemplate";
import type { BodyGeometryContract } from "@/lib/bodyGeometryContract";
import type { BodyReferenceVisualLikenessReport } from "@/lib/bodyReferenceVisualLikeness";
import type { BodyReferenceGlbRenderMode } from "@/lib/bodyReferenceGlbSource";
import { parseBodyReferenceGlbResponse } from "@/lib/adminApi.schema";

export async function generateBodyReferenceGlb(
  args: {
    renderMode?: BodyReferenceGlbRenderMode | null;
    templateName?: string | null;
    matchedProfileId?: string | null;
    bodyOutlineSourceMode?: EditableBodyOutline["sourceContourMode"] | null;
    bodyOutline?: EditableBodyOutline | null;
    canonicalBodyProfile: CanonicalBodyProfile;
    canonicalDimensionCalibration: CanonicalDimensionCalibration;
    canonicalHandleProfile?: CanonicalHandleProfile | null;
    lidProfile?: EditableBodyOutline | null;
    silverProfile?: EditableBodyOutline | null;
    bodyColorHex?: string | null;
    lidColorHex?: string | null;
    rimColorHex?: string | null;
    lidSeamFromOverallMm?: number | null;
    silverBandBottomFromOverallMm?: number | null;
    topOuterDiameterMm?: number | null;
  },
  traceHeaders?: HeadersInit,
): Promise<{
  glbPath: string;
  auditJsonPath?: string | null;
  modelStatus?: "generated-reviewed-model";
  renderMode?: BodyReferenceGlbRenderMode | null;
  generatedSourceSignature?: string | null;
  modelSourceLabel?: string | null;
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
  bodyGeometrySource?: string | null;
  lidGeometrySource?: string | null;
  ringGeometrySource?: string | null;
  meshNames?: string[];
  fallbackMeshNames?: string[];
  bodyMeshBounds?: {
    minMm: { x: number; y: number; z: number };
    maxMm: { x: number; y: number; z: number };
    sizeMm: { x: number; y: number; z: number };
  } | null;
  visualLikeness?: BodyReferenceVisualLikenessReport;
  silhouetteAudit?: {
    authority: "body-cutout-qa-silhouette";
    scaleContract: "canonical sample radiusMm";
    pass: boolean;
    toleranceMm: number;
    maxDeviationMm: number;
    meanDeviationMm: number;
    approvedWidthMm: number;
    meshWidthMm: number;
    widthDeviationMm: number;
    approvedHeightMm: number;
    meshHeightMm: number;
    heightDeviationMm: number;
    wrapDiameterMm: number;
    frontVisibleWidthMm: number;
    approvedContourCount: number;
    meshRowCount: number;
    sampleCount: number;
    rows: Array<{
      yOverallMm: number;
      approvedRadiusMm: number;
      meshRadiusMm: number;
      deviationMm: number;
    }>;
    artifactPaths: {
      jsonPath: string | null;
      svgPath: string | null;
    } | null;
  };
  bodyGeometryContract?: BodyGeometryContract;
}> {
  const res = await fetch("/api/admin/tumbler/generate-body-reference-glb", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(traceHeaders ?? {}),
    },
    body: JSON.stringify(args),
  });

  const payload = await res.json();
  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Failed to generate a cutout-driven GLB.";
    throw new Error(message);
  }

  const parsed = parseBodyReferenceGlbResponse(payload);
  if (!parsed?.glbPath?.trim()) {
    throw new Error("Cutout-driven GLB generation returned an invalid response.");
  }
  return parsed;
}
