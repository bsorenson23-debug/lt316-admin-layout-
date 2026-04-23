import {
  type BodyGeometryContract,
  type BodyGeometryValidationStatus,
} from "./bodyGeometryContract.ts";
import {
  buildWrapExportPreviewState,
  getWrapExportMappingStatusLabel,
} from "./wrapExportPreviewState.ts";
import { getWrapExportBadgeNote } from "./wrapExportCopy.ts";

export interface BodyGeometryStatusBadgeState {
  title: string;
  status: BodyGeometryValidationStatus;
  sourceLabel: string;
  geometryLabel: string;
  fallbackLabel: string;
  glbLabel: string;
  qaLabel: string;
  validForBodyQa: boolean | null;
  mappingLabel: string | null;
}

function humanizeSourceType(type: BodyGeometryContract["source"]["type"] | undefined): string {
  switch (type) {
    case "approved-svg":
      return "Approved SVG";
    case "body-reference-v2":
      return "BODY REFERENCE v2";
    case "uploaded-svg":
      return "Uploaded SVG";
    case "generated":
      return "Generated";
    case "fallback":
      return "Fallback";
    default:
      return "Unknown";
  }
}

function titleForMode(mode: BodyGeometryContract["mode"] | null | undefined): string {
  switch (mode) {
    case "body-cutout-qa":
      return "BODY CUTOUT QA";
    case "full-model":
      return "FULL MODEL PREVIEW";
    case "alignment-model":
      return "ALIGNMENT PREVIEW";
    case "source-traced":
      return "SOURCE COMPARE";
    case "hybrid-preview":
      return "HYBRID PREVIEW";
    case "wrap-export":
      return "WRAP / EXPORT PREVIEW";
    default:
      return "PREVIEW";
  }
}

function geometryLabelForContract(contract: BodyGeometryContract | null): string {
  if (!contract) return "Unknown";
  const hasBody = contract.meshes.bodyMeshNames.length > 0;
  const hasAccessory = contract.meshes.accessoryMeshNames.length > 0;
  const hasFallback = contract.meshes.fallbackMeshNames.length > 0;
  if (!hasBody && !hasAccessory && !hasFallback) return "Unknown";
  if (hasBody && !hasAccessory && !hasFallback) return "Body only";
  if (hasBody && (hasAccessory || hasFallback)) return "Body + extras";
  if (hasAccessory || hasFallback) return "Accessories only";
  return "Unknown";
}

function fallbackLabelForContract(contract: BodyGeometryContract | null): string {
  if (!contract) return "Unknown";
  return contract.meshes.fallbackDetected ? "Detected" : "Disabled";
}

function glbLabelForContract(contract: BodyGeometryContract | null): string {
  if (!contract) return "Unknown";
  if (contract.glb.freshRelativeToSource === true) return "Fresh";
  if (contract.glb.freshRelativeToSource === false) return "Stale";
  return "Unknown";
}

export function buildBodyGeometryStatusBadgeState(args: {
  mode: BodyGeometryContract["mode"] | null | undefined;
  contract: BodyGeometryContract | null;
}): BodyGeometryStatusBadgeState {
  const { mode, contract } = args;
  const wrapExportPreviewState = mode === "wrap-export"
    ? buildWrapExportPreviewState(contract)
    : null;
  const status = wrapExportPreviewState?.status ?? contract?.validation.status ?? "unknown";
  const sourceLabel = humanizeSourceType(contract?.source.type);
  const geometryLabel = geometryLabelForContract(contract);
  const fallbackLabel = fallbackLabelForContract(contract);
  const glbLabel = glbLabelForContract(contract);
  const isBodyCutoutQa = mode === "body-cutout-qa";
  let qaLabel = "Not valid for body contour QA";
  let validForBodyQa: boolean | null = false;

  if (isBodyCutoutQa) {
    if (status === "pass") {
      qaLabel = "Valid for body contour QA";
      validForBodyQa = true;
    } else if (status === "warn") {
      qaLabel = "QA warning - review details";
      validForBodyQa = false;
    } else if (status === "fail") {
      qaLabel = "Not valid for body contour QA";
      validForBodyQa = false;
    } else {
      qaLabel = "QA status unknown";
      validForBodyQa = null;
    }
  } else if (mode === "wrap-export") {
    qaLabel = getWrapExportBadgeNote(wrapExportPreviewState?.mappingStatus ?? "unknown");
  }

  return {
    title: titleForMode(mode),
    status,
    sourceLabel,
    geometryLabel,
    fallbackLabel,
    glbLabel,
    qaLabel,
    validForBodyQa,
    mappingLabel: wrapExportPreviewState
      ? getWrapExportMappingStatusLabel(wrapExportPreviewState.mappingStatus)
      : null,
  };
}
