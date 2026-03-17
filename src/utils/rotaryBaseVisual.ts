import type {
  RotaryAnchorReferencePoint,
  RotaryMountHoleOffset,
  RotaryMountReferenceMode,
  RotaryPlacementPreset,
} from "../types/export.ts";
import type { RotaryHoleAnchorSelection } from "./rotaryAnchoring.ts";

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundTo4(value: number): number {
  return Number(value.toFixed(4));
}

function normalizeMountHoles(
  value: RotaryMountHoleOffset[] | undefined
): RotaryMountHoleOffset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (offset) =>
        offset &&
        typeof offset.id === "string" &&
        isFiniteNumber(offset.xMm) &&
        isFiniteNumber(offset.yMm)
    )
    .map((offset) => ({
      id: offset.id,
      xMm: roundTo4(offset.xMm),
      yMm: roundTo4(offset.yMm),
    }));
}

export interface RotaryBaseVisualDefinition {
  presetName: string;
  widthMm: number;
  depthMm: number;
  mountHoles: RotaryMountHoleOffset[];
  anchorReferencePoint: RotaryAnchorReferencePoint;
  isPlaceholder: boolean;
}

export interface RotaryPlacedBaseVisual {
  presetName: string;
  leftMm: number;
  topMm: number;
  widthMm: number;
  depthMm: number;
  mountHoles: RotaryMountHoleOffset[];
  anchorPoint: RotaryAnchorReferencePoint;
  axisCenter: {
    xMm: number;
    yMm: number;
  };
  isPlaceholder: boolean;
}

function buildFallbackMountHoles(args: {
  mountPatternXmm?: number;
  mountPatternYmm?: number;
  anchorReferencePoint: RotaryAnchorReferencePoint;
}): RotaryMountHoleOffset[] {
  if (!isFiniteNumber(args.mountPatternXmm) || args.mountPatternXmm <= 0) return [];
  if (!isFiniteNumber(args.mountPatternYmm) || args.mountPatternYmm <= 0) return [];

  const x = args.mountPatternXmm;
  const y = args.mountPatternYmm;
  const anchor = args.anchorReferencePoint;
  return [
    { id: "front-left", xMm: anchor.xMm, yMm: anchor.yMm },
    { id: "front-right", xMm: anchor.xMm + x, yMm: anchor.yMm },
    { id: "rear-left", xMm: anchor.xMm, yMm: anchor.yMm + y },
    { id: "rear-right", xMm: anchor.xMm + x, yMm: anchor.yMm + y },
  ].map((offset) => ({
    ...offset,
    xMm: roundTo4(offset.xMm),
    yMm: roundTo4(offset.yMm),
  }));
}

function getDefaultAnchorReferencePoint(args: {
  mountReferenceMode?: RotaryMountReferenceMode;
  widthMm: number;
  depthMm: number;
  mountPatternXmm?: number;
}): RotaryAnchorReferencePoint {
  const frontLeft = { xMm: 24, yMm: 28, label: "Anchor reference" };
  if (args.mountReferenceMode === "axis-center") {
    return {
      xMm: roundTo4(args.widthMm / 2),
      yMm: roundTo4(args.depthMm / 2),
      label: "Axis center reference",
    };
  }
  if (
    args.mountReferenceMode === "front-right-bolt" &&
    isFiniteNumber(args.mountPatternXmm)
  ) {
    return {
      xMm: roundTo4(frontLeft.xMm + args.mountPatternXmm),
      yMm: frontLeft.yMm,
      label: "Anchor reference",
    };
  }
  if (
    args.mountReferenceMode === "front-edge-center" &&
    isFiniteNumber(args.mountPatternXmm)
  ) {
    return {
      xMm: roundTo4(frontLeft.xMm + args.mountPatternXmm / 2),
      yMm: frontLeft.yMm,
      label: "Anchor reference",
    };
  }
  return frontLeft;
}

