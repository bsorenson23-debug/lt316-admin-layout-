export type BodyHeightAuthorityStatus = "pass" | "warn" | "fail" | "unknown";

export type BodyHeightAuthorityKind =
  | "derived-from-diameter-scale"
  | "manual-override"
  | "ambiguous"
  | "lookup-physical-body-height"
  | "lookup-usable-height-warning"
  | "approved-svg-physical-mm"
  | "canonical-body-height-warning"
  | "v2-expected-body-height-warning"
  | "v2-profile-height-warning"
  | "generated-body-bounds-warning"
  | "missing";

export type BodyHeightAuthorityConfidence = "high" | "medium" | "low" | "unknown";

export type LookupBodyHeightSource =
  | "physical-body-height"
  | "usable-height"
  | "printable-height"
  | "unknown";

export interface BodyHeightAuthorityInputHeights {
  lookupFullProductHeightMm?: number;
  lookupBodyHeightMm?: number;
  templateDimensionsHeightMm?: number;
  templateDimensionsPrintHeightMm?: number;
  printableHeightMm?: number;
  engravableHeightMm?: number;
  approvedSvgBoundsHeightMm?: number;
  v2ProfileBoundsHeightMm?: number;
  referenceBandHeightPx?: number;
  generatedBodyBoundsHeightMm?: number;
  canonicalBodyHeightMm?: number;
  bodyTopFromOverallMm?: number;
  bodyBottomFromOverallMm?: number;
}

export interface BodyDiameterAuthorityDiagnostic {
  kind: string;
  valueMm?: number;
  sourceField?: string;
}

export interface BodyHeightSelectedScaleAuthority {
  diameterAuthority?: string;
  heightAuthority: BodyHeightAuthorityKind;
  yScaleSource?: string;
  radialScaleSource?: string;
}

export interface BodyHeightAuthorityReport {
  status: BodyHeightAuthorityStatus;
  kind: BodyHeightAuthorityKind;
  valueMm?: number;
  sourceField?: string;
  sourceFunction?: string;
  confidence: BodyHeightAuthorityConfidence;
  isFallback: boolean;
  isPrintableHeight: boolean;
  isPhysicalBodyHeight: boolean;
  isFullProductHeight: boolean;
  warnings: string[];
  errors: string[];
  inputHeights: BodyHeightAuthorityInputHeights;
  selectedScaleAuthority: BodyHeightSelectedScaleAuthority;
  diameterAuthority: BodyDiameterAuthorityDiagnostic;
  sourceDiameterUnits?: number;
  sourceContourHeightUnits?: number;
  mmPerSourceUnit?: number;
  uniformScaleApplied: boolean;
  derivedBodyHeightMm?: number;
  rejectedHeightSources: string[];
  svgPhysicalMmTrusted: boolean;
  svgToPhotoTransformPresent: boolean;
}

