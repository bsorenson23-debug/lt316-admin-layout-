import {
  deriveCanonicalBodyContract,
  type CanonicalBodyContractQA,
} from "./canonicalDimensionCalibration.ts";
import {
  buildPrintableSurfaceResolution,
  type PrintableSurfaceDetection,
  type PrintableSurfaceResolution,
} from "./printableSurface.ts";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "../types/productTemplate.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";

export const BODY_REFERENCE_CONTRACT_VERSION = 1;

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter((warning) => warning.trim().length > 0))];
}

function mergeSeverity(
  current: CanonicalBodyContractQA["severity"],
  next: CanonicalBodyContractQA["severity"],
): CanonicalBodyContractQA["severity"] {
  if (current === "action" || next === "action") return "action";
  if (current === "review" || next === "review") return "review";
  return "ready";
}

export interface BodyReferencePipelineResult {
  outline: EditableBodyOutline | null;
  canonicalBodyProfile: CanonicalBodyProfile;
  canonicalDimensionCalibration: CanonicalDimensionCalibration;
  printableSurfaceResolution: PrintableSurfaceResolution;
  warnings: string[];
  qa: CanonicalBodyContractQA;
}

export interface DeriveBodyReferencePipelineArgs {
  outline: EditableBodyOutline | null | undefined;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  wrapDiameterMm: number;
  baseDiameterMm?: number | null;
  handleArcDeg?: number;
  handleSide?: "left" | "right" | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  printableTopOverrideMm?: number | null;
  printableBottomOverrideMm?: number | null;
  baseBandStartMm?: number | null;
  detection?: PrintableSurfaceDetection | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
}

export function createPersistedBodyReferencePipeline(args: {
  outline: EditableBodyOutline | null | undefined;
  canonicalBodyProfile: CanonicalBodyProfile | null | undefined;
  canonicalDimensionCalibration: CanonicalDimensionCalibration | null | undefined;
  printableSurfaceResolution: PrintableSurfaceResolution | null | undefined;
  bodyReferenceQA?: CanonicalBodyContractQA | null | undefined;
  bodyReferenceWarnings?: string[] | null | undefined;
  bodyReferenceContractVersion?: number | null | undefined;
}): BodyReferencePipelineResult | null {
  if (
    !args.canonicalBodyProfile ||
    !args.canonicalDimensionCalibration ||
    !args.printableSurfaceResolution
  ) {
    return null;
  }

  const structuralIssues = validatePersistedBodyReferenceContract({
    canonicalBodyProfile: args.canonicalBodyProfile,
    canonicalDimensionCalibration: args.canonicalDimensionCalibration,
    printableSurfaceResolution: args.printableSurfaceResolution,
    bodyReferenceContractVersion: args.bodyReferenceContractVersion,
    bodyReferenceQA: args.bodyReferenceQA,
  });
  if (structuralIssues.length > 0) {
    return null;
  }

  const warnings: string[] = [];
  if (
    args.printableSurfaceResolution.printableSurfaceContract.printableTopMm >=
    args.printableSurfaceResolution.printableSurfaceContract.printableBottomMm
  ) {
    warnings.push("Printable top is greater than or equal to printable bottom.");
  }
  if (args.printableSurfaceResolution.automaticDetectionWeak) {
    warnings.push("Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry.");
  }

  const qaWarnings = dedupeWarnings(warnings);
  const shellAuthority: CanonicalBodyContractQA["shellAuthority"] =
    args.bodyReferenceQA?.shellAuthority ??
    (
      args.outline?.sourceContour?.length || args.outline?.directContour?.length
        ? "outline-profile"
        : "dimensional-seed"
    );
  const blockingPrintableIssue = qaWarnings.some((issue) =>
    issue === "Printable top is greater than or equal to printable bottom." ||
    issue === "Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry.",
  );
  const severity: CanonicalBodyContractQA["severity"] =
    blockingPrintableIssue
      ? "action"
      : (qaWarnings.length > 0 ? "review" : "ready");
  return {
    outline: args.outline ?? null,
    canonicalBodyProfile: args.canonicalBodyProfile,
    canonicalDimensionCalibration: {
      ...args.canonicalDimensionCalibration,
      axialSurfaceBands: args.printableSurfaceResolution.axialSurfaceBands,
      printableSurfaceContract: args.printableSurfaceResolution.printableSurfaceContract,
    },
    printableSurfaceResolution: args.printableSurfaceResolution,
    warnings: qaWarnings,
    qa: {
      pass: !blockingPrintableIssue && severity !== "action",
      severity,
      shellAuthority,
      scaleAuthority: args.bodyReferenceQA?.scaleAuthority ?? "validated-midband-ratio",
      acceptedRowCount: args.bodyReferenceQA?.acceptedRowCount ?? args.canonicalBodyProfile.samples.length,
      rejectedRowCount: args.bodyReferenceQA?.rejectedRowCount ?? 0,
      fallbackMode: args.bodyReferenceQA?.fallbackMode ?? "none",
      issues: qaWarnings,
    },
  };
}

