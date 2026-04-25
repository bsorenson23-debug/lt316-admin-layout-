import type { EditableBodyOutline } from "../types/productTemplate.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";

export type BodyReferenceGuideFrameSource =
  | "accepted-body-reference"
  | "fit-debug-reference-band"
  | "body-band"
  | "silhouette-fallback"
  | "unknown";

export type BodyReferenceGuideCoordinateSpace =
  | "raw-image-px"
  | "displayed-image-px"
  | "dom-container-px"
  | "model-mm"
  | "unknown";

export interface BodyReferenceGuideBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface BodyReferenceGuideImageSize {
  width: number;
  height: number;
}

export interface BodyReferenceGuideFrame {
  guideSource: BodyReferenceGuideFrameSource;
  coordinateSpace: BodyReferenceGuideCoordinateSpace;
  rawImageBounds: BodyReferenceGuideBounds | null;
  rawImageSize: BodyReferenceGuideImageSize | null;
  displayedImageBounds: BodyReferenceGuideBounds | null;
  mappedDomOverlayBounds: BodyReferenceGuideBounds | null;
  sourceHash?: string;
  generatedSourceHash?: string;
  freshRelativeToGeneratedSource?: boolean | null;
  warnings: string[];
  errors: string[];
}

interface DisplayedImageInput {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ResolveGuideFrameArgs {
  acceptedBodyReferenceOutline?: EditableBodyOutline | null;
  acceptedSourceHash?: string | null;
  generatedSourceHash?: string | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
  bodyBandBounds?: Partial<BodyReferenceGuideBounds> | null;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeBounds(args: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): BodyReferenceGuideBounds | null {
  const left = Math.min(args.left, args.right);
  const right = Math.max(args.left, args.right);
  const top = Math.min(args.top, args.bottom);
  const bottom = Math.max(args.top, args.bottom);
  const width = right - left;
  const height = bottom - top;
  if (!isFinitePositive(width) || !isFinitePositive(height)) return null;
  return {
    left: round2(left),
    top: round2(top),
    right: round2(right),
    bottom: round2(bottom),
    width: round2(width),
    height: round2(height),
    centerX: round2(left + width / 2),
    centerY: round2(top + height / 2),
  };
}

function boundsFromPartial(input: Partial<BodyReferenceGuideBounds> | null | undefined): BodyReferenceGuideBounds | null {
  if (!input) return null;
  if (
    isFiniteNumber(input.left) &&
    isFiniteNumber(input.top) &&
    isFiniteNumber(input.right) &&
    isFiniteNumber(input.bottom)
  ) {
    return normalizeBounds({
      left: input.left,
      top: input.top,
      right: input.right,
      bottom: input.bottom,
    });
  }
  if (
    isFiniteNumber(input.left) &&
    isFiniteNumber(input.top) &&
    isFinitePositive(input.width) &&
    isFinitePositive(input.height)
  ) {
    return normalizeBounds({
      left: input.left,
      top: input.top,
      right: input.left + input.width,
      bottom: input.top + input.height,
    });
  }
  return null;
}

function boundsFromAcceptedBodyReference(outline: EditableBodyOutline | null | undefined): BodyReferenceGuideBounds | null {
  const bounds = outline?.sourceContourBounds;
  if (bounds) {
    return normalizeBounds({
      left: bounds.minX,
      top: bounds.minY,
      right: bounds.maxX,
      bottom: bounds.maxY,
    });
  }

  const contour = outline?.directContour;
  if (!contour || contour.length < 3) return null;
  const xs = contour.map((point) => point.x).filter(isFiniteNumber);
  const ys = contour.map((point) => point.y).filter(isFiniteNumber);
  if (xs.length === 0 || ys.length === 0) return null;
  return normalizeBounds({
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  });
}

function rawImageSizeFromOutline(outline: EditableBodyOutline | null | undefined): BodyReferenceGuideImageSize | null {
  const viewport = outline?.sourceContourViewport;
  if (viewport && isFinitePositive(viewport.width) && isFinitePositive(viewport.height)) {
    return {
      width: round2(viewport.width),
      height: round2(viewport.height),
    };
  }
  return null;
}

function boundsFromFitDebugReferenceBand(debug: TumblerItemLookupFitDebug): BodyReferenceGuideBounds | null {
  const top = isFiniteNumber(debug.measurementBandTopPx)
    ? debug.measurementBandTopPx
    : debug.referenceBandTopPx;
  const bottom = isFiniteNumber(debug.measurementBandBottomPx)
    ? debug.measurementBandBottomPx
    : debug.referenceBandBottomPx;
  const centerX = isFiniteNumber(debug.measurementBandCenterXPx)
    ? debug.measurementBandCenterXPx
    : debug.centerXPx;
  const width = isFinitePositive(debug.measurementBandWidthPx)
    ? debug.measurementBandWidthPx
    : debug.referenceBandWidthPx;
  const left = isFiniteNumber(debug.measurementBandLeftPx)
    ? debug.measurementBandLeftPx
    : centerX - width / 2;
  const right = isFiniteNumber(debug.measurementBandRightPx)
    ? debug.measurementBandRightPx
    : centerX + width / 2;

  if (!isFiniteNumber(top) || !isFiniteNumber(bottom) || !isFinitePositive(width)) return null;
  return normalizeBounds({ left, top, right, bottom });
}

function boundsFromFitDebugBodyBand(debug: TumblerItemLookupFitDebug): BodyReferenceGuideBounds | null {
  const top = debug.bodyTraceTopPx ?? debug.bodyTopPx;
  const bottom = debug.bodyTraceBottomPx ?? debug.bodyBottomPx;
  const halfWidth = Math.max(1, debug.referenceHalfWidthPx);
  return normalizeBounds({
    left: debug.centerXPx - halfWidth,
    top,
    right: debug.centerXPx + halfWidth,
    bottom,
  });
}

function boundsFromFitDebugSilhouette(debug: TumblerItemLookupFitDebug): BodyReferenceGuideBounds | null {
  return normalizeBounds({
    left: debug.silhouetteBoundsPx.minX,
    top: debug.silhouetteBoundsPx.minY,
    right: debug.silhouetteBoundsPx.maxX,
    bottom: debug.silhouetteBoundsPx.maxY,
  });
}

function rawImageSizeFromFitDebug(debug: TumblerItemLookupFitDebug | null | undefined): BodyReferenceGuideImageSize | null {
  if (!debug || !isFinitePositive(debug.imageWidthPx) || !isFinitePositive(debug.imageHeightPx)) return null;
  return {
    width: round2(debug.imageWidthPx),
    height: round2(debug.imageHeightPx),
  };
}

function emptyFrame(args?: {
  warnings?: string[];
  errors?: string[];
  acceptedSourceHash?: string | null;
  generatedSourceHash?: string | null;
}): BodyReferenceGuideFrame {
  const sourceHash = args?.acceptedSourceHash?.trim() || undefined;
  const generatedSourceHash = args?.generatedSourceHash?.trim() || undefined;
  return {
    guideSource: "unknown",
    coordinateSpace: "unknown",
    rawImageBounds: null,
    rawImageSize: null,
    displayedImageBounds: null,
    mappedDomOverlayBounds: null,
    sourceHash,
    generatedSourceHash,
    freshRelativeToGeneratedSource:
      sourceHash && generatedSourceHash ? sourceHash === generatedSourceHash : null,
    warnings: args?.warnings ?? ["No body reference guide frame is available."],
    errors: args?.errors ?? [],
  };
}

function withFreshness(
  frame: BodyReferenceGuideFrame,
  acceptedSourceHash?: string | null,
  generatedSourceHash?: string | null,
): BodyReferenceGuideFrame {
  const sourceHash = acceptedSourceHash?.trim() || frame.sourceHash;
  const glbHash = generatedSourceHash?.trim() || frame.generatedSourceHash;
  const freshRelativeToGeneratedSource = sourceHash && glbHash ? sourceHash === glbHash : null;
  const warnings = [...frame.warnings];
  if (freshRelativeToGeneratedSource === false) {
    warnings.push("Accepted BODY REFERENCE source hash differs from the generated GLB source hash.");
  }
  return {
    ...frame,
    sourceHash,
    generatedSourceHash: glbHash,
    freshRelativeToGeneratedSource,
    warnings,
  };
}

export function resolveBodyReferenceGuideFrame(args: ResolveGuideFrameArgs): BodyReferenceGuideFrame {
  const warnings: string[] = [];
  const fitDebugRawImageSize = rawImageSizeFromFitDebug(args.fitDebug);

  const acceptedBounds = boundsFromAcceptedBodyReference(args.acceptedBodyReferenceOutline);
  if (acceptedBounds) {
    const rawImageSize = rawImageSizeFromOutline(args.acceptedBodyReferenceOutline) ?? fitDebugRawImageSize;
    const coordinateSpace = rawImageSize ? "raw-image-px" : "model-mm";
    return withFreshness({
      guideSource: "accepted-body-reference",
      coordinateSpace,
      rawImageBounds: acceptedBounds,
      rawImageSize,
      displayedImageBounds: null,
      mappedDomOverlayBounds: null,
      sourceHash: args.acceptedSourceHash?.trim() || undefined,
      generatedSourceHash: args.generatedSourceHash?.trim() || undefined,
      freshRelativeToGeneratedSource: null,
      warnings: coordinateSpace === "model-mm"
        ? ["Accepted BODY REFERENCE contour is in model millimeters; image overlay mapping needs source contour viewport data."]
        : [],
      errors: [],
    }, args.acceptedSourceHash, args.generatedSourceHash);
  }

  if (args.fitDebug) {
    const referenceBand = boundsFromFitDebugReferenceBand(args.fitDebug);
    if (referenceBand) {
      return withFreshness({
        guideSource: "fit-debug-reference-band",
        coordinateSpace: "raw-image-px",
        rawImageBounds: referenceBand,
        rawImageSize: fitDebugRawImageSize,
        displayedImageBounds: null,
        mappedDomOverlayBounds: null,
        sourceHash: args.acceptedSourceHash?.trim() || undefined,
        generatedSourceHash: args.generatedSourceHash?.trim() || undefined,
        freshRelativeToGeneratedSource: null,
        warnings,
        errors: [],
      }, args.acceptedSourceHash, args.generatedSourceHash);
    }
    warnings.push("Lookup fit-debug reference band is missing; falling back to body band bounds.");
  }

  const bodyBand = boundsFromPartial(args.bodyBandBounds) ??
    (args.fitDebug ? boundsFromFitDebugBodyBand(args.fitDebug) : null);
  if (bodyBand) {
    return withFreshness({
      guideSource: "body-band",
      coordinateSpace: "raw-image-px",
      rawImageBounds: bodyBand,
      rawImageSize: fitDebugRawImageSize,
      displayedImageBounds: null,
      mappedDomOverlayBounds: null,
      sourceHash: args.acceptedSourceHash?.trim() || undefined,
      generatedSourceHash: args.generatedSourceHash?.trim() || undefined,
      freshRelativeToGeneratedSource: null,
      warnings,
      errors: [],
    }, args.acceptedSourceHash, args.generatedSourceHash);
  }

  if (args.fitDebug) {
    const silhouette = boundsFromFitDebugSilhouette(args.fitDebug);
    if (silhouette) {
      return withFreshness({
        guideSource: "silhouette-fallback",
        coordinateSpace: "raw-image-px",
        rawImageBounds: silhouette,
        rawImageSize: fitDebugRawImageSize,
        displayedImageBounds: null,
        mappedDomOverlayBounds: null,
        sourceHash: args.acceptedSourceHash?.trim() || undefined,
        generatedSourceHash: args.generatedSourceHash?.trim() || undefined,
        freshRelativeToGeneratedSource: null,
        warnings: [
          ...warnings,
          "Using full silhouette bounds as a fallback; this may include lid, straw, handle, or shadow.",
        ],
        errors: [],
      }, args.acceptedSourceHash, args.generatedSourceHash);
    }
  }

  return emptyFrame({
    acceptedSourceHash: args.acceptedSourceHash,
    generatedSourceHash: args.generatedSourceHash,
    warnings,
  });
}

export function resolveContainedImageBounds(args: {
  naturalSize: BodyReferenceGuideImageSize;
  containerBounds: DisplayedImageInput;
}): BodyReferenceGuideBounds | null {
  if (
    !isFinitePositive(args.naturalSize.width) ||
    !isFinitePositive(args.naturalSize.height) ||
    !isFinitePositive(args.containerBounds.width) ||
    !isFinitePositive(args.containerBounds.height)
  ) {
    return null;
  }
  const scale = Math.min(
    args.containerBounds.width / args.naturalSize.width,
    args.containerBounds.height / args.naturalSize.height,
  );
  const width = args.naturalSize.width * scale;
  const height = args.naturalSize.height * scale;
  const left = args.containerBounds.left + (args.containerBounds.width - width) / 2;
  const top = args.containerBounds.top + (args.containerBounds.height - height) / 2;
  return normalizeBounds({
    left,
    top,
    right: left + width,
    bottom: top + height,
  });
}

export function mapRawImageBoundsToDisplayedImage(args: {
  rawImageBounds: BodyReferenceGuideBounds | null;
  rawImageSize: BodyReferenceGuideImageSize | null;
  displayedImageBounds: DisplayedImageInput | BodyReferenceGuideBounds | null;
}): BodyReferenceGuideBounds | null {
  if (!args.rawImageBounds || !args.rawImageSize || !args.displayedImageBounds) return null;
  if (!isFinitePositive(args.rawImageSize.width) || !isFinitePositive(args.rawImageSize.height)) return null;
  if (!isFinitePositive(args.displayedImageBounds.width) || !isFinitePositive(args.displayedImageBounds.height)) return null;

  const scaleX = args.displayedImageBounds.width / args.rawImageSize.width;
  const scaleY = args.displayedImageBounds.height / args.rawImageSize.height;
  return normalizeBounds({
    left: args.displayedImageBounds.left + args.rawImageBounds.left * scaleX,
    top: args.displayedImageBounds.top + args.rawImageBounds.top * scaleY,
    right: args.displayedImageBounds.left + args.rawImageBounds.right * scaleX,
    bottom: args.displayedImageBounds.top + args.rawImageBounds.bottom * scaleY,
  });
}

export function mapBodyReferenceGuideFrameToDisplayedImage(
  frame: BodyReferenceGuideFrame | null | undefined,
  displayedImageBounds: DisplayedImageInput | BodyReferenceGuideBounds | null,
): BodyReferenceGuideFrame | null {
  if (!frame) return null;
  const displayed = displayedImageBounds
    ? normalizeBounds({
        left: displayedImageBounds.left,
        top: displayedImageBounds.top,
        right: displayedImageBounds.left + displayedImageBounds.width,
        bottom: displayedImageBounds.top + displayedImageBounds.height,
      })
    : null;
  const mapped = frame.coordinateSpace === "raw-image-px"
    ? mapRawImageBoundsToDisplayedImage({
        rawImageBounds: frame.rawImageBounds,
        rawImageSize: frame.rawImageSize,
        displayedImageBounds: displayed,
      })
    : null;
  const warnings = [...frame.warnings];
  if (frame.coordinateSpace !== "raw-image-px") {
    warnings.push("Guide frame is not in raw image pixels and cannot be mapped onto the displayed image.");
  } else if (!mapped) {
    warnings.push("Guide frame could not be mapped onto the displayed image.");
  }
  return {
    ...frame,
    displayedImageBounds: displayed,
    mappedDomOverlayBounds: mapped,
    coordinateSpace: mapped ? "dom-container-px" : frame.coordinateSpace,
    warnings,
  };
}