export interface BodyHeightAuthorityInput {
  manualBodyHeightMm?: number | null;
  diameterAuthorityKind?: string | null;
  diameterAuthorityValueMm?: number | null;
  diameterAuthoritySourceField?: string | null;
  sourceDiameterUnits?: number | null;
  sourceContourHeightUnits?: number | null;
  mmPerSourceUnit?: number | null;
  uniformScaleApplied?: boolean | null;
  derivedBodyHeightMm?: number | null;
  svgPhysicalMmTrusted?: boolean | null;
  svgToPhotoTransformPresent?: boolean | null;
  rejectedHeightSources?: readonly string[] | null;
  lookupBodyHeightMm?: number | null;
  lookupBodyHeightSource?: LookupBodyHeightSource | null;
  lookupFullProductHeightMm?: number | null;
  templateDimensionsHeightMm?: number | null;
  templateDimensionsPrintHeightMm?: number | null;
  printableHeightMm?: number | null;
  engravableHeightMm?: number | null;
  approvedSvgBoundsHeightMm?: number | null;
  approvedSvgMarkedPhysicalMm?: boolean | null;
  v2ExpectedBodyHeightMm?: number | null;
  v2ProfileBoundsHeightMm?: number | null;
  referenceBandHeightPx?: number | null;
  generatedBodyBoundsHeightMm?: number | null;
  canonicalBodyHeightMm?: number | null;
  bodyTopFromOverallMm?: number | null;
  bodyBottomFromOverallMm?: number | null;
  diameterAuthority?: string | null;
  yScaleSource?: string | null;
  radialScaleSource?: string | null;
  sourceFunction?: string | null;
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function finiteRounded(value: number | null | undefined): number | undefined {
  return isFinitePositive(value) ? round2(value) : undefined;
}

function finiteRoundedScale(value: number | null | undefined): number | undefined {
  return isFinitePositive(value) ? round4(value) : undefined;
}

function normalizeMessages(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildReport(args: {
  input: BodyHeightAuthorityInput;
  status: BodyHeightAuthorityStatus;
  kind: BodyHeightAuthorityKind;
  valueMm?: number;
  sourceField?: string;
  confidence: BodyHeightAuthorityConfidence;
  isFallback: boolean;
  isPrintableHeight: boolean;
  isPhysicalBodyHeight: boolean;
  isFullProductHeight?: boolean;
  warnings?: readonly string[];
  errors?: readonly string[];
  rejectedHeightSources?: readonly string[];
}): BodyHeightAuthorityReport {
  const rejectedHeightSources = normalizeMessages([
    ...(args.rejectedHeightSources ?? []),
    ...(args.input.rejectedHeightSources ?? []),
  ]);
  return {
    status: args.status,
    kind: args.kind,
    valueMm: finiteRounded(args.valueMm),
    sourceField: args.sourceField,
    sourceFunction: args.input.sourceFunction?.trim() || undefined,
    confidence: args.confidence,
    isFallback: args.isFallback,
    isPrintableHeight: args.isPrintableHeight,
    isPhysicalBodyHeight: args.isPhysicalBodyHeight,
    isFullProductHeight: args.isFullProductHeight ?? false,
    warnings: normalizeMessages(args.warnings ?? []),
    errors: normalizeMessages(args.errors ?? []),
    inputHeights: {
      lookupFullProductHeightMm: finiteRounded(args.input.lookupFullProductHeightMm),
      lookupBodyHeightMm: finiteRounded(args.input.lookupBodyHeightMm),
      templateDimensionsHeightMm: finiteRounded(args.input.templateDimensionsHeightMm),
      templateDimensionsPrintHeightMm: finiteRounded(args.input.templateDimensionsPrintHeightMm),
      printableHeightMm: finiteRounded(args.input.printableHeightMm),
      engravableHeightMm: finiteRounded(args.input.engravableHeightMm),
      approvedSvgBoundsHeightMm: finiteRounded(args.input.approvedSvgBoundsHeightMm),
      v2ProfileBoundsHeightMm: finiteRounded(args.input.v2ProfileBoundsHeightMm),
      referenceBandHeightPx: finiteRounded(args.input.referenceBandHeightPx),
      generatedBodyBoundsHeightMm: finiteRounded(args.input.generatedBodyBoundsHeightMm),
      canonicalBodyHeightMm: finiteRounded(args.input.canonicalBodyHeightMm),
      bodyTopFromOverallMm: finiteRounded(args.input.bodyTopFromOverallMm),
      bodyBottomFromOverallMm: finiteRounded(args.input.bodyBottomFromOverallMm),
    },
    selectedScaleAuthority: {
      diameterAuthority: args.input.diameterAuthority?.trim() || undefined,
      heightAuthority: args.kind,
      yScaleSource: args.input.yScaleSource?.trim() || undefined,
      radialScaleSource: args.input.radialScaleSource?.trim() || undefined,
    },
    diameterAuthority: {
      kind: args.input.diameterAuthorityKind?.trim() || args.input.diameterAuthority?.trim() || "unknown",
      valueMm: finiteRounded(args.input.diameterAuthorityValueMm),
      sourceField: args.input.diameterAuthoritySourceField?.trim() || args.input.diameterAuthority?.trim() || undefined,
    },
    sourceDiameterUnits: finiteRounded(args.input.sourceDiameterUnits),
    sourceContourHeightUnits: finiteRounded(args.input.sourceContourHeightUnits),
    mmPerSourceUnit: finiteRoundedScale(args.input.mmPerSourceUnit),
    uniformScaleApplied: args.input.uniformScaleApplied === true,
    derivedBodyHeightMm: finiteRounded(args.input.derivedBodyHeightMm),
    rejectedHeightSources,
    svgPhysicalMmTrusted: args.input.svgPhysicalMmTrusted === true,
    svgToPhotoTransformPresent: args.input.svgToPhotoTransformPresent === true,
  };
}

export function resolveBodyHeightAuthority(input: BodyHeightAuthorityInput): BodyHeightAuthorityReport {
  if (isFinitePositive(input.manualBodyHeightMm)) {
    return buildReport({
      input,
      status: "pass",
      kind: "manual-override",
      valueMm: input.manualBodyHeightMm,
      sourceField: "manualBodyHeightMm",
      confidence: "high",
      isFallback: false,
      isPrintableHeight: false,
      isPhysicalBodyHeight: true,
      warnings: ["Manual body-height override is the selected physical body-height authority."],
    });
  }

  if (
    input.uniformScaleApplied === true &&
    isFinitePositive(input.derivedBodyHeightMm) &&
    isFinitePositive(input.mmPerSourceUnit) &&
    isFinitePositive(input.sourceDiameterUnits) &&
    isFinitePositive(input.sourceContourHeightUnits)
  ) {
    const sourceTrusted = input.svgToPhotoTransformPresent === true || input.svgPhysicalMmTrusted === true;
    return buildReport({
      input,
      status: sourceTrusted ? "pass" : "warn",
      kind: sourceTrusted ? "derived-from-diameter-scale" : "ambiguous",
      valueMm: input.derivedBodyHeightMm,
      sourceField: "sourceContour.heightUnits * mmPerSourceUnit",
      confidence: sourceTrusted ? "high" : "low",
      isFallback: false,
      isPrintableHeight: false,
      isPhysicalBodyHeight: sourceTrusted,
      warnings: [
        sourceTrusted
          ? "Body height was derived by applying the trusted diameter scale uniformly to source contour height."
          : "Body height was derived by uniform diameter scale, but the SVG/photo source transform is not proven.",
      ],
      rejectedHeightSources: [
        "printHeightMm",
        "engravingHeightMm",
        "referenceBandHeightPx",
        "approvedSvgBounds.height",
        "fullProductHeightMm",
      ],
    });
  }

  if (
    isFinitePositive(input.lookupBodyHeightMm) &&
    input.lookupBodyHeightSource === "physical-body-height"
  ) {
    return buildReport({
      input,
      status: "pass",
      kind: "lookup-physical-body-height",
      valueMm: input.lookupBodyHeightMm,
      sourceField: "lookup.bodyHeightMm",
      confidence: "medium",
      isFallback: false,
      isPrintableHeight: false,
      isPhysicalBodyHeight: true,
      rejectedHeightSources: [
        "printHeightMm",
        "engravingHeightMm",
        "referenceBandHeightPx",
        "approvedSvgBounds.height",
      ],
    });
  }

  if (input.approvedSvgMarkedPhysicalMm === true && isFinitePositive(input.approvedSvgBoundsHeightMm)) {
    return buildReport({
      input,
      status: "pass",
      kind: "approved-svg-physical-mm",
      valueMm: input.approvedSvgBoundsHeightMm,
      sourceField: "approvedSvgBounds.height",
      confidence: "medium",
      isFallback: false,
      isPrintableHeight: false,
      isPhysicalBodyHeight: true,
      warnings: [
        "Approved SVG bounds were explicitly marked as physical millimeters with provenance.",
      ],
      rejectedHeightSources: [
        "printHeightMm",
        "engravingHeightMm",
        "referenceBandHeightPx",
      ],
    });
  }

  const rejectedHeightSources = [
    isFinitePositive(input.lookupBodyHeightMm)
      ? (
          input.lookupBodyHeightSource === "printable-height"
            ? "lookup.printableHeightMm"
            : input.lookupBodyHeightSource === "usable-height"
              ? "lookup.usableHeightMm"
              : "lookup.bodyHeightMm"
        )
      : "",
    isFinitePositive(input.templateDimensionsPrintHeightMm) ? "template.dimensions.printHeightMm" : "",
    isFinitePositive(input.printableHeightMm) ? "printableHeightMm" : "",
    isFinitePositive(input.engravableHeightMm) ? "engravableHeightMm" : "",
    isFinitePositive(input.referenceBandHeightPx) ? "referenceBandHeightPx" : "",
    isFinitePositive(input.approvedSvgBoundsHeightMm) ? "approvedSvgBounds.height" : "",
    isFinitePositive(input.lookupFullProductHeightMm) ? "lookup.fullProductHeightMm" : "",
  ];

  if (isFinitePositive(input.v2ExpectedBodyHeightMm)) {
    return buildReport({
      input,
      status: "warn",
      kind: "v2-expected-body-height-warning",
      valueMm: input.v2ExpectedBodyHeightMm,
      sourceField: "bodyReferenceV2.scaleCalibration.expectedBodyHeightMm",
      confidence: "low",
      isFallback: true,
      isPrintableHeight: true,
      isPhysicalBodyHeight: false,
      warnings: [
        "BODY REFERENCE v2 expected height is context unless backed by a diameter-derived uniform source scale.",
      ],
      rejectedHeightSources,
    });
  }

  if (isFinitePositive(input.canonicalBodyHeightMm)) {
    return buildReport({
      input,
      status: "warn",
      kind: "canonical-body-height-warning",
      valueMm: input.canonicalBodyHeightMm,
      sourceField: "canonicalDimensionCalibration.bodyHeightMm",
      confidence: "low",
      isFallback: true,
      isPrintableHeight: true,
      isPhysicalBodyHeight: false,
      warnings: [
        "Canonical body height came from current body top/bottom extents and may reflect printable/reference-band context.",
      ],
      rejectedHeightSources,
    });
  }

  if (isFinitePositive(input.v2ProfileBoundsHeightMm)) {
    return buildReport({
      input,
      status: "warn",
      kind: "v2-profile-height-warning",
      valueMm: input.v2ProfileBoundsHeightMm,
      sourceField: "bodyReferenceV2MirroredProfile.bodyHeightMm",
      confidence: "low",
      isFallback: true,
      isPrintableHeight: false,
      isPhysicalBodyHeight: false,
      warnings: [
        "BODY REFERENCE v2 mirrored-profile height was derived from captured profile pixels; it is not independent physical body-height authority.",
      ],
      rejectedHeightSources,
    });
  }

  if (isFinitePositive(input.generatedBodyBoundsHeightMm)) {
    return buildReport({
      input,
      status: "warn",
      kind: "generated-body-bounds-warning",
      valueMm: input.generatedBodyBoundsHeightMm,
      sourceField: "generatedBodyBounds.height",
      confidence: "low",
      isFallback: true,
      isPrintableHeight: false,
      isPhysicalBodyHeight: false,
      warnings: [
        "Generated mesh bounds are an output measurement, not an input body-height authority.",
      ],
      rejectedHeightSources,
    });
  }

  return buildReport({
    input,
    status: "warn",
    kind: "ambiguous",
    sourceField: undefined,
    confidence: "unknown",
    isFallback: true,
    isPrintableHeight: false,
    isPhysicalBodyHeight: false,
    warnings: ["No trusted diameter-derived source scale or explicit manual physical body-height override is available."],
    rejectedHeightSources,
  });
}
