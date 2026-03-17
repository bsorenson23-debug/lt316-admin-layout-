export type BedPatternType = "staggered";

export type BedPatternConfig = {
  holeDiameterMm: number;
  pitchXmm: number;
  pitchYmm: number;
  alternateRowOffsetXmm: number;
  patternType: BedPatternType;
};

export type BedHole = {
  xMm: number;
  yMm: number;
  diameterMm: number;
  rowIndex: number;
  columnIndex: number;
};

export type BedBoundsMm = {
  widthMm: number;
  heightMm: number;
};

export const DEFAULT_STAGGERED_BED_PATTERN: BedPatternConfig = {
  holeDiameterMm: 6,
  pitchXmm: 25,
  pitchYmm: 25,
  alternateRowOffsetXmm: 12.5,
  patternType: "staggered",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function getBedCenter(bounds: BedBoundsMm): { xMm: number; yMm: number } {
  return {
    xMm: bounds.widthMm / 2,
    yMm: bounds.heightMm / 2,
  };
}

export function mapBedMmToCanvasPercent(
  xMm: number,
  yMm: number,
  bounds: BedBoundsMm
): { xPercent: number; yPercent: number } {
  const safeWidth = Math.max(1, bounds.widthMm);
  const safeHeight = Math.max(1, bounds.heightMm);
  return {
    xPercent: clamp((xMm / safeWidth) * 100, 0, 100),
    yPercent: clamp((yMm / safeHeight) * 100, 0, 100),
  };
}

export function generateStaggeredBedHoles(
  bounds: BedBoundsMm,
  config: BedPatternConfig = DEFAULT_STAGGERED_BED_PATTERN
): BedHole[] {
  if (
    bounds.widthMm <= 0 ||
    bounds.heightMm <= 0 ||
    config.holeDiameterMm <= 0 ||
    config.pitchXmm <= 0 ||
    config.pitchYmm <= 0
  ) {
    return [];
  }

  const holes: BedHole[] = [];
  const maxRow = Math.floor(bounds.heightMm / config.pitchYmm);

  for (let rowIndex = 0; rowIndex <= maxRow; rowIndex += 1) {
    const yMm = rowIndex * config.pitchYmm;
    if (yMm > bounds.heightMm + 1e-7) break;

    const rowOffsetMm =
      rowIndex % 2 === 0 ? 0 : config.alternateRowOffsetXmm;
    if (rowOffsetMm > bounds.widthMm) continue;

    let columnIndex = 0;
    for (
      let xMm = rowOffsetMm;
      xMm <= bounds.widthMm + 1e-7;
      xMm += config.pitchXmm
    ) {
      holes.push({
        xMm: round(xMm),
        yMm: round(yMm),
        diameterMm: config.holeDiameterMm,
        rowIndex,
        columnIndex,
      });
      columnIndex += 1;
    }
  }

  return holes;
}
