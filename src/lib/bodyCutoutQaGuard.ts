import type { BodyGeometryContract } from "./bodyGeometryContract.ts";
import { isBodyOnlyMode } from "./bodyGeometryContract.ts";

export type BodyCutoutQaGuardReason =
  | "missing-body"
  | "fallback-detected"
  | "accessory-detected"
  | "stale-glb"
  | "unknown-freshness"
  | "inspection-unavailable"
  | "units-unknown"
  | "validation-fail"
  | "validation-warn";

export interface BodyCutoutQaGuardState {
  severity: "warn" | "fail";
  reason: BodyCutoutQaGuardReason;
  title: string;
  message: string;
  blockingIssue: string | null;
}

function hasUnknownFreshness(contract: BodyGeometryContract): boolean {
  return (
    Boolean(contract.source.hash) &&
    contract.glb.freshRelativeToSource == null
  );
}

function hasUnknownUnits(contract: BodyGeometryContract): boolean {
  return contract.dimensionsMm.bodyBoundsUnits === "scene-units";
}

function isInspectionPending(contract: BodyGeometryContract): boolean {
  return contract.runtimeInspection?.status === "pending";
}

export function buildBodyCutoutQaGuardState(args: {
  mode: BodyGeometryContract["mode"] | null | undefined;
  contract: BodyGeometryContract | null | undefined;
}): BodyCutoutQaGuardState | null {
  const { mode, contract } = args;
  if (!isBodyOnlyMode(mode) || !contract) {
    return null;
  }

  if (contract.meshes.fallbackDetected || contract.meshes.fallbackMeshNames.length > 0) {
    return {
      severity: "fail",
      reason: "fallback-detected",
      title: "BODY CUTOUT QA FAILED",
      message: "Fallback geometry detected — not valid for BODY CUTOUT QA.",
      blockingIssue: "Fallback geometry detected — not valid for BODY CUTOUT QA.",
    };
  }

  if (contract.meshes.accessoryMeshNames.length > 0) {
    return {
      severity: "fail",
      reason: "accessory-detected",
      title: "BODY CUTOUT QA FAILED",
      message: "Accessory meshes detected — BODY CUTOUT QA expects body-only geometry.",
      blockingIssue: "Accessory meshes detected — BODY CUTOUT QA expects body-only geometry.",
    };
  }

  if (contract.runtimeInspection?.status === "failed") {
    return {
      severity: "warn",
      reason: "inspection-unavailable",
      title: "BODY CUTOUT QA WARNING",
      message: "Loaded-scene inspection unavailable; using generated audit metadata.",
      blockingIssue: null,
    };
  }

  if (contract.validation.status === "pass" || contract.validation.status === "unknown") {
    return null;
  }

  if (
    contract.glb.freshRelativeToSource === false ||
    (
      Boolean(contract.source.hash) &&
      Boolean(contract.glb.sourceHash) &&
      contract.source.hash !== contract.glb.sourceHash
    )
  ) {
    return {
      severity: "fail",
      reason: "stale-glb",
      title: "BODY CUTOUT QA FAILED",
      message: "GLB is stale relative to the current approved body contour.",
      blockingIssue: "GLB is stale relative to the current approved body contour.",
    };
  }

  if (hasUnknownFreshness(contract)) {
    return {
      severity: "warn",
      reason: "unknown-freshness",
      title: "BODY CUTOUT QA WARNING",
      message: "GLB freshness could not be verified — BODY CUTOUT QA is not confirmed.",
      blockingIssue: null,
    };
  }

  if (isInspectionPending(contract) && contract.meshes.bodyMeshNames.length === 0) {
    return null;
  }

  if (contract.meshes.bodyMeshNames.length === 0) {
    return {
      severity: "fail",
      reason: "missing-body",
      title: "BODY CUTOUT QA FAILED",
      message: "No body mesh found.",
      blockingIssue: "No body mesh found.",
    };
  }

  if (hasUnknownUnits(contract)) {
    return {
      severity: "warn",
      reason: "units-unknown",
      title: "BODY CUTOUT QA WARNING",
      message: "Body mesh units are unclear — BODY CUTOUT QA scale is not confirmed.",
      blockingIssue: null,
    };
  }

  if (contract.validation.status === "fail") {
    return {
      severity: "fail",
      reason: "validation-fail",
      title: "BODY CUTOUT QA FAILED",
      message: contract.validation.errors[0] ?? "BODY CUTOUT QA validation failed.",
      blockingIssue: contract.validation.errors[0] ?? "BODY CUTOUT QA validation failed.",
    };
  }

  return {
    severity: "warn",
    reason: "validation-warn",
    title: "BODY CUTOUT QA WARNING",
    message: contract.validation.warnings[0] ?? "BODY CUTOUT QA has unresolved validation warnings.",
    blockingIssue: null,
  };
}
