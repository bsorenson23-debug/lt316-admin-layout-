import type { CanonicalDimensionCalibration, ProductTemplate, ProductTemplateDimensions } from "../types/productTemplate.ts";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "../types/printableSurface.ts";
import { isFiniteNumber } from "../utils/guards.ts";

export type PrintableSurfaceBoundarySource =
  | "manual-override"
  | "persisted-contract"
  | "rim-ring"
  | "body-top-fallback"
  | "base-band"
  | "body-bottom-fallback";

export type PrintableSurfaceAuthoritySource =
  | "manual-override"
  | "persisted-contract"
  | "derived-fallback";

export interface PrintableSurfaceRepairMetadata {
  persistedContractSource: "top-level" | "canonical" | null;
  contractsDisagreed: boolean;
  normalizedTopLevel: boolean;
  normalizedCanonical: boolean;
}

export interface PrintableSurfaceDetection {
  source: "fit-debug" | "photo-row-scan" | "none";
  lidSeamFromOverallMm?: number | null;
  rimRingBottomFromOverallMm?: number | null;
  confidence: number;
}

export interface PrintableSurfaceResolution {
  printableSurfaceContract: PrintableSurfaceContract;
  axialSurfaceBands: AxialSurfaceBand[];
  printableTopFromBodyTopMm: number;
  printableBottomFromBodyTopMm: number;
  topBoundarySource: PrintableSurfaceBoundarySource;
  bottomBoundarySource: PrintableSurfaceBoundarySource;
  authoritySource: PrintableSurfaceAuthoritySource;
  topConfidence: number;
  bottomConfidence: number;
  automaticDetectionWeak: boolean;
  repair: PrintableSurfaceRepairMetadata | null;
}

export interface BuildPrintableSurfaceResolutionArgs {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  printableTopOverrideMm?: number | null;
  printableBottomOverrideMm?: number | null;
  baseBandStartMm?: number | null;
  handleKeepOutStartMm?: number | null;
  handleKeepOutEndMm?: number | null;
  detection?: PrintableSurfaceDetection | null;
}

interface BuildFixedPrintableSurfaceResolutionArgs {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  printableTopMm: number;
  printableBottomMm: number;
  lidBoundaryMm?: number | null;
  rimBoundaryMm?: number | null;
  baseBandStartMm?: number | null;
  handleKeepOutStartMm?: number | null;
  handleKeepOutEndMm?: number | null;
  topBoundarySource: PrintableSurfaceBoundarySource;
  bottomBoundarySource: PrintableSurfaceBoundarySource;
  authoritySource: PrintableSurfaceAuthoritySource;
  topConfidence: number;
  bottomConfidence: number;
  automaticDetectionWeak: boolean;
  repair?: PrintableSurfaceRepairMetadata | null;
}

interface ResolveAuthoritativePrintableSurfaceArgs {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  topLevelContract?: PrintableSurfaceContract | null;
  canonicalContract?: PrintableSurfaceContract | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  printableTopOverrideMm?: number | null;
  printableBottomOverrideMm?: number | null;
  baseBandStartMm?: number | null;
  handleKeepOutStartMm?: number | null;
  handleKeepOutEndMm?: number | null;
  detection?: PrintableSurfaceDetection | null;
}

interface NormalizedTemplatePrintableSurfaceResult {
  template: ProductTemplate;
  changed: boolean;
  resolution: PrintableSurfaceResolution | null;
}

function resolveBodyBoundsPrintableSurfaceContract(
  template: ProductTemplate,
): PrintableSurfaceContract | null {
  if (template.productType === "flat") return null;
  const overallHeightMm =
    template.dimensions.overallHeightMm ??
    template.dimensions.canonicalDimensionCalibration?.totalHeightMm;
  const bodyTopMm =
    template.dimensions.bodyTopFromOverallMm ??
    template.dimensions.canonicalDimensionCalibration?.lidBodyLineMm ??
    template.dimensions.topMarginMm;
  const bodyBottomMm =
    overallHeightMm != null
      ? resolveBodyBottomFromOverallMm(template.dimensions, overallHeightMm)
      : null;
  if (!isFiniteNumber(bodyTopMm) || !isFiniteNumber(bodyBottomMm) || (bodyBottomMm ?? 0) <= (bodyTopMm ?? 0)) {
    return null;
  }
  return {
    printableTopMm: round2(bodyTopMm ?? 0),
    printableBottomMm: round2(bodyBottomMm ?? 0),
    printableHeightMm: round2((bodyBottomMm ?? 0) - (bodyTopMm ?? 0)),
    axialExclusions: [],
    circumferentialExclusions: [],
  };
}

