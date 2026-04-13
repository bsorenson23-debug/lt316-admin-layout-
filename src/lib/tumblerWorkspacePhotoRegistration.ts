import type { CanonicalDimensionCalibration } from "@/types/productTemplate";

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isFinitePositive(value: number | null | undefined): value is number {
  return Number.isFinite(value) && (value ?? 0) > 0;
}

function mapAffinePoint(matrix: readonly number[], x: number, y: number): { x: number; y: number } {
  const [a = 1, b = 0, tx = 0, c = 0, d = 1, ty = 0] = matrix;
  return {
    x: (a * x) + (b * y) + tx,
    y: (c * x) + (d * y) + ty,
  };
}

function invertAffinePoint(matrix: readonly number[], x: number, y: number): { x: number; y: number } | null {
  const [a = 1, b = 0, tx = 0, c = 0, d = 1, ty = 0] = matrix;
  const determinant = (a * d) - (b * c);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.000001) {
    return null;
  }
  const dx = x - tx;
  const dy = y - ty;
  return {
    x: ((d * dx) - (b * dy)) / determinant,
    y: ((-c * dx) + (a * dy)) / determinant,
  };
}

export interface TumblerWorkspacePhotoDrawRectMm {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TumblerWorkspacePhotoCropRectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TumblerWorkspacePhotoRegistration {
  mode: "canonical-front" | "legacy-fit";
  printableFrontRectMm: TumblerWorkspacePhotoDrawRectMm;
  contextFrontRectMm: TumblerWorkspacePhotoDrawRectMm;
  printableMirroredBackRectMm: TumblerWorkspacePhotoDrawRectMm | null;
  contextMirroredBackRectMm: TumblerWorkspacePhotoDrawRectMm | null;
  cropRectPx: TumblerWorkspacePhotoCropRectPx | null;
  topOverflowMm: number;
  bottomOverflowMm: number;
}

export interface DeriveTumblerWorkspacePhotoRegistrationArgs {
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  frontCenterMm: number;
  backCenterMm?: number | null;
  mirrorFrontToBack?: boolean;
  workspaceHeightMm: number;
  workspaceTopFromOverallMm: number;
  overallHeightMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
  calibration?: CanonicalDimensionCalibration | null;
}

export function deriveTumblerWorkspacePhotoRegistration(
  args: DeriveTumblerWorkspacePhotoRegistrationArgs,
): TumblerWorkspacePhotoRegistration {
  const legacy = deriveLegacyPhotoRegistration(args);
  const calibration = args.calibration;
  if (
    !calibration ||
    !isFinitePositive(args.imageNaturalWidth) ||
    !isFinitePositive(args.imageNaturalHeight) ||
    !isFinitePositive(args.frontCenterMm) ||
    !isFinitePositive(calibration.svgFrontViewBoxMm.width) ||
    !isFinitePositive(calibration.svgFrontViewBoxMm.height) ||
    !Array.isArray(calibration.photoToFrontTransform.matrix) ||
    calibration.photoToFrontTransform.matrix.length < 6
  ) {
    return legacy;
  }

  const viewBox = calibration.svgFrontViewBoxMm;
  const cropCorners = [
    invertAffinePoint(calibration.photoToFrontTransform.matrix, viewBox.x, viewBox.y),
    invertAffinePoint(calibration.photoToFrontTransform.matrix, viewBox.x + viewBox.width, viewBox.y),
    invertAffinePoint(
      calibration.photoToFrontTransform.matrix,
      viewBox.x + viewBox.width,
      viewBox.y + viewBox.height,
    ),
    invertAffinePoint(calibration.photoToFrontTransform.matrix, viewBox.x, viewBox.y + viewBox.height),
  ];
  if (cropCorners.some((point) => point == null)) {
    return legacy;
  }
  const cropXs = cropCorners.map((point) => point!.x);
  const cropYs = cropCorners.map((point) => point!.y);
  const cropMinX = Math.max(0, Math.min(...cropXs));
  const cropMaxX = Math.min(args.imageNaturalWidth, Math.max(...cropXs));
  const cropMinY = Math.max(0, Math.min(...cropYs));
  const cropMaxY = Math.min(args.imageNaturalHeight, Math.max(...cropYs));
  const cropWidth = cropMaxX - cropMinX;
  const cropHeight = cropMaxY - cropMinY;
  if (!isFinitePositive(cropWidth) || !isFinitePositive(cropHeight)) {
    return legacy;
  }

  const contextFrontRectMm: TumblerWorkspacePhotoDrawRectMm = {
    x: round4(args.frontCenterMm + viewBox.x),
    y: round4(viewBox.y - args.workspaceTopFromOverallMm),
    width: round4(viewBox.width),
    height: round4(viewBox.height),
  };
  const contextMirroredBackRectMm =
    args.mirrorFrontToBack && isFinitePositive(args.backCenterMm)
      ? {
          x: round4((args.backCenterMm ?? 0) + viewBox.x),
          y: contextFrontRectMm.y,
          width: contextFrontRectMm.width,
          height: contextFrontRectMm.height,
        }
      : null;
  const printableFrontRectMm = projectRectIntoPrintableWorkspace(
    contextFrontRectMm,
    args.workspaceHeightMm,
  );
  const printableMirroredBackRectMm = contextMirroredBackRectMm
    ? projectRectIntoPrintableWorkspace(contextMirroredBackRectMm, args.workspaceHeightMm)
    : null;

  const minTop = Math.min(
    contextFrontRectMm.y,
    contextMirroredBackRectMm?.y ?? contextFrontRectMm.y,
  );
  const maxBottom = Math.max(
    contextFrontRectMm.y + contextFrontRectMm.height,
    contextMirroredBackRectMm != null
      ? contextMirroredBackRectMm.y + contextMirroredBackRectMm.height
      : contextFrontRectMm.y + contextFrontRectMm.height,
  );

  return {
    mode: "canonical-front",
    printableFrontRectMm,
    contextFrontRectMm,
    printableMirroredBackRectMm,
    contextMirroredBackRectMm,
    cropRectPx: {
      x: round4(cropMinX),
      y: round4(cropMinY),
      width: round4(cropWidth),
      height: round4(cropHeight),
    },
    topOverflowMm: round4(Math.max(0, -minTop)),
    bottomOverflowMm: round4(Math.max(0, maxBottom - args.workspaceHeightMm)),
  };
}

function deriveLegacyPhotoRegistration(
  args: DeriveTumblerWorkspacePhotoRegistrationArgs,
): TumblerWorkspacePhotoRegistration {
  const safeImageWidth = Math.max(1, args.imageNaturalWidth || 1);
  const safeImageHeight = Math.max(1, args.imageNaturalHeight || 1);
  const aspectRatio = safeImageWidth / safeImageHeight;
  const drawHeight = Math.max(args.workspaceHeightMm, args.overallHeightMm || args.workspaceHeightMm);
  const drawWidth = drawHeight * aspectRatio;
  const contextFrontRectMm: TumblerWorkspacePhotoDrawRectMm = {
    x: round4(args.frontCenterMm - drawWidth / 2),
    y: round4(-Math.max(0, args.topMarginMm)),
    width: round4(drawWidth),
    height: round4(drawHeight),
  };
  const contextMirroredBackRectMm =
    args.mirrorFrontToBack && isFinitePositive(args.backCenterMm)
      ? {
          x: round4((args.backCenterMm ?? 0) - drawWidth / 2),
          y: contextFrontRectMm.y,
          width: contextFrontRectMm.width,
          height: contextFrontRectMm.height,
        }
      : null;
  const printableFrontRectMm = projectRectIntoPrintableWorkspace(
    contextFrontRectMm,
    args.workspaceHeightMm,
  );
  const printableMirroredBackRectMm = contextMirroredBackRectMm
    ? projectRectIntoPrintableWorkspace(contextMirroredBackRectMm, args.workspaceHeightMm)
    : null;

  return {
    mode: "legacy-fit",
    printableFrontRectMm,
    contextFrontRectMm,
    printableMirroredBackRectMm,
    contextMirroredBackRectMm,
    cropRectPx: null,
    topOverflowMm: round4(Math.max(0, args.topMarginMm)),
    bottomOverflowMm: round4(Math.max(0, args.bottomMarginMm)),
  };
}

function projectRectIntoPrintableWorkspace(
  rect: TumblerWorkspacePhotoDrawRectMm,
  workspaceHeightMm: number,
): TumblerWorkspacePhotoDrawRectMm {
  const printableTopMm = clampToRange(rect.y, 0, workspaceHeightMm);
  const printableBottomMm = clampToRange(rect.y + rect.height, 0, workspaceHeightMm);
  return {
    x: rect.x,
    y: round4(printableTopMm),
    width: rect.width,
    height: round4(Math.max(0, printableBottomMm - printableTopMm)),
  };
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
