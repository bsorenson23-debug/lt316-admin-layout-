import type { Box3 } from "three";

export const DEFAULT_MODEL_PREVIEW_BOUNDS_QUANTIZATION_MM = 0.05;

function quantizeCoordinate(value: number, resolutionMm: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(resolutionMm) || resolutionMm <= 0) {
    return value;
  }
  return Math.round(value / resolutionMm) * resolutionMm;
}

export function getQuantizedBox3Snapshot(
  box: Box3 | null | undefined,
  resolutionMm = DEFAULT_MODEL_PREVIEW_BOUNDS_QUANTIZATION_MM,
): readonly [number, number, number, number, number, number] | null {
  if (!box || box.isEmpty()) return null;
  return [
    quantizeCoordinate(box.min.x, resolutionMm),
    quantizeCoordinate(box.min.y, resolutionMm),
    quantizeCoordinate(box.min.z, resolutionMm),
    quantizeCoordinate(box.max.x, resolutionMm),
    quantizeCoordinate(box.max.y, resolutionMm),
    quantizeCoordinate(box.max.z, resolutionMm),
  ] as const;
}

export function getQuantizedBox3Signature(
  box: Box3 | null | undefined,
  resolutionMm = DEFAULT_MODEL_PREVIEW_BOUNDS_QUANTIZATION_MM,
): string {
  const snapshot = getQuantizedBox3Snapshot(box, resolutionMm);
  if (!snapshot) return "empty";
  return snapshot.map((value) => value.toFixed(4)).join("|");
}

export function box3EqualsByQuantizedSignature(
  left: Box3 | null | undefined,
  right: Box3 | null | undefined,
  resolutionMm = DEFAULT_MODEL_PREVIEW_BOUNDS_QUANTIZATION_MM,
): boolean {
  return getQuantizedBox3Signature(left, resolutionMm) === getQuantizedBox3Signature(right, resolutionMm);
}