export function deriveBodyReferencePipeline(
  args: DeriveBodyReferencePipelineArgs,
): BodyReferencePipelineResult | null {
  const canonicalContract = deriveCanonicalBodyContract({
    outline: args.outline,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    wrapDiameterMm: args.wrapDiameterMm,
    baseDiameterMm: args.baseDiameterMm,
    handleArcDeg: args.handleArcDeg,
    handleSide: args.handleSide,
    fitDebug: args.fitDebug,
  });
  if (!canonicalContract) return null;

  const printableSurfaceResolution = buildPrintableSurfaceResolution({
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    lidSeamFromOverallMm: args.lidSeamFromOverallMm,
    silverBandBottomFromOverallMm: args.silverBandBottomFromOverallMm,
    printableTopOverrideMm: args.printableTopOverrideMm,
    printableBottomOverrideMm: args.printableBottomOverrideMm,
    baseBandStartMm: args.baseBandStartMm,
    handleKeepOutStartMm:
      canonicalContract.canonicalDimensionCalibration.wrapMappingMm.handleKeepOutStartMm,
    handleKeepOutEndMm:
      canonicalContract.canonicalDimensionCalibration.wrapMappingMm.handleKeepOutEndMm,
    detection: args.detection,
  });

  const warnings = dedupeWarnings([
    ...canonicalContract.qa.issues,
    printableSurfaceResolution.printableSurfaceContract.printableTopMm >=
    printableSurfaceResolution.printableSurfaceContract.printableBottomMm
      ? "Printable top is greater than or equal to printable bottom."
      : "",
    printableSurfaceResolution.automaticDetectionWeak
      ? "Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry."
      : "",
  ]);

  const blockingPrintableIssue =
    printableSurfaceResolution.printableSurfaceContract.printableTopMm >=
      printableSurfaceResolution.printableSurfaceContract.printableBottomMm ||
    printableSurfaceResolution.automaticDetectionWeak;
  const severity = blockingPrintableIssue
    ? mergeSeverity(canonicalContract.qa.severity, "action")
    : canonicalContract.qa.severity;

  return {
    outline: args.outline ?? null,
    canonicalBodyProfile: canonicalContract.canonicalBodyProfile,
    canonicalDimensionCalibration: {
      ...canonicalContract.canonicalDimensionCalibration,
      axialSurfaceBands: printableSurfaceResolution.axialSurfaceBands,
      printableSurfaceContract: printableSurfaceResolution.printableSurfaceContract,
    },
    printableSurfaceResolution,
    warnings,
    qa: {
      ...canonicalContract.qa,
      pass: canonicalContract.qa.pass && !blockingPrintableIssue,
      severity,
      issues: warnings,
    },
  };
}

function measurementToleranceMm(radiusMm: number): number {
  return Math.max(2, Math.abs(radiusMm) * 0.08);
}