function shouldRepairPersistedPrintableSurfaceFromBodyReference(args: {
  template: ProductTemplate;
  resolution: PrintableSurfaceResolution;
  bodyBoundsContract: PrintableSurfaceContract | null;
}): boolean {
  const { template, resolution, bodyBoundsContract } = args;
  if (!bodyBoundsContract) return false;
  if (isFiniteNumber(template.dimensions.printableTopOverrideMm) || isFiniteNumber(template.dimensions.printableBottomOverrideMm)) {
    return false;
  }
  if (template.dimensions.bodyReferenceQA?.pass !== true && !isFiniteNumber(template.dimensions.bodyReferenceContractVersion)) {
    return false;
  }

  const currentContract = resolution.printableSurfaceContract;
  const currentTopMm = currentContract.printableTopMm;
  const currentBottomMm = currentContract.printableBottomMm;
  const bodyBoundsTopMm = bodyBoundsContract.printableTopMm;
  const bodyBoundsBottomMm = bodyBoundsContract.printableBottomMm;
  const silverBandBottomMm = template.dimensions.silverBandBottomFromOverallMm;
  const rimBoundaryMm =
    currentContract.axialExclusions.find((band) => band.kind === "rim-ring")?.endMm ?? null;

  const topCollapsedToRingBoundary =
    (
      isFiniteNumber(silverBandBottomMm) &&
      Math.abs(currentTopMm - (silverBandBottomMm ?? currentTopMm)) <= 0.5
    ) ||
    (
      isFiniteNumber(rimBoundaryMm) &&
      Math.abs(currentTopMm - (rimBoundaryMm ?? currentTopMm)) <= 0.5
    );
  const topShouldUseBodyBounds = bodyBoundsTopMm + 5 < currentTopMm;
  const bottomStillMatchesBodyBounds = Math.abs(currentBottomMm - bodyBoundsBottomMm) <= 5;

  return topCollapsedToRingBoundary && topShouldUseBodyBounds && bottomStillMatchesBodyBounds;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeS(valueMm: number, totalHeightMm: number): number {
  if (!(totalHeightMm > 0)) return 0;
  return clamp(valueMm / totalHeightMm, 0, 1);
}

function addBand(
  bands: AxialSurfaceBand[],
  totalHeightMm: number,
  kind: AxialSurfaceBand["kind"],
  startMm: number,
  endMm: number,
  printable: boolean,
  confidence: number,
): void {
  const normalizedStart = clamp(startMm, 0, totalHeightMm);
  const normalizedEnd = clamp(endMm, normalizedStart, totalHeightMm);
  if (normalizedEnd - normalizedStart < 0.1) return;
  bands.push({
    id: `${kind}-${bands.length + 1}`,
    kind,
    sStart: round2(normalizeS(normalizedStart, totalHeightMm)),
    sEnd: round2(normalizeS(normalizedEnd, totalHeightMm)),
    printable,
    confidence: round2(clamp(confidence, 0, 1)),
  });
}

function resolveBodyBottomFromOverallMm(dims: ProductTemplateDimensions, overallHeightMm: number): number | null {
  if (isFiniteNumber(dims.bodyBottomFromOverallMm)) {
    return dims.bodyBottomFromOverallMm ?? null;
  }
  if (isFiniteNumber(dims.bottomMarginMm)) {
    return Math.max(0, overallHeightMm - (dims.bottomMarginMm ?? 0));
  }
  if (isFiniteNumber(dims.bodyHeightMm) && isFiniteNumber(dims.bodyTopFromOverallMm)) {
    return (dims.bodyTopFromOverallMm ?? 0) + (dims.bodyHeightMm ?? 0);
  }
  if (dims.printableSurfaceContract && isFiniteNumber(dims.printableSurfaceContract.printableBottomMm)) {
    return dims.printableSurfaceContract.printableBottomMm;
  }
  return null;
}

function printableSurfaceContractsEqual(
  left: PrintableSurfaceContract | null | undefined,
  right: PrintableSurfaceContract | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function axialSurfaceBandsEqual(
  left: AxialSurfaceBand[] | null | undefined,
  right: AxialSurfaceBand[] | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isValidPrintableSurfaceContract(
  contract: PrintableSurfaceContract | null | undefined,
  bodyTopMm: number,
  bodyBottomMm: number,
): contract is PrintableSurfaceContract {
  if (!contract) return false;
  if (!isFiniteNumber(contract.printableTopMm) || !isFiniteNumber(contract.printableBottomMm)) {
    return false;
  }
  const top = contract.printableTopMm ?? 0;
  const bottom = contract.printableBottomMm ?? 0;
  if (!(bottom > top)) return false;
  if (top < bodyTopMm - 0.01 || bottom > bodyBottomMm + 0.01) {
    return false;
  }
  return true;
}

function resolvePersistedBaseBandStartMm(
  contract: PrintableSurfaceContract | null | undefined,
): number | null {
  const baseBand = contract?.axialExclusions.find((band) => band.kind === "base");
  if (baseBand && isFiniteNumber(baseBand.startMm)) {
    return baseBand.startMm;
  }
  return null;
}

function resolvePersistedLidBoundaryMm(
  contract: PrintableSurfaceContract | null | undefined,
): number | null {
  const lidBand = contract?.axialExclusions.find((band) => band.kind === "lid");
  if (lidBand && isFiniteNumber(lidBand.endMm)) {
    return lidBand.endMm;
  }
  return null;
}

function resolvePersistedRimBoundaryMm(
  contract: PrintableSurfaceContract | null | undefined,
): number | null {
  const rimBand = contract?.axialExclusions.find((band) => band.kind === "rim-ring");
  if (rimBand && isFiniteNumber(rimBand.endMm)) {
    return rimBand.endMm;
  }
  return null;
}

function resolvePersistedHandleKeepOutMm(
  contract: PrintableSurfaceContract | null | undefined,
): { startMm: number | null; endMm: number | null } {
  const handleBand = contract?.circumferentialExclusions[0];
  return {
    startMm: handleBand && isFiniteNumber(handleBand.startMm) ? handleBand.startMm : null,
    endMm: handleBand && isFiniteNumber(handleBand.endMm) ? handleBand.endMm : null,
  };
}

function selectPersistedPrintableSurfaceContract(args: {
  topLevelContract?: PrintableSurfaceContract | null;
  canonicalContract?: PrintableSurfaceContract | null;
  bodyTopMm: number;
  bodyBottomMm: number;
}): {
  contract: PrintableSurfaceContract | null;
  source: "top-level" | "canonical" | null;
  contractsDisagreed: boolean;
} {
  const topLevelValid = isValidPrintableSurfaceContract(args.topLevelContract, args.bodyTopMm, args.bodyBottomMm);
  const canonicalValid = isValidPrintableSurfaceContract(args.canonicalContract, args.bodyTopMm, args.bodyBottomMm);
  const contractsDisagreed =
    topLevelValid &&
    canonicalValid &&
    !printableSurfaceContractsEqual(args.topLevelContract, args.canonicalContract);

  if (topLevelValid) {
    return {
      contract: args.topLevelContract ?? null,
      source: "top-level",
      contractsDisagreed,
    };
  }
  if (canonicalValid) {
    return {
      contract: args.canonicalContract ?? null,
      source: "canonical",
      contractsDisagreed,
    };
  }
  return {
    contract: null,
    source: null,
    contractsDisagreed: false,
  };
}

function buildFixedPrintableSurfaceResolution(
  args: BuildFixedPrintableSurfaceResolutionArgs,
): PrintableSurfaceResolution {
  const overallHeightMm = round2(Math.max(0, args.overallHeightMm));
  const bodyTopMm = round2(clamp(args.bodyTopFromOverallMm, 0, overallHeightMm));
  const bodyBottomMm = round2(clamp(args.bodyBottomFromOverallMm, bodyTopMm, overallHeightMm));
  const bodyHeightMm = Math.max(0.1, bodyBottomMm - bodyTopMm);
  const printableTopMm = round2(clamp(args.printableTopMm, bodyTopMm, bodyBottomMm));
  const printableBottomMm = round2(clamp(args.printableBottomMm, printableTopMm, bodyBottomMm));
  const printableHeightMm = round2(Math.max(0, printableBottomMm - printableTopMm));
  const printableTopFromBodyTopMm = round2(Math.max(0, printableTopMm - bodyTopMm));
  const printableBottomFromBodyTopMm = round2(
    Math.min(bodyHeightMm, Math.max(printableTopFromBodyTopMm, printableBottomMm - bodyTopMm)),
  );

  const axialExclusions: PrintableSurfaceContract["axialExclusions"] = [];
  const lidEndMm = isFiniteNumber(args.lidBoundaryMm)
    ? round2(clamp(args.lidBoundaryMm ?? 0, 0, bodyBottomMm))
    : null;
  if (lidEndMm != null && lidEndMm > 0.1) {
    axialExclusions.push({
      kind: "lid",
      startMm: 0,
      endMm: lidEndMm,
    });
  }

  const rimStartMm = lidEndMm != null ? lidEndMm : bodyTopMm;
  const rimEndMm = isFiniteNumber(args.rimBoundaryMm)
    ? round2(clamp(args.rimBoundaryMm ?? printableBottomMm, rimStartMm, bodyBottomMm))
    : null;
  if (rimEndMm != null && rimEndMm - rimStartMm >= 0.1) {
    axialExclusions.push({
      kind: "rim-ring",
      startMm: round2(rimStartMm),
      endMm: rimEndMm,
    });
  }

  const baseStartMm = isFiniteNumber(args.baseBandStartMm)
    ? round2(clamp(args.baseBandStartMm ?? printableBottomMm, printableBottomMm, bodyBottomMm))
    : printableBottomMm;
  if (bodyBottomMm - baseStartMm >= 0.1) {
    axialExclusions.push({
      kind: "base",
      startMm: baseStartMm,
      endMm: bodyBottomMm,
    });
  }

  const circumferentialExclusions: PrintableSurfaceContract["circumferentialExclusions"] =
    isFiniteNumber(args.handleKeepOutStartMm) && isFiniteNumber(args.handleKeepOutEndMm)
      ? [
          {
            kind: "handle",
            startMm: round2(args.handleKeepOutStartMm ?? 0),
            endMm: round2(args.handleKeepOutEndMm ?? 0),
            wraps: (args.handleKeepOutStartMm ?? 0) > (args.handleKeepOutEndMm ?? 0),
          },
        ]
      : [];

  const axialSurfaceBands: AxialSurfaceBand[] = [];
  if (lidEndMm != null) {
    addBand(axialSurfaceBands, overallHeightMm, "lid", 0, lidEndMm, false, args.topConfidence);
  }
  if (rimEndMm != null && rimEndMm > rimStartMm) {
    addBand(axialSurfaceBands, overallHeightMm, "rim-ring", rimStartMm, rimEndMm, false, args.topConfidence);
  }
  const upperBodyStartMm = round2(
    clamp(
      Math.max(
        printableTopMm,
        rimEndMm ?? printableTopMm,
        bodyTopMm,
      ),
      bodyTopMm,
      printableBottomMm,
    ),
  );
  addBand(
    axialSurfaceBands,
    overallHeightMm,
    "upper-body",
    upperBodyStartMm,
    printableBottomMm,
    true,
    Math.max(args.topConfidence, args.bottomConfidence),
  );
  if (bodyBottomMm > baseStartMm) {
    addBand(axialSurfaceBands, overallHeightMm, "base", baseStartMm, bodyBottomMm, false, args.bottomConfidence);
  }

  return {
    printableSurfaceContract: {
      printableTopMm,
      printableBottomMm,
      printableHeightMm,
      axialExclusions,
      circumferentialExclusions,
    },
    axialSurfaceBands,
    printableTopFromBodyTopMm,
    printableBottomFromBodyTopMm,
    topBoundarySource: args.topBoundarySource,
    bottomBoundarySource: args.bottomBoundarySource,
    authoritySource: args.authoritySource,
    topConfidence: round2(clamp(args.topConfidence, 0, 1)),
    bottomConfidence: round2(clamp(args.bottomConfidence, 0, 1)),
    automaticDetectionWeak: args.automaticDetectionWeak,
    repair: args.repair ?? null,
  };
}

export function resolveAuthoritativePrintableSurfaceResolution(
  args: ResolveAuthoritativePrintableSurfaceArgs,
): PrintableSurfaceResolution {
  const overallHeightMm = round2(Math.max(0, args.overallHeightMm));
  const bodyTopMm = round2(clamp(args.bodyTopFromOverallMm, 0, overallHeightMm));
  const bodyBottomMm = round2(clamp(args.bodyBottomFromOverallMm, bodyTopMm, overallHeightMm));
  const hasManualTopOverride = isFiniteNumber(args.printableTopOverrideMm);
  const hasManualBottomOverride = isFiniteNumber(args.printableBottomOverrideMm);
  const authoritySource: PrintableSurfaceAuthoritySource =
    hasManualTopOverride || hasManualBottomOverride ? "manual-override" : "persisted-contract";

  const persisted = selectPersistedPrintableSurfaceContract({
    topLevelContract: args.topLevelContract,
    canonicalContract: args.canonicalContract,
    bodyTopMm,
    bodyBottomMm,
  });
  if (!persisted.contract) {
    return buildPrintableSurfaceResolution({
      overallHeightMm,
      bodyTopFromOverallMm: bodyTopMm,
      bodyBottomFromOverallMm: bodyBottomMm,
      lidSeamFromOverallMm: args.lidSeamFromOverallMm,
      silverBandBottomFromOverallMm: args.silverBandBottomFromOverallMm,
      printableTopOverrideMm: args.printableTopOverrideMm,
      printableBottomOverrideMm: args.printableBottomOverrideMm,
      baseBandStartMm: args.baseBandStartMm,
      handleKeepOutStartMm: args.handleKeepOutStartMm,
      handleKeepOutEndMm: args.handleKeepOutEndMm,
      detection: args.detection,
    });
  }

  const persistedLidBoundaryMm = resolvePersistedLidBoundaryMm(persisted.contract);
  const persistedRimBoundaryMm = resolvePersistedRimBoundaryMm(persisted.contract);
  const persistedBaseBandStartMm = resolvePersistedBaseBandStartMm(persisted.contract);
  const persistedHandleKeepOut = resolvePersistedHandleKeepOutMm(persisted.contract);
  const effectiveLidBoundaryMm =
    persistedLidBoundaryMm ??
    (isFiniteNumber(args.lidSeamFromOverallMm) ? args.lidSeamFromOverallMm ?? null : null) ??
    (isFiniteNumber(args.detection?.lidSeamFromOverallMm) ? args.detection?.lidSeamFromOverallMm ?? null : null);
  const fallbackRimBoundaryMm =
    (isFiniteNumber(args.silverBandBottomFromOverallMm) ? args.silverBandBottomFromOverallMm ?? null : null) ??
    (isFiniteNumber(args.detection?.rimRingBottomFromOverallMm) ? args.detection?.rimRingBottomFromOverallMm ?? null : null) ??
    persistedRimBoundaryMm;
  const resolvedTopMm = hasManualTopOverride
    ? round2(clamp(args.printableTopOverrideMm ?? bodyTopMm, bodyTopMm, bodyBottomMm))
    : round2(clamp(
        fallbackRimBoundaryMm ?? persisted.contract.printableTopMm,
        bodyTopMm,
        bodyBottomMm,
      ));
  const resolvedBottomMm = hasManualBottomOverride
    ? round2(clamp(args.printableBottomOverrideMm ?? bodyBottomMm, resolvedTopMm, bodyBottomMm))
    : round2(clamp(persisted.contract.printableBottomMm, resolvedTopMm, bodyBottomMm));

  const resolved = buildFixedPrintableSurfaceResolution({
    overallHeightMm,
    bodyTopFromOverallMm: bodyTopMm,
    bodyBottomFromOverallMm: bodyBottomMm,
    printableTopMm: resolvedTopMm,
    printableBottomMm: resolvedBottomMm,
    lidBoundaryMm: effectiveLidBoundaryMm,
    rimBoundaryMm: fallbackRimBoundaryMm,
    baseBandStartMm: persistedBaseBandStartMm ?? args.baseBandStartMm,
    handleKeepOutStartMm: persistedHandleKeepOut.startMm ?? args.handleKeepOutStartMm,
    handleKeepOutEndMm: persistedHandleKeepOut.endMm ?? args.handleKeepOutEndMm,
    topBoundarySource: hasManualTopOverride
      ? "manual-override"
      : (fallbackRimBoundaryMm != null ? "rim-ring" : "persisted-contract"),
    bottomBoundarySource: hasManualBottomOverride ? "manual-override" : "persisted-contract",
    authoritySource,
    topConfidence: 1,
    bottomConfidence: 1,
    automaticDetectionWeak: false,
    repair: null,
  });

  return {
    ...resolved,
    repair: {
      persistedContractSource: persisted.source,
      contractsDisagreed: persisted.contractsDisagreed,
      normalizedTopLevel:
        Boolean(args.topLevelContract) &&
        !printableSurfaceContractsEqual(args.topLevelContract, resolved.printableSurfaceContract),
      normalizedCanonical:
        Boolean(args.canonicalContract) &&
        !printableSurfaceContractsEqual(args.canonicalContract, resolved.printableSurfaceContract),
    },
  };
}

export function buildPrintableSurfaceResolution(
  args: BuildPrintableSurfaceResolutionArgs,
): PrintableSurfaceResolution {
  const overallHeightMm = round2(Math.max(0, args.overallHeightMm));
  const bodyTopMm = round2(clamp(args.bodyTopFromOverallMm, 0, overallHeightMm));
  const bodyBottomMm = round2(clamp(args.bodyBottomFromOverallMm, bodyTopMm, overallHeightMm));
  const bodyHeightMm = Math.max(0.1, bodyBottomMm - bodyTopMm);
  const detectedRingBottomMm = isFiniteNumber(args.silverBandBottomFromOverallMm)
    ? args.silverBandBottomFromOverallMm ?? null
    : (isFiniteNumber(args.detection?.rimRingBottomFromOverallMm) ? args.detection?.rimRingBottomFromOverallMm ?? null : null);
  const detectedLidSeamMm = isFiniteNumber(args.lidSeamFromOverallMm)
    ? args.lidSeamFromOverallMm ?? null
    : (isFiniteNumber(args.detection?.lidSeamFromOverallMm) ? args.detection?.lidSeamFromOverallMm ?? null : null);

  const hasManualTopOverride = isFiniteNumber(args.printableTopOverrideMm);
  const hasManualBottomOverride = isFiniteNumber(args.printableBottomOverrideMm);
  const resolvedTopCandidate = hasManualTopOverride
    ? (args.printableTopOverrideMm ?? bodyTopMm)
    : (detectedRingBottomMm ?? bodyTopMm);
  const resolvedBottomCandidate = hasManualBottomOverride
    ? (args.printableBottomOverrideMm ?? bodyBottomMm)
    : (isFiniteNumber(args.baseBandStartMm) ? args.baseBandStartMm ?? bodyBottomMm : bodyBottomMm);

  const printableTopMm = round2(clamp(resolvedTopCandidate, bodyTopMm, bodyBottomMm));
  const printableBottomMm = round2(clamp(resolvedBottomCandidate, printableTopMm, bodyBottomMm));
  const printableHeightMm = round2(Math.max(0, printableBottomMm - printableTopMm));
  const printableTopFromBodyTopMm = round2(Math.max(0, printableTopMm - bodyTopMm));
  const printableBottomFromBodyTopMm = round2(Math.min(bodyHeightMm, Math.max(printableTopFromBodyTopMm, printableBottomMm - bodyTopMm)));
  const detectionConfidence = clamp(args.detection?.confidence ?? 0, 0, 1);
  const topBoundarySource: PrintableSurfaceBoundarySource = hasManualTopOverride
    ? "manual-override"
    : (detectedRingBottomMm != null ? "rim-ring" : "body-top-fallback");
  const bottomBoundarySource: PrintableSurfaceBoundarySource = hasManualBottomOverride
    ? "manual-override"
    : isFiniteNumber(args.baseBandStartMm)
      ? "base-band"
      : "body-bottom-fallback";
  const topConfidence = round2(
    hasManualTopOverride
      ? 1
      : detectedRingBottomMm != null
        ? Math.max(0.42, detectionConfidence || 0.68)
        : 1,
  );
  const bottomConfidence = round2(
    hasManualBottomOverride
      ? 1
      : isFiniteNumber(args.baseBandStartMm)
        ? Math.max(0.42, detectionConfidence || 0.68)
        : 1,
  );
  const automaticDetectionWeak = false;

  return buildFixedPrintableSurfaceResolution({
    overallHeightMm,
    bodyTopFromOverallMm: bodyTopMm,
    bodyBottomFromOverallMm: bodyBottomMm,
    printableTopMm,
    printableBottomMm,
    lidBoundaryMm: detectedLidSeamMm,
    rimBoundaryMm: detectedRingBottomMm,
    baseBandStartMm: isFiniteNumber(args.baseBandStartMm) ? args.baseBandStartMm ?? null : null,
    handleKeepOutStartMm: args.handleKeepOutStartMm,
    handleKeepOutEndMm: args.handleKeepOutEndMm,
    topBoundarySource,
    bottomBoundarySource,
    authoritySource: hasManualTopOverride || hasManualBottomOverride ? "manual-override" : "derived-fallback",
    topConfidence,
    bottomConfidence,
    automaticDetectionWeak,
    repair: null,
  });
}

export function getPrintableSurfaceResolutionFromDimensions(
  dims: ProductTemplateDimensions,
  calibration?: CanonicalDimensionCalibration | null,
): PrintableSurfaceResolution | null {
  const overallHeightMm = dims.overallHeightMm ?? calibration?.totalHeightMm;
  if (!isFiniteNumber(overallHeightMm) || overallHeightMm <= 0) {
    return null;
  }
  const bodyTopFromOverallMm =
    dims.bodyTopFromOverallMm ??
    calibration?.lidBodyLineMm ??
    dims.topMarginMm;
  const bodyBottomFromOverallMm = resolveBodyBottomFromOverallMm(dims, overallHeightMm);
  if (!isFiniteNumber(bodyTopFromOverallMm) || !isFiniteNumber(bodyBottomFromOverallMm)) {
    return null;
  }

  const handleKeepOutContract =
    dims.printableSurfaceContract ??
    calibration?.printableSurfaceContract ??
    null;

  return resolveAuthoritativePrintableSurfaceResolution({
    overallHeightMm,
    bodyTopFromOverallMm: bodyTopFromOverallMm ?? 0,
    bodyBottomFromOverallMm: bodyBottomFromOverallMm ?? overallHeightMm,
    topLevelContract: dims.printableSurfaceContract ?? null,
    canonicalContract: calibration?.printableSurfaceContract ?? null,
    lidSeamFromOverallMm: dims.lidSeamFromOverallMm,
    silverBandBottomFromOverallMm: dims.silverBandBottomFromOverallMm,
    printableTopOverrideMm: isFiniteNumber(dims.printableTopOverrideMm) ? dims.printableTopOverrideMm ?? null : null,
    printableBottomOverrideMm: isFiniteNumber(dims.printableBottomOverrideMm) ? dims.printableBottomOverrideMm ?? null : null,
    baseBandStartMm: resolvePersistedBaseBandStartMm(handleKeepOutContract),
    handleKeepOutStartMm:
      handleKeepOutContract?.circumferentialExclusions[0]?.startMm ??
      calibration?.wrapMappingMm.handleKeepOutStartMm,
    handleKeepOutEndMm:
      handleKeepOutContract?.circumferentialExclusions[0]?.endMm ??
      calibration?.wrapMappingMm.handleKeepOutEndMm,
  });
}

export function normalizeProductTemplatePrintableSurface(
  template: ProductTemplate,
): NormalizedTemplatePrintableSurfaceResult {
  const initialResolution = getPrintableSurfaceResolutionFromDimensions(
    template.dimensions,
    template.dimensions.canonicalDimensionCalibration,
  );
  if (!initialResolution) {
    return {
      template,
      changed: false,
      resolution: null,
    };
  }

  const bodyBoundsRepairContract = resolveBodyBoundsPrintableSurfaceContract(template);
  const resolution = shouldRepairPersistedPrintableSurfaceFromBodyReference({
    template,
    resolution: initialResolution,
    bodyBoundsContract: bodyBoundsRepairContract,
  })
    ? resolveAuthoritativePrintableSurfaceResolution({
        overallHeightMm:
          template.dimensions.overallHeightMm ??
          template.dimensions.canonicalDimensionCalibration?.totalHeightMm ??
          0,
        bodyTopFromOverallMm:
          template.dimensions.bodyTopFromOverallMm ??
          template.dimensions.canonicalDimensionCalibration?.lidBodyLineMm ??
          template.dimensions.topMarginMm ??
          0,
        bodyBottomFromOverallMm:
          resolveBodyBottomFromOverallMm(
            template.dimensions,
            template.dimensions.overallHeightMm ??
              template.dimensions.canonicalDimensionCalibration?.totalHeightMm ??
              0,
          ) ?? 0,
        topLevelContract: bodyBoundsRepairContract,
        canonicalContract: bodyBoundsRepairContract,
        lidSeamFromOverallMm: template.dimensions.lidSeamFromOverallMm,
        silverBandBottomFromOverallMm: template.dimensions.silverBandBottomFromOverallMm,
        printableTopOverrideMm: isFiniteNumber(template.dimensions.printableTopOverrideMm)
          ? template.dimensions.printableTopOverrideMm ?? null
          : null,
        printableBottomOverrideMm: isFiniteNumber(template.dimensions.printableBottomOverrideMm)
          ? template.dimensions.printableBottomOverrideMm ?? null
          : null,
        baseBandStartMm: resolvePersistedBaseBandStartMm(
          template.dimensions.printableSurfaceContract ??
            template.dimensions.canonicalDimensionCalibration?.printableSurfaceContract ??
            null,
        ),
        handleKeepOutStartMm:
          template.dimensions.printableSurfaceContract?.circumferentialExclusions[0]?.startMm ??
          template.dimensions.canonicalDimensionCalibration?.printableSurfaceContract?.circumferentialExclusions[0]?.startMm ??
          template.dimensions.canonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
        handleKeepOutEndMm:
          template.dimensions.printableSurfaceContract?.circumferentialExclusions[0]?.endMm ??
          template.dimensions.canonicalDimensionCalibration?.printableSurfaceContract?.circumferentialExclusions[0]?.endMm ??
          template.dimensions.canonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
      })
    : initialResolution;

  const dims = template.dimensions;
  const calibration = dims.canonicalDimensionCalibration ?? null;
  const hadPersistedContract = Boolean(dims.printableSurfaceContract || calibration?.printableSurfaceContract);
  const shouldPersistNormalizedContract =
    resolution.authoritySource !== "derived-fallback" || hadPersistedContract;
  if (!shouldPersistNormalizedContract) {
    return {
      template,
      changed: false,
      resolution,
    };
  }

  let changed = false;
  const nextDimensions: ProductTemplateDimensions = {
    ...dims,
  };
  if (!printableSurfaceContractsEqual(dims.printableSurfaceContract, resolution.printableSurfaceContract)) {
    nextDimensions.printableSurfaceContract = resolution.printableSurfaceContract;
    changed = true;
  }
  if (!axialSurfaceBandsEqual(dims.axialSurfaceBands, resolution.axialSurfaceBands)) {
    nextDimensions.axialSurfaceBands = resolution.axialSurfaceBands;
    changed = true;
  }

  if (calibration) {
    let calibrationChanged = false;
    const nextCalibration: CanonicalDimensionCalibration = {
      ...calibration,
    };
    if (!printableSurfaceContractsEqual(calibration.printableSurfaceContract, resolution.printableSurfaceContract)) {
      nextCalibration.printableSurfaceContract = resolution.printableSurfaceContract;
      calibrationChanged = true;
    }
    if (!axialSurfaceBandsEqual(calibration.axialSurfaceBands, resolution.axialSurfaceBands)) {
      nextCalibration.axialSurfaceBands = resolution.axialSurfaceBands;
      calibrationChanged = true;
    }
    if (calibrationChanged) {
      nextDimensions.canonicalDimensionCalibration = nextCalibration;
      changed = true;
    }
  }

  return {
    template: changed
      ? {
          ...template,
          dimensions: nextDimensions,
        }
      : template,
    changed,
    resolution,
  };
}

export function getPrintableSurfaceLocalBounds(args: {
  contract: PrintableSurfaceContract | null | undefined;
  bodyTopFromOverallMm: number | null | undefined;
  bodyBottomFromOverallMm: number | null | undefined;
}): { topMm: number; bottomMm: number; heightMm: number } | null {
  if (!args.contract || !isFiniteNumber(args.bodyTopFromOverallMm) || !isFiniteNumber(args.bodyBottomFromOverallMm)) {
    return null;
  }
  const bodyTopMm = args.bodyTopFromOverallMm ?? 0;
  const bodyBottomMm = args.bodyBottomFromOverallMm ?? bodyTopMm;
  const bodyHeightMm = Math.max(0, bodyBottomMm - bodyTopMm);
  const topMm = clamp(args.contract.printableTopMm - bodyTopMm, 0, bodyHeightMm);
  const bottomMm = clamp(args.contract.printableBottomMm - bodyTopMm, topMm, bodyHeightMm);
  return {
    topMm: round2(topMm),
    bottomMm: round2(bottomMm),
    heightMm: round2(Math.max(0, bottomMm - topMm)),
  };
}
