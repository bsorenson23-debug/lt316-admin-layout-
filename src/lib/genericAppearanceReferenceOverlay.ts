import type {
  FinishBandReference,
  ProductAppearanceReferenceLayer,
} from "./productAppearanceReferenceLayers.ts";

export type GenericPreviewHeightAxis = "x" | "y" | "z";

export interface GenericPreviewNativeBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface GenericTopFinishBandOverlay {
  layerId: string;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  height: number;
  userData: {
    bodyContractIgnore: true;
    appearanceReferenceLayer: true;
    referenceOnly: true;
  };
}

export const APPEARANCE_REFERENCE_USER_DATA = {
  bodyContractIgnore: true,
  appearanceReferenceLayer: true,
  referenceOnly: true,
} as const;

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isVisibleTopFinishBandLayer(
  layer: ProductAppearanceReferenceLayer,
): layer is FinishBandReference {
  return (
    layer.kind === "top-finish-band" &&
    layer.visibility === "visible" &&
    isFinitePositive(layer.heightMm) &&
    typeof layer.yMm === "number" &&
    Number.isFinite(layer.yMm)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getAxisValue(bounds: GenericPreviewNativeBounds, axis: GenericPreviewHeightAxis, side: "min" | "max"): number {
  if (axis === "x") return side === "min" ? bounds.minX : bounds.maxX;
  if (axis === "z") return side === "min" ? bounds.minZ : bounds.maxZ;
  return side === "min" ? bounds.minY : bounds.maxY;
}

function getAxisSize(bounds: GenericPreviewNativeBounds, axis: GenericPreviewHeightAxis): number {
  return getAxisValue(bounds, axis, "max") - getAxisValue(bounds, axis, "min");
}

function getBoundsCenter(bounds: GenericPreviewNativeBounds): [number, number, number] {
  return [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
}

function getCrossSectionRadius(bounds: GenericPreviewNativeBounds, axis: GenericPreviewHeightAxis): number {
  if (axis === "x") return Math.max(getAxisSize(bounds, "y"), getAxisSize(bounds, "z")) / 2;
  if (axis === "z") return Math.max(getAxisSize(bounds, "x"), getAxisSize(bounds, "y")) / 2;
  return Math.max(getAxisSize(bounds, "x"), getAxisSize(bounds, "z")) / 2;
}

function getCylinderRotation(axis: GenericPreviewHeightAxis): [number, number, number] {
  if (axis === "x") return [0, 0, -Math.PI / 2];
  if (axis === "z") return [Math.PI / 2, 0, 0];
  return [0, 0, 0];
}

function setAxisPosition(
  position: [number, number, number],
  axis: GenericPreviewHeightAxis,
  value: number,
): [number, number, number] {
  if (axis === "x") return [value, position[1], position[2]];
  if (axis === "z") return [position[0], position[1], value];
  return [position[0], value, position[2]];
}

export function resolveGenericTopFinishBandOverlay(args: {
  appearanceReferenceLayers?: readonly ProductAppearanceReferenceLayer[] | null;
  showTemplateSurfaceZones?: boolean;
  overallHeightMm?: number | null;
  modelScale: number;
  nativeBounds: GenericPreviewNativeBounds;
  heightAxis: GenericPreviewHeightAxis;
}): GenericTopFinishBandOverlay | null {
  if (!args.showTemplateSurfaceZones) return null;
  if (!isFinitePositive(args.overallHeightMm)) return null;
  if (!isFinitePositive(args.modelScale)) return null;

  const layer = args.appearanceReferenceLayers?.find(isVisibleTopFinishBandLayer) ?? null;
  if (!layer) return null;

  const totalHeightMm = args.overallHeightMm;
  const rawLayerHeightMm = layer.heightMm ?? 0;
  const layerTopMm = clamp(layer.yMm ?? 0, 0, Math.max(0, totalHeightMm - 0.1));
  const layerBottomMm = clamp(
    layerTopMm + rawLayerHeightMm,
    layerTopMm + 0.1,
    totalHeightMm,
  );
  const layerHeightMm = Math.max(0.1, layerBottomMm - layerTopMm);
  const layerCenterFromTopMm = layerTopMm + layerHeightMm / 2;

  const nativeTop = getAxisValue(args.nativeBounds, args.heightAxis, "max");
  const nativeCenterOnAxis = nativeTop - layerCenterFromTopMm / args.modelScale;
  const nativeHeight = Math.max(0.05, layerHeightMm / args.modelScale);
  const nativeRadius = getCrossSectionRadius(args.nativeBounds, args.heightAxis) + 1.2 / args.modelScale;
  const position = setAxisPosition(
    getBoundsCenter(args.nativeBounds),
    args.heightAxis,
    nativeCenterOnAxis,
  );

  return {
    layerId: layer.id,
    label: layer.label,
    position,
    rotation: getCylinderRotation(args.heightAxis),
    radius: nativeRadius,
    height: nativeHeight,
    userData: APPEARANCE_REFERENCE_USER_DATA,
  };
}
