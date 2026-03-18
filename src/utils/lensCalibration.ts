/**
 * Lens calibration utilities.
 *
 * Workflow:
 *   1. selectCalibrationHoles — pick evenly-spread bed holes for the sequence
 *   2. Run video analysis (videoRedDotAnalysis.ts) to get pixel detections
 *   3. matchDetectionsToSequence — pair pixel detections → known mm positions
 *   4. estimateHomography — DLT: pixel ↔ mm transform
 *   5. classifyCalibrationResult — human-readable quality summary
 */

import type { BedHole } from "./staggeredBedPattern";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalibrationDensity = "quick" | "standard" | "full";

export interface CalibrationHole {
  /** Position in the physical sequence (0-based) the user must visit */
  seqIndex: number;
  xMm: number;
  yMm: number;
  rowIndex: number;
  columnIndex: number;
}

export interface DetectedHitPx {
  /** Which sequence hole this matched (0-based) */
  seqIndex: number;
  xPx: number;
  yPx: number;
  confidence: number;
}

export interface HomographyMatrix {
  /** Row-major 3×3 matrix H such that [X,Y,1]^T ≈ H [x,y,1]^T (px → mm) */
  values: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
}

export interface LensCalibrationResult {
  matchedCount: number;
  totalCount: number;
  /** Pixel-to-mm homography */
  homography: HomographyMatrix;
  /** Approximate scale derived from H (px → mm) */
  scaleXMmPerPx: number;
  scaleYMmPerPx: number;
  /** Approximate rotation in degrees from H */
  rotationDeg: number;
  /** RMS reprojection error in mm after applying H */
  residualRmsMm: number;
  /** Barrel distortion k1 (negative = barrel, positive = pincushion) */
  distortionK1: number;
  qualityLabel: "excellent" | "good" | "fair" | "poor";
}

// ---------------------------------------------------------------------------
// Hole selection
// ---------------------------------------------------------------------------

export function getCalibrationHoleCount(density: CalibrationDensity): number {
  if (density === "quick") return 9;
  if (density === "full") return 25;
  return 16; // standard
}

/**
 * Pick `count` holes from the bed grid that are evenly spread across the full
 * bed area. Uses a grid-cell nearest-neighbour strategy so the selected holes
 * are always real bed holes at their exact mm positions.
 */
export function selectCalibrationHoles(
  allHoles: BedHole[],
  count: number,
  bedWidthMm: number,
  bedHeightMm: number
): CalibrationHole[] {
  if (allHoles.length === 0 || count <= 0) return [];

  const gridN = Math.round(Math.sqrt(count));
  const selected: CalibrationHole[] = [];
  const usedKeys = new Set<string>();

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const targetX = ((gx + 0.5) / gridN) * bedWidthMm;
      const targetY = ((gy + 0.5) / gridN) * bedHeightMm;

      let best: BedHole | null = null;
      let bestDist = Infinity;

      for (const hole of allHoles) {
        const key = `${hole.rowIndex},${hole.columnIndex}`;
        if (usedKeys.has(key)) continue;
        const dx = hole.xMm - targetX;
        const dy = hole.yMm - targetY;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = hole;
        }
      }

      if (best) {
        const key = `${best.rowIndex},${best.columnIndex}`;
        usedKeys.add(key);
        selected.push({
          seqIndex: selected.length,
          xMm: best.xMm,
          yMm: best.yMm,
          rowIndex: best.rowIndex,
          columnIndex: best.columnIndex,
        });
      }
    }
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Homography estimation (Direct Linear Transform)
//
// Given N ≥ 4 correspondences (xPx, yPx) → (xMm, yMm), solves for the
// 3×3 homography H using the algebraic formulation with partial normalisation.
//
// Implementation avoids full SVD by fixing h[8]=1 and solving the resulting
// linear system. Works reliably for N=4–25 with well-spread points.
// ---------------------------------------------------------------------------

function normalizePoints(
  pts: Array<{ x: number; y: number }>
): { pts: Array<{ x: number; y: number }>; T: readonly number[] } {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  const scale =
    Math.sqrt(
      pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / n
    ) / Math.SQRT2 || 1;

  return {
    pts: pts.map((p) => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale })),
    // 3×3 normalisation transform T (row-major)
    T: [
      1 / scale, 0, -cx / scale,
      0, 1 / scale, -cy / scale,
      0, 0, 1,
    ],
  };
}

function matMul3(A: readonly number[], B: readonly number[]): number[] {
  const C = Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < 3; k++)
        C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
  return C;
}

function matInv3(m: readonly number[]): number[] | null {
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    (m[4] * m[8] - m[5] * m[7]) / det,
    (m[2] * m[7] - m[1] * m[8]) / det,
    (m[1] * m[5] - m[2] * m[4]) / det,
    (m[5] * m[6] - m[3] * m[8]) / det,
    (m[0] * m[8] - m[2] * m[6]) / det,
    (m[2] * m[3] - m[0] * m[5]) / det,
    (m[3] * m[7] - m[4] * m[6]) / det,
    (m[1] * m[6] - m[0] * m[7]) / det,
    (m[0] * m[4] - m[1] * m[3]) / det,
  ];
  return inv;
}

/** Gauss-Jordan elimination on an N×(N+1) augmented matrix. Returns solution or null. */
function gaussianElim(A: number[][], n: number): number[] | null {
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) return null; // singular
    [A[col], A[maxRow]] = [A[maxRow], A[col]];

    const pivot = A[col][col];
    for (let k = col; k <= n; k++) A[col][k] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let k = col; k <= n; k++) A[row][k] -= factor * A[col][k];
    }
  }
  return A.map((row) => row[n]);
}

