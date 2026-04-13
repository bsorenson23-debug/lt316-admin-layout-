import type {
  CanonicalBodyProfile,
  CanonicalBodyProfileSample,
  CanonicalDimensionCalibration,
} from "@/types/productTemplate";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildClosedSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${round2(point.x)} ${round2(point.y)}`).join(" ")} Z`;
}

function interpolate(start: number, end: number, t: number): number {
  return start + ((end - start) * t);
}

export function createFallbackCanonicalBodyProfileFromCalibration(
  calibration: CanonicalDimensionCalibration | null | undefined,
): CanonicalBodyProfile | null {
  if (!calibration) return null;

  const bodyTopMm = calibration.lidBodyLineMm;
  const bodyBottomMm = calibration.bodyBottomMm;
  const bodyHeightMm = bodyBottomMm - bodyTopMm;
  const wrapRadiusMm = calibration.wrapDiameterMm / 2;
  const baseRadiusMm = Math.min(wrapRadiusMm, calibration.baseDiameterMm / 2);

  if (
    !Number.isFinite(bodyTopMm) ||
    !Number.isFinite(bodyBottomMm) ||
    !Number.isFinite(bodyHeightMm) ||
    !Number.isFinite(wrapRadiusMm) ||
    !Number.isFinite(baseRadiusMm) ||
    bodyHeightMm <= 0 ||
    wrapRadiusMm <= 0
  ) {
    return null;
  }

  const taperStartMm = baseRadiusMm >= (wrapRadiusMm - 0.25)
    ? bodyBottomMm
    : interpolate(bodyTopMm, bodyBottomMm, 0.72);
  const axis = calibration.frontAxisPx;
  const axisHeightPx = Math.abs((axis.yBottom ?? 0) - (axis.yTop ?? 0));
  const pxPerMm = axisHeightPx > 0 ? axisHeightPx / bodyHeightMm : 1;

  const samplePositions = [
    bodyTopMm,
    interpolate(bodyTopMm, bodyBottomMm, 0.18),
    interpolate(bodyTopMm, bodyBottomMm, 0.42),
    taperStartMm,
    interpolate(bodyTopMm, bodyBottomMm, 0.88),
    bodyBottomMm,
  ];

  const samples: CanonicalBodyProfileSample[] = samplePositions.map((yMm, index) => {
    const taperT = taperStartMm >= bodyBottomMm
      ? 0
      : Math.min(1, Math.max(0, (yMm - taperStartMm) / (bodyBottomMm - taperStartMm)));
    const radiusMm = taperT <= 0
      ? wrapRadiusMm
      : interpolate(wrapRadiusMm, baseRadiusMm, taperT);
    const yNorm = (yMm - bodyTopMm) / bodyHeightMm;
    const yPx = interpolate(axis.yTop, axis.yBottom, yNorm);
    const radiusPx = radiusMm * pxPerMm;

    return {
      sNorm: round2(index === samplePositions.length - 1 ? 1 : yNorm),
      yMm: round2(yMm),
      yPx: round2(yPx),
      xLeft: round2(axis.xTop - radiusPx),
      radiusPx: round2(radiusPx),
      radiusMm: round2(radiusMm),
    };
  });

  const leftPoints = samples.map((sample) => ({ x: -sample.radiusMm, y: sample.yMm }));
  const rightPoints = [...samples].reverse().map((sample) => ({ x: sample.radiusMm, y: sample.yMm }));

  return {
    symmetrySource: "left",
    mirroredFromSymmetrySource: true,
    axis,
    samples,
    svgPath: buildClosedSvgPath([...leftPoints, ...rightPoints]),
  };
}