export function getRotaryBaseVisualForPreset(args: {
  preset: RotaryPlacementPreset | null;
  mountPatternXmm?: number | null;
  mountPatternYmm?: number | null;
  mountReferenceMode?: RotaryMountReferenceMode;
}): RotaryBaseVisualDefinition {
  const preset = args.preset;
  const mountPatternXmm = isFiniteNumber(args.mountPatternXmm)
    ? args.mountPatternXmm
    : preset?.mountPatternXmm;
  const mountPatternYmm = isFiniteNumber(args.mountPatternYmm)
    ? args.mountPatternYmm
    : preset?.mountPatternYmm;
  const widthMmRaw = preset?.baseVisualWidthMm;
  const depthMmRaw = preset?.baseVisualDepthMm;
  const widthMm =
    isFiniteNumber(widthMmRaw) && widthMmRaw > 0
      ? widthMmRaw
      : isFiniteNumber(mountPatternXmm) && mountPatternXmm > 0
        ? mountPatternXmm + 52
        : 130;
  const depthMm =
    isFiniteNumber(depthMmRaw) && depthMmRaw > 0
      ? depthMmRaw
      : isFiniteNumber(mountPatternYmm) && mountPatternYmm > 0
        ? mountPatternYmm + 64
        : 180;
  const mountReferenceMode = args.mountReferenceMode ?? preset?.mountReferenceMode;
  const anchorReferencePoint =
    preset?.anchorReferencePointMm ??
    getDefaultAnchorReferencePoint({
      mountReferenceMode,
      widthMm,
      depthMm,
      mountPatternXmm,
    });
  const mountHoles =
    normalizeMountHoles(preset?.mountHoleOffsetsMm) ||
    buildFallbackMountHoles({
      mountPatternXmm,
      mountPatternYmm,
      anchorReferencePoint,
    });

  return {
    presetName: preset?.name ?? "Custom Rotary",
    widthMm: roundTo4(widthMm),
    depthMm: roundTo4(depthMm),
    mountHoles:
      mountHoles.length > 0
        ? mountHoles
        : buildFallbackMountHoles({
            mountPatternXmm,
            mountPatternYmm,
            anchorReferencePoint,
          }),
    anchorReferencePoint,
    isPlaceholder:
      preset?.baseVisualPlaceholder === true ||
      (!isFiniteNumber(mountPatternXmm) || !isFiniteNumber(mountPatternYmm)),
  };
}

export function placeRotaryBaseFromAnchor(args: {
  baseVisual: RotaryBaseVisualDefinition;
  selection?: RotaryHoleAnchorSelection | null;
  rotaryAxisXmm?: number | null;
  rotaryAxisYmm?: number | null;
  referenceToAxisOffsetXmm?: number | null;
  referenceToAxisOffsetYmm?: number | null;
}): RotaryPlacedBaseVisual | null {
  const primaryHole = args.selection?.primaryHole;
  const offsetX = isFiniteNumber(args.referenceToAxisOffsetXmm)
    ? args.referenceToAxisOffsetXmm
    : undefined;
  const offsetY = isFiniteNumber(args.referenceToAxisOffsetYmm)
    ? args.referenceToAxisOffsetYmm
    : undefined;
  const axisXmm = isFiniteNumber(args.rotaryAxisXmm) ? args.rotaryAxisXmm : undefined;
  const axisYmm = isFiniteNumber(args.rotaryAxisYmm) ? args.rotaryAxisYmm : undefined;

  let anchorXmm: number | undefined;
  let anchorYmm: number | undefined;
  if (primaryHole) {
    anchorXmm = primaryHole.xMm;
    anchorYmm = primaryHole.yMm;
  } else if (
    isFiniteNumber(axisXmm) &&
    isFiniteNumber(axisYmm) &&
    isFiniteNumber(offsetX) &&
    isFiniteNumber(offsetY)
  ) {
    anchorXmm = axisXmm - offsetX;
    anchorYmm = axisYmm - offsetY;
  }

  if (!isFiniteNumber(anchorXmm) || !isFiniteNumber(anchorYmm)) {
    if (!isFiniteNumber(axisXmm) || !isFiniteNumber(axisYmm)) return null;
    anchorXmm = axisXmm;
    anchorYmm = axisYmm;
  }

  const leftMm = roundTo4(anchorXmm - args.baseVisual.anchorReferencePoint.xMm);
  const topMm = roundTo4(anchorYmm - args.baseVisual.anchorReferencePoint.yMm);
  const axisCenter = {
    xMm:
      isFiniteNumber(axisXmm)
        ? roundTo4(axisXmm)
        : roundTo4(leftMm + args.baseVisual.widthMm / 2),
    yMm:
      isFiniteNumber(axisYmm)
        ? roundTo4(axisYmm)
        : roundTo4(topMm + args.baseVisual.depthMm / 2),
  };

  const anchorPoint = {
    ...args.baseVisual.anchorReferencePoint,
    xMm: roundTo4(anchorXmm),
    yMm: roundTo4(anchorYmm),
  };

  return {
    presetName: args.baseVisual.presetName,
    leftMm,
    topMm,
    widthMm: args.baseVisual.widthMm,
    depthMm: args.baseVisual.depthMm,
    mountHoles: args.baseVisual.mountHoles.map((offset) => ({
      id: offset.id,
      xMm: roundTo4(leftMm + offset.xMm),
      yMm: roundTo4(topMm + offset.yMm),
    })),
    anchorPoint,
    axisCenter,
    isPlaceholder: args.baseVisual.isPlaceholder,
  };
}