/**
 * Estimate the pixel→mm homography from point correspondences.
 * Returns null if fewer than 4 pairs or the system is degenerate.
 */
export function estimateHomography(
  pixelPts: Array<{ x: number; y: number }>,
  mmPts: Array<{ x: number; y: number }>
): HomographyMatrix | null {
  const n = pixelPts.length;
  if (n < 4 || mmPts.length !== n) return null;

  const { pts: normPx, T: Tp } = normalizePoints(pixelPts);
  const { pts: normMm, T: Tm } = normalizePoints(mmPts);

  // Build 2N×8 system (fix h[8]=1)
  const rows = 2 * n;
  const aug: number[][] = [];

  for (let i = 0; i < n; i++) {
    const { x, y } = normPx[i];
    const { x: X, y: Y } = normMm[i];

    // Row 1: h0*x + h1*y + h2 - h6*X*x - h7*X*y = X
    aug.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    // Row 2: h3*x + h4*y + h5 - h6*Y*x - h7*Y*y = Y
    aug.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }

  // Least squares via normal equations A^T A h = A^T b for the 8×8 system
  const AT: number[][] = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: rows }, (_, c) => aug[c][r])
  );
  const ATA: number[][] = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => {
      if (c < 8) {
        return AT[r].reduce((s, v, i) => s + v * AT[c][i], 0);
      }
      // RHS = A^T b
      return AT[r].reduce((s, v, i) => s + v * aug[i][8], 0);
    })
  );

  const h8 = gaussianElim(ATA, 8);
  if (!h8) return null;

  const hNorm: readonly number[] = [...h8, 1];

  // Denormalise: H = Tm^-1 * H_norm * Tp
  const TmInv = matInv3(Tm);
  if (!TmInv) return null;
  const Hdenorm = matMul3(TmInv, matMul3(hNorm as number[], Tp as number[]));

  // Normalise so h[8]=1
  const scale = Hdenorm[8] || 1;
  const values = Hdenorm.map((v) => v / scale) as unknown as HomographyMatrix["values"];

  return { values };
}

/** Apply homography H to a pixel point, returning mm coordinates. */
export function applyHomography(
  H: HomographyMatrix,
  xPx: number,
  yPx: number
): { xMm: number; yMm: number } {
  const v = H.values;
  const w = v[6] * xPx + v[7] * yPx + v[8];
  return {
    xMm: (v[0] * xPx + v[1] * yPx + v[2]) / w,
    yMm: (v[3] * xPx + v[4] * yPx + v[5]) / w,
  };
}

// ---------------------------------------------------------------------------
// Result classification
// ---------------------------------------------------------------------------

export function classifyCalibrationResult(
  H: HomographyMatrix,
  pixelPts: Array<{ x: number; y: number }>,
  mmPts: Array<{ x: number; y: number }>
): Pick<
  LensCalibrationResult,
  "scaleXMmPerPx" | "scaleYMmPerPx" | "rotationDeg" | "residualRmsMm" | "distortionK1" | "qualityLabel"
> {
  const v = H.values;

  // Scale: column magnitudes of the upper-left 2×2 of H
  const scaleXMmPerPx = Math.sqrt(v[0] ** 2 + v[3] ** 2);
  const scaleYMmPerPx = Math.sqrt(v[1] ** 2 + v[4] ** 2);
  const rotationDeg = (Math.atan2(v[3], v[0]) * 180) / Math.PI;

  // RMS reprojection error
  let sumSq = 0;
  for (let i = 0; i < pixelPts.length; i++) {
    const { xMm, yMm } = applyHomography(H, pixelPts[i].x, pixelPts[i].y);
    sumSq += (xMm - mmPts[i].x) ** 2 + (yMm - mmPts[i].y) ** 2;
  }
  const residualRmsMm = Math.sqrt(sumSq / pixelPts.length);

  // Rough k1 estimate from radial residuals (simplified)
  const distortionK1 = 0; // TODO: fit after homography in a follow-up

  const qualityLabel =
    residualRmsMm < 0.5
      ? "excellent"
      : residualRmsMm < 1.5
        ? "good"
        : residualRmsMm < 3
          ? "fair"
          : "poor";

  return { scaleXMmPerPx, scaleYMmPerPx, rotationDeg, residualRmsMm, distortionK1, qualityLabel };
}

export function buildCalibrationResult(
  sequenceHoles: CalibrationHole[],
  detections: DetectedHitPx[]
): LensCalibrationResult | null {
  if (detections.length < 4) return null;

  const pairs = detections
    .map((d) => {
      const hole = sequenceHoles[d.seqIndex];
      if (!hole) return null;
      return {
        px: { x: d.xPx, y: d.yPx },
        mm: { x: hole.xMm, y: hole.yMm },
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (pairs.length < 4) return null;

  const H = estimateHomography(
    pairs.map((p) => p.px),
    pairs.map((p) => p.mm)
  );
  if (!H) return null;

  const metrics = classifyCalibrationResult(
    H,
    pairs.map((p) => p.px),
    pairs.map((p) => p.mm)
  );

  return {
    matchedCount: pairs.length,
    totalCount: sequenceHoles.length,
    homography: H,
    ...metrics,
  };
}