function validatePersistedBodyReferenceContract(args: {
  canonicalBodyProfile: CanonicalBodyProfile;
  canonicalDimensionCalibration: CanonicalDimensionCalibration;
  printableSurfaceResolution: PrintableSurfaceResolution;
  bodyReferenceContractVersion?: number | null | undefined;
  bodyReferenceQA?: CanonicalBodyContractQA | null | undefined;
}): string[] {
  const issues: string[] = [];
  const contractVersion = args.bodyReferenceContractVersion;
  if (
    contractVersion != null &&
    Number.isFinite(contractVersion) &&
    contractVersion !== BODY_REFERENCE_CONTRACT_VERSION
  ) {
    issues.push("Persisted BODY REFERENCE contract version is stale.");
  }

  const samples = args.canonicalBodyProfile.samples;
  if (samples.length === 0) {
    issues.push("Persisted canonical body profile is missing samples.");
    return issues;
  }

  const transform = args.canonicalDimensionCalibration.photoToFrontTransform.matrix;
  const sx = transform[0] ?? 0;
  const sy = transform[4] ?? 0;
  if (!Number.isFinite(sx) || sx <= 0 || !Number.isFinite(sy) || sy <= 0) {
    issues.push("Persisted photo-to-front transform is invalid.");
  }

  const monotonicYmm = samples.every((sample, index) =>
    index === 0 || sample.yMm > (samples[index - 1]?.yMm ?? Number.NEGATIVE_INFINITY),
  );
  const monotonicYpx = samples.every((sample, index) =>
    index === 0 || sample.yPx > (samples[index - 1]?.yPx ?? Number.NEGATIVE_INFINITY),
  );
  if (!monotonicYmm) {
    issues.push("Persisted canonical body sample rows are not strictly increasing in mm space.");
  }
  if (!monotonicYpx) {
    issues.push("Persisted canonical body sample rows are not strictly increasing in source-contour space.");
  }

  const invalidSmallRadiusRow = samples.find((sample) =>
    sample.radiusPx < 15 && sample.radiusMm > 12,
  );
  if (invalidSmallRadiusRow) {
    issues.push("Persisted sample rows contain small-radius measurements that exceed the allowed mm envelope.");
  }

  const maxSampleDiameterMm = samples.reduce(
    (max, sample) => Math.max(max, sample.radiusMm * 2),
    0,
  );
  if (
    Math.abs(maxSampleDiameterMm - args.canonicalDimensionCalibration.frontVisibleWidthMm) > 0.75
  ) {
    issues.push("Persisted front visible width no longer matches the canonical sample envelope.");
  }

  if (
    args.canonicalDimensionCalibration.wrapDiameterMm > 0 &&
    Math.abs(
      args.canonicalDimensionCalibration.frontVisibleWidthMm -
      args.canonicalDimensionCalibration.wrapDiameterMm,
    ) > 0.75
  ) {
    issues.push("Persisted front visible width differs from the expected body diameter tolerance.");
  }

  const printableContract = args.printableSurfaceResolution.printableSurfaceContract;
  if (printableContract.printableTopMm >= printableContract.printableBottomMm) {
    issues.push("Persisted printable surface bounds are inverted.");
  }

  const requiresValidatedRatio = args.bodyReferenceQA?.scaleAuthority === "validated-midband-ratio";
  const consistentRows = samples.filter((sample) =>
    sample.radiusPx > 0 &&
    Number.isFinite(sx) &&
    Math.abs((sample.radiusPx * sx) - sample.radiusMm) <= measurementToleranceMm(sample.radiusMm),
  );
  const severeMismatchRow = samples.find((sample) =>
    sample.radiusPx > 0 &&
    Number.isFinite(sx) &&
    Math.abs((sample.radiusPx * sx) - sample.radiusMm) >
      Math.max(6, measurementToleranceMm(sample.radiusMm) * 2),
  );
  if (
    requiresValidatedRatio &&
    consistentRows.length < Math.max(12, Math.round(samples.length * 0.12))
  ) {
    issues.push("Persisted BODY REFERENCE rows no longer satisfy the validated mid-band scale contract.");
  }
  if (requiresValidatedRatio && severeMismatchRow) {
    issues.push("Persisted BODY REFERENCE rows contain severe transform-to-radius drift.");
  }

  return dedupeWarnings(issues);
}
