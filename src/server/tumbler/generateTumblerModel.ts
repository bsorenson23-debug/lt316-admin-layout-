import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { TumblerProfile } from "../../data/tumblerProfiles.ts";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "../../types/productTemplate.ts";
import type { BodyReferenceV2Draft } from "../../lib/bodyReferenceV2Layers.ts";
import type {
  TumblerItemLookupFitDebug,
  TumblerItemLookupFitProfilePoint,
} from "../../types/tumblerItemLookup.ts";
import {
  buildBodyReferenceGlbSourcePayload,
  type BodyReferenceGlbRenderMode,
} from "../../lib/bodyReferenceGlbSource.ts";
import {
  createEmptyBodyGeometryContract,
  updateContractValidation,
  type BodyGeometryContract,
} from "../../lib/bodyGeometryContract.ts";
import { buildBodyReferenceSvgQualityReportFromOutline } from "../../lib/bodyReferenceSvgQuality.ts";
import {
  buildBodyReferenceV2GenerationSource,
  buildBodyReferenceV2MirroredProfile,
  type BodyReferenceV2GenerationSource,
  type BodyReferenceV2MirroredProfile,
} from "../../lib/bodyReferenceV2GenerationSource.ts";
import {
  resolveBodyHeightAuthority,
  type BodyHeightAuthorityInput,
} from "../../lib/bodyHeightAuthority.ts";
import { hashArrayBufferSha256Node, hashJsonSha256Node } from "../../lib/hashSha256.node.ts";
import { stableStringifyForHash } from "../../lib/hashSha256.ts";
import { getGeneratedModelWriteAbsolutePath, writeGeneratedModelGlb } from "../models/generatedModelStorage.ts";
import { writeBodyGeometryAuditArtifact } from "../models/bodyGeometryAuditArtifact.ts";

const BODY_SAMPLE_COUNT = 30;

type FileReaderLike = {
  result: string | ArrayBuffer | null;
  onloadend: null | (() => void);
  onerror: null | ((error: unknown) => void);
  readAsArrayBuffer(blob: Blob): Promise<void>;
  readAsDataURL(blob: Blob): Promise<void>;
};

type Rgb = [number, number, number];

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type RowBounds = {
  left: number;
  right: number;
  width: number;
};

type CenterRun = {
  y: number;
  left: number;
  right: number;
  width: number;
  sampleColor: Rgb;
  whole: RowBounds;
};

export type ProfileReferenceMeasurementRun = {
  y: number;
  left: number;
  right: number;
  width: number;
};

export interface ProfileReferenceMeasurementBand {
  topPx: number;
  bottomPx: number;
  centerYPx: number;
  centerXPx: number;
  leftPx: number;
  rightPx: number;
  widthPx: number;
  referenceHalfWidthPx: number;
  rowCount: number;
  widthStdDevPx: number;
  usedFallback: boolean;
}

export interface ProfileBodyTraceExtents {
  topPx: number;
  bottomPx: number;
  rowCount: number;
  usedFallback: boolean;
}

export interface StraightBodyProfileRunFilterResult {
  runs: ProfileReferenceMeasurementRun[];
  rowCount: number;
  rejectedWideRunCount: number;
  rejectedLowerShelfRunCount: number;
  rejectedSpikeRunCount: number;
  usedFallback: boolean;
  warnings: string[];
}

export interface StraightBodyRadiusSmoothingResult {
  values: number[];
  smoothedSpikeCount: number;
}

type ProfileSilhouetteFit = {
  bodyProfile: Array<{ yMm: number; radiusMm: number }>;
  bodyTopYmm: number;
  bodyBottomYmm: number;
  rimTopYmm: number;
  rimBottomYmm: number;
  rimHeightMm: number;
  rimRadiusMm: number;
  bodyColorHex: string;
  rimColorHex: string;
  fitDebug?: TumblerItemLookupFitDebug | null;
};

type ProfileCandidateFit = ProfileSilhouetteFit & {
  fitScore: number;
};

export type GeneratedTumblerGlbResult = {
  glbPath: string;
  fitDebug: TumblerItemLookupFitDebug | null;
  warnings?: string[];
};

class NodeFileReader implements FileReaderLike {
  result: string | ArrayBuffer | null = null;
  onloadend: null | (() => void) = null;
  onerror: null | ((error: unknown) => void) = null;

  async readAsArrayBuffer(blob: Blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }

  async readAsDataURL(blob: Blob) {
    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const type = blob.type || "application/octet-stream";
      this.result = `data:${type};base64,${buffer.toString("base64")}`;
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }
}

function ensureFileReaderPolyfill() {
  if (typeof globalThis.FileReader === "undefined") {
    globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
  }
}

async function exportSceneToGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
  ensureFileReaderPolyfill();
  const exporter = new GLTFExporter();
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
          return;
        }
        reject(new Error("GLTFExporter did not return a binary GLB buffer."));
      },
      (error) => reject(error),
      { binary: true, onlyVisible: true },
    );
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeScore(value: number): number {
  return clamp(value, 0, 1);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = avg(values);
  return Math.sqrt(avg(values.map((value) => (value - mean) ** 2)));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2,
  );
}

function averageRgb(values: Rgb[]): Rgb {
  if (values.length === 0) return [0, 0, 0];
  return [
    avg(values.map((value) => value[0])),
    avg(values.map((value) => value[1])),
    avg(values.map((value) => value[2])),
  ];
}

function medianRgb(values: Rgb[], fallback: Rgb): Rgb {
  if (values.length === 0) return fallback;
  return [
    median(values.map((value) => value[0])),
    median(values.map((value) => value[1])),
    median(values.map((value) => value[2])),
  ];
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function makeStandardMaterial(
  color: string,
  options?: Partial<THREE.MeshStandardMaterialParameters>,
) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.25,
    roughness: 0.65,
    ...options,
  });
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function sampleBackgroundColor(data: Uint8Array, width: number, height: number): Rgb {
  const samples: Rgb[] = [];
  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));

  const addSample = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    samples.push([data[idx], data[idx + 1], data[idx + 2]]);
  };

  for (let x = 0; x < width; x += stepX) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  return medianRgb(samples, [255, 255, 255]);
}

function buildForegroundMask(data: Uint8Array, width: number, height: number): Uint8Array {
  const bg = sampleBackgroundColor(data, width, height);
  const bgLuma = bg[0] * 0.2126 + bg[1] * 0.7152 + bg[2] * 0.0722;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const alpha = data[idx + 3];
    if (alpha < 18) continue;

    const rgb: Rgb = [data[idx], data[idx + 1], data[idx + 2]];
    const diff = colorDistance(rgb, bg);
    const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const lumaDiff = Math.abs(luma - bgLuma);
    const channelDelta = Math.max(
      Math.abs(rgb[0] - bg[0]),
      Math.abs(rgb[1] - bg[1]),
      Math.abs(rgb[2] - bg[2]),
    );

    if (diff > 20 || channelDelta > 12 || lumaDiff > 10) {
      mask[i] = 1;
    }
  }

  return mask;
}

function findMaskBounds(mask: Uint8Array, width: number, height: number): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function findRowBounds(mask: Uint8Array, width: number, y: number): RowBounds | null {
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    if (left === -1) left = x;
    right = x;
  }
  if (left === -1 || right === -1) return null;
  return { left, right, width: right - left + 1 };
}

function estimateBodyCenterX(mask: Uint8Array, width: number, bounds: Bounds): number {
  const mids: number[] = [];
  const startY = Math.round(bounds.minY + (bounds.maxY - bounds.minY) * 0.38);
  const endY = Math.round(bounds.minY + (bounds.maxY - bounds.minY) * 0.9);
  const minWidth = (bounds.maxX - bounds.minX + 1) * 0.18;

  for (let y = startY; y <= endY; y += 1) {
    const row = findRowBounds(mask, width, y);
    if (!row || row.width < minWidth) continue;
    mids.push((row.left + row.right) / 2);
  }

  if (mids.length === 0) {
    return (bounds.minX + bounds.maxX) / 2;
  }
  return median(mids);
}

function sampleRunColor(
  data: Uint8Array,
  width: number,
  y: number,
  left: number,
  right: number,
): Rgb {
  const runWidth = right - left + 1;
  const sampleLeft = left + Math.floor(runWidth * 0.14);
  const sampleRight = left + Math.floor(runWidth * 0.34);
  const values: Rgb[] = [];

  for (let x = sampleLeft; x <= sampleRight; x += 1) {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 18) continue;
    values.push([data[idx], data[idx + 1], data[idx + 2]]);
  }

  return averageRgb(values);
}

function findCenterRun(
  mask: Uint8Array,
  data: Uint8Array,
  width: number,
  y: number,
  centerX: number,
): CenterRun | null {
  const searchRadius = 24;
  let seedX = -1;
  const center = Math.round(centerX);

  for (let offset = 0; offset <= searchRadius; offset += 1) {
    const left = center - offset;
    const right = center + offset;
    if (left >= 0 && mask[y * width + left]) {
      seedX = left;
      break;
    }
    if (right < width && mask[y * width + right]) {
      seedX = right;
      break;
    }
  }

  if (seedX === -1) return null;

  let left = seedX;
  let right = seedX;
  while (left > 0 && mask[y * width + (left - 1)]) left -= 1;
  while (right + 1 < width && mask[y * width + (right + 1)]) right += 1;

  const whole = findRowBounds(mask, width, y);
  if (!whole) return null;

  return {
    y,
    left,
    right,
    width: right - left + 1,
    sampleColor: sampleRunColor(data, width, y, left, right),
    whole,
  };
}

function smoothSeries(values: number[], radius: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    const slice = values.slice(start, end + 1);
    return avg(slice);
  });
}

export function deriveReferenceMeasurementBand(args: {
  runs: ProfileReferenceMeasurementRun[];
  bodyTopPx: number;
  bodyBottomPx: number;
  centerXPx: number;
  fallbackHalfWidthPx: number;
  bandTopRatio?: number;
  bandHeightRatio?: number;
}): ProfileReferenceMeasurementBand {
  const bodyHeightPx = Math.max(1, args.bodyBottomPx - args.bodyTopPx + 1);
  const bandTopRatio = Number.isFinite(args.bandTopRatio) ? Math.max(0, Number(args.bandTopRatio)) : 0.004;
  const bandHeightRatio = Number.isFinite(args.bandHeightRatio) ? Math.max(0.001, Number(args.bandHeightRatio)) : 0.035;
  const bandTopPx = Math.round(args.bodyTopPx + Math.max(1, bodyHeightPx * bandTopRatio));
  const bandHeightPx = Math.max(6, Math.min(24, Math.round(bodyHeightPx * bandHeightRatio)));
  const bandBottomPx = Math.round(Math.min(
    args.bodyBottomPx,
    bandTopPx + bandHeightPx - 1,
  ));
  const fallbackHalfWidthPx = Math.max(1, args.fallbackHalfWidthPx);

  const bandRows = args.runs
    .filter((run) =>
      run.y >= bandTopPx &&
      run.y <= bandBottomPx &&
      run.left < args.centerXPx &&
      run.right > args.centerXPx &&
      run.width > 0,
    )
    .map((run) => ({
      ...run,
      centerXPx: (run.left + run.right) / 2,
      widthPx: run.right - run.left + 1,
    }));

  if (bandRows.length === 0) {
    return {
      topPx: bandTopPx,
      bottomPx: bandBottomPx,
      centerYPx: round2((bandTopPx + bandBottomPx) / 2),
      centerXPx: round2(args.centerXPx),
      leftPx: round2(args.centerXPx - fallbackHalfWidthPx),
      rightPx: round2(args.centerXPx + fallbackHalfWidthPx),
      widthPx: round2(fallbackHalfWidthPx * 2),
      referenceHalfWidthPx: round2(fallbackHalfWidthPx),
      rowCount: 0,
      widthStdDevPx: 0,
      usedFallback: true,
    };
  }

  const medianWidthPx = median(bandRows.map((run) => run.widthPx));
  const maxWidthDeltaPx = Math.max(5, medianWidthPx * 0.08);
  const stableRows = bandRows.filter((run) => Math.abs(run.widthPx - medianWidthPx) <= maxWidthDeltaPx);
  const selectedRows = stableRows.length >= 3 ? stableRows : bandRows;
  const leftPx = avg(selectedRows.map((run) => run.left));
  const rightPx = avg(selectedRows.map((run) => run.right));
  const widthPx = Math.max(1, rightPx - leftPx + 1);

  return {
    topPx: Math.min(...selectedRows.map((run) => run.y)),
    bottomPx: Math.max(...selectedRows.map((run) => run.y)),
    centerYPx: round2(avg(selectedRows.map((run) => run.y))),
    centerXPx: round2(avg(selectedRows.map((run) => run.centerXPx))),
    leftPx: round2(leftPx),
    rightPx: round2(rightPx),
    widthPx: round2(widthPx),
    referenceHalfWidthPx: round2(widthPx / 2),
    rowCount: selectedRows.length,
    widthStdDevPx: round2(stdDev(selectedRows.map((run) => run.widthPx))),
    usedFallback: false,
  };
}

export function deriveEngravingStartGuidePx(args: {
  rimBottomPx: number;
  paintedBodyTopPx: number;
  seamSilverBottomPx?: number | null;
  guideRatio?: number;
}): number {
  const seamSilverBottomPx = Number.isFinite(args.seamSilverBottomPx)
    ? Number(args.seamSilverBottomPx)
    : null;
  const silverEdgePx = seamSilverBottomPx != null && seamSilverBottomPx < args.paintedBodyTopPx
    ? Math.max(args.rimBottomPx, seamSilverBottomPx)
    : args.rimBottomPx;
  const guideRatio = Number.isFinite(args.guideRatio) ? clamp(Number(args.guideRatio), 0, 1) : 0.5;
  return round2(silverEdgePx + (args.paintedBodyTopPx - silverEdgePx) * guideRatio);
}

function deriveSeamReferenceBottomPx(args: {
  runs: CenterRun[];
  paintedBodyTopPx: number;
  bodyColor: Rgb;
  bodyLuma: number;
  maxCenterWidthPx: number;
  fullTopPx: number;
  fullHeightPx: number;
}): number | null {
  const searchTopPx = Math.max(
    args.fullTopPx,
    Math.round(args.paintedBodyTopPx - Math.max(8, args.fullHeightPx * 0.045)),
  );
  const seamRows = args.runs
    .filter((run) => {
      if (run.y < searchTopPx || run.y >= args.paintedBodyTopPx) return false;
      if (run.width < args.maxCenterWidthPx * 0.28) return false;
      const luma = run.sampleColor[0] * 0.2126 + run.sampleColor[1] * 0.7152 + run.sampleColor[2] * 0.0722;
      const distanceFromBody = colorDistance(run.sampleColor, args.bodyColor);
      return distanceFromBody > 18 || luma > args.bodyLuma + 6;
    })
    .map((run) => run.y)
    .sort((a, b) => a - b);

  if (seamRows.length === 0) return null;

  let segmentStartPx = seamRows[seamRows.length - 1];
  const segmentEndPx = seamRows[seamRows.length - 1];
  for (let index = seamRows.length - 2; index >= 0; index -= 1) {
    if (segmentStartPx - seamRows[index] > 2) break;
    segmentStartPx = seamRows[index];
  }

  return segmentEndPx;
}

export function deriveBodyTraceExtents(args: {
  runs: ProfileReferenceMeasurementRun[];
  paintedBodyTopPx: number;
  colorBodyBottomPx: number;
  centerXPx: number;
  maxCenterWidthPx: number;
  minTraceWidthRatio?: number;
}): ProfileBodyTraceExtents {
  const minTraceWidthRatio = Number.isFinite(args.minTraceWidthRatio)
    ? Math.max(0.01, Number(args.minTraceWidthRatio))
    : 0.12;
  const minTraceWidthPx = Math.max(10, args.maxCenterWidthPx * minTraceWidthRatio);
  const traceRows = args.runs
    .filter((run) =>
      run.y >= args.paintedBodyTopPx &&
      run.left < args.centerXPx &&
      run.right > args.centerXPx &&
      run.width >= minTraceWidthPx,
    )
    .map((run) => run.y);
  const segment = findLongestRowSegment(traceRows);

  if (!segment || segment.start > args.paintedBodyTopPx + 8) {
    return {
      topPx: args.paintedBodyTopPx,
      bottomPx: args.colorBodyBottomPx,
      rowCount: Math.max(0, args.colorBodyBottomPx - args.paintedBodyTopPx + 1),
      usedFallback: true,
    };
  }

  return {
    topPx: args.paintedBodyTopPx,
    bottomPx: Math.max(args.colorBodyBottomPx, segment.end),
    rowCount: segment.end - segment.start + 1,
    usedFallback: false,
  };
}

export function smoothStraightBodyRadiusSeries(
  values: number[],
  options: {
    maxSpikeRatio?: number;
    minSpikeDeltaPx?: number;
    windowRadius?: number;
  } = {},
): StraightBodyRadiusSmoothingResult {
  const maxSpikeRatio = Math.max(1.01, options.maxSpikeRatio ?? 1.18);
  const minSpikeDeltaPx = Math.max(0, options.minSpikeDeltaPx ?? 3);
  const windowRadius = Math.max(1, Math.round(options.windowRadius ?? 2));
  const smoothed = [...values];
  let smoothedSpikeCount = 0;

  for (let index = 0; index < values.length; index += 1) {
    const start = Math.max(0, index - windowRadius);
    const end = Math.min(values.length, index + windowRadius + 1);
    const neighbors = values
      .slice(start, end)
      .filter((value, neighborIndex) => start + neighborIndex !== index && Number.isFinite(value));
    const localMedian = median(neighbors);
    const value = values[index];
    if (!Number.isFinite(value) || localMedian <= 0) continue;
    if (value >= localMedian * maxSpikeRatio && value - localMedian >= minSpikeDeltaPx) {
      smoothed[index] = localMedian;
      smoothedSpikeCount += 1;
    }
  }

  return {
    values: smoothed,
    smoothedSpikeCount,
  };
}

export function filterStableStraightBodyProfileRuns(args: {
  runs: ProfileReferenceMeasurementRun[];
  centerXPx: number;
  trustedOutsideDiameterMm?: number | null;
  referenceBandWidthPx?: number | null;
  lowerShelfStartYPx?: number | null;
  minConsecutiveRows?: number;
  maxSpikeRatio?: number;
  lowerShelfWidthRatio?: number;
}): StraightBodyProfileRunFilterResult {
  const centeredRuns = [...args.runs]
    .filter((run) =>
      Number.isFinite(run.y) &&
      Number.isFinite(run.left) &&
      Number.isFinite(run.right) &&
      Number.isFinite(run.width) &&
      run.left < args.centerXPx &&
      run.right > args.centerXPx &&
      run.width > 0,
    )
    .sort((a, b) => a.y - b.y);
  const minimumRows = Math.max(
    12,
    Math.round(args.minConsecutiveRows ?? Math.max(36, centeredRuns.length * 0.35)),
  );
  if (centeredRuns.length < minimumRows) {
    return {
      runs: [],
      rowCount: 0,
      rejectedWideRunCount: 0,
      rejectedLowerShelfRunCount: 0,
      rejectedSpikeRunCount: 0,
      usedFallback: true,
      warnings: ["body-run-insufficient"],
    };
  }

  const widthMedian = median(centeredRuns.map((run) => run.width));
  const referenceBandWidthPx = Number.isFinite(args.referenceBandWidthPx) && Number(args.referenceBandWidthPx) > 0
    ? Number(args.referenceBandWidthPx)
    : widthMedian;
  const trustedOutsideDiameterMm = Number.isFinite(args.trustedOutsideDiameterMm)
    ? Number(args.trustedOutsideDiameterMm)
    : null;
  const envelope = trustedOutsideDiameterMm
    ? evaluateGenericStraightDiameterEnvelope({
        trustedOutsideDiameterMm,
        bodyProfile: [{ radiusMm: trustedOutsideDiameterMm / 2 }],
      })
    : null;
  const maxAllowedWidthPx = envelope?.maxAllowedRadiusMm && envelope.trustedOutsideDiameterMm && referenceBandWidthPx > 0
    ? Math.max(
        referenceBandWidthPx * ((envelope.maxAllowedRadiusMm * 2) / envelope.trustedOutsideDiameterMm),
        widthMedian * 1.12,
      )
    : widthMedian * 1.22;
  const lowerShelfStartYPx = Number.isFinite(args.lowerShelfStartYPx)
    ? Number(args.lowerShelfStartYPx)
    : Number.POSITIVE_INFINITY;
  const lowerShelfWidthRatio = Math.max(1.02, args.lowerShelfWidthRatio ?? 1.12);
  let rejectedWideRunCount = 0;
  let rejectedLowerShelfRunCount = 0;
  const envelopeFilteredRuns = centeredRuns.filter((run) => {
    if (run.width > maxAllowedWidthPx) {
      rejectedWideRunCount += 1;
      return false;
    }
    if (run.y >= lowerShelfStartYPx && run.width > widthMedian * lowerShelfWidthRatio) {
      rejectedLowerShelfRunCount += 1;
      return false;
    }
    return true;
  });
  const segment = findLongestRowSegment(envelopeFilteredRuns.map((run) => run.y));
  if (!segment) {
    return {
      runs: [],
      rowCount: 0,
      rejectedWideRunCount,
      rejectedLowerShelfRunCount,
      rejectedSpikeRunCount: 0,
      usedFallback: true,
      warnings: uniqueStrings([
        rejectedWideRunCount > 0 ? "shadow-run-rejected" : "",
        rejectedWideRunCount > 0 ? "diameter-envelope-clamped" : "",
        rejectedLowerShelfRunCount > 0 ? "shadow-run-rejected" : "",
        "body-run-insufficient",
      ]),
    };
  }

  const segmentRuns = envelopeFilteredRuns.filter((run) => run.y >= segment.start && run.y <= segment.end);
  const spikeSmoothed = smoothStraightBodyRadiusSeries(
    segmentRuns.map((run) => run.width),
    {
      maxSpikeRatio: args.maxSpikeRatio ?? 1.1,
      minSpikeDeltaPx: 4,
      windowRadius: 2,
    },
  );
  let rejectedSpikeRunCount = 0;
  const spikeFilteredRuns = segmentRuns.filter((run, index) => {
    const smoothedWidth = spikeSmoothed.values[index];
    if (run.width > smoothedWidth && run.width - smoothedWidth >= 4) {
      rejectedSpikeRunCount += 1;
      return false;
    }
    return true;
  });
  const finalSegment = findLongestRowSegment(spikeFilteredRuns.map((run) => run.y));
  const stableRuns = finalSegment
    ? spikeFilteredRuns.filter((run) => run.y >= finalSegment.start && run.y <= finalSegment.end)
    : [];
  const usedFallback = stableRuns.length < minimumRows;
  const warnings = uniqueStrings([
    rejectedWideRunCount > 0 || rejectedLowerShelfRunCount > 0 ? "shadow-run-rejected" : "",
    rejectedWideRunCount > 0 ? "diameter-envelope-clamped" : "",
    rejectedSpikeRunCount > 0 ? "isolated-radius-spike-smoothed" : "",
    stableRuns.length < centeredRuns.length ? "straight-body-run-filtered" : "",
    usedFallback ? "body-run-insufficient" : "",
  ]);

  return {
    runs: usedFallback ? [] : stableRuns,
    rowCount: usedFallback ? 0 : stableRuns.length,
    rejectedWideRunCount,
    rejectedLowerShelfRunCount,
    rejectedSpikeRunCount,
    usedFallback,
    warnings,
  };
}

function findLongestRowSegment(rows: number[]): { start: number; end: number } | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a - b);
  let bestStart = sorted[0];
  let bestEnd = sorted[0];
  let currentStart = sorted[0];
  let currentEnd = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const y = sorted[index];
    if (y - currentEnd <= 2) {
      currentEnd = y;
      continue;
    }

    if (currentEnd - currentStart > bestEnd - bestStart) {
      bestStart = currentStart;
      bestEnd = currentEnd;
    }
    currentStart = y;
    currentEnd = y;
  }

  if (currentEnd - currentStart > bestEnd - bestStart) {
    bestStart = currentStart;
    bestEnd = currentEnd;
  }

  return { start: bestStart, end: bestEnd };
}

function buildLatheProfileFromRows(args: {
  profile: TumblerProfile;
  runs: CenterRun[];
  fullTop: number;
  fullHeightPx: number;
  bodyTop: number;
  bodyBottom: number;
  centerX: number;
  referenceHalfWidthPx: number;
}): {
  bodyProfile: Array<{ yMm: number; radiusMm: number }>;
  bodyTopYmm: number;
  bodyBottomYmm: number;
  mmPerPxY: number;
  pxToMmX: number;
  smoothedSpikeCount: number;
  debugProfilePoints: TumblerItemLookupFitProfilePoint[];
} {
  const { profile, runs, fullTop, fullHeightPx, bodyTop, bodyBottom, centerX, referenceHalfWidthPx } = args;
  const mmPerPxY = profile.overallHeightMm / Math.max(1, fullHeightPx);
  const bodyRuns = runs.filter((run) => run.y >= bodyTop && run.y <= bodyBottom);
  const radiusSmoothing = smoothStraightBodyRadiusSeries(
    bodyRuns.map((run) => Math.max(1, centerX - run.left, run.right - centerX)),
    { maxSpikeRatio: 1.1, minSpikeDeltaPx: 3, windowRadius: 2 },
  );
  const widths = smoothSeries(radiusSmoothing.values, 2);
  const topRadiusMm = (profile.topDiameterMm ?? profile.outsideDiameterMm ?? 88.9) / 2;
  const pxToMmX = topRadiusMm / Math.max(1, referenceHalfWidthPx);
  const overallTopYmm = profile.overallHeightMm / 2;

  const bodyProfile: Array<{ yMm: number; radiusMm: number }> = [];
  const debugProfilePoints: TumblerItemLookupFitProfilePoint[] = [];
  for (let index = 0; index < BODY_SAMPLE_COUNT; index += 1) {
    const sourceIndex = Math.round(((widths.length - 1) * index) / Math.max(1, BODY_SAMPLE_COUNT - 1));
    const run = bodyRuns[sourceIndex];
    const radiusPx = widths[sourceIndex];
    const radiusMm = radiusPx * pxToMmX;
    const yMm = overallTopYmm - (run.y - fullTop) * mmPerPxY;
    bodyProfile.push({
      yMm: round2(yMm),
      radiusMm: round2(radiusMm),
    });
    debugProfilePoints.push({
      yPx: run.y,
      yMm: round2(yMm),
      radiusPx: round2(radiusPx),
      radiusMm: round2(radiusMm),
    });
  }

  const bodyTopYmm = overallTopYmm - (bodyTop - fullTop) * mmPerPxY;
  const bodyBottomYmm = overallTopYmm - (bodyBottom - fullTop) * mmPerPxY;

  return {
    bodyProfile,
    bodyTopYmm: round2(bodyTopYmm),
    bodyBottomYmm: round2(bodyBottomYmm),
    mmPerPxY,
    pxToMmX,
    smoothedSpikeCount: radiusSmoothing.smoothedSpikeCount,
    debugProfilePoints,
  };
}

export function resolveGeneratedBodyBandPolicy(
  profile: TumblerProfile,
  hasCandidateImage: boolean,
): NonNullable<TumblerProfile["generatedModelPolicy"]> | null {
  return profile.generatedModelPolicy ?? (
    profile.shapeType === "straight" && hasCandidateImage
      ? { strategy: "body-band-lathe" as const }
      : null
  );
}

function shouldUseGenericStraightPhotoFitGuard(profile: TumblerProfile): boolean {
  return !profile.generatedModelPolicy && profile.shapeType === "straight";
}

async function fitProfileBodyBandFromImage(
  profile: TumblerProfile,
  imageUrl: string,
): Promise<ProfileCandidateFit | null> {
  const sharp = (await import("sharp")).default;
  const sourceBuffer = await fetchBuffer(imageUrl);
  const { data, info } = await sharp(sourceBuffer)
    .rotate()
    .resize({ height: 1400, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const mask = buildForegroundMask(data, width, height);
  const bounds = findMaskBounds(mask, width, height);
  if (!bounds) return null;

  const centerX = estimateBodyCenterX(mask, width, bounds);
  const runs: CenterRun[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const run = findCenterRun(mask, data, width, y, centerX);
    if (run) runs.push(run);
  }
  if (runs.length < 40) return null;

  const usesGenericStraightPhotoGuard = shouldUseGenericStraightPhotoFitGuard(profile);
  const rawMaxCenterWidth = percentile(runs.map((run) => run.width), 0.95);
  const verticalSpanPx = bounds.maxY - bounds.minY + 1;
  const middleBodyWidths = runs
    .filter((run) =>
      run.y >= bounds.minY + verticalSpanPx * 0.18 &&
      run.y <= bounds.minY + verticalSpanPx * 0.82,
    )
    .map((run) => run.width);
  const middleBodyWidth = percentile(middleBodyWidths, 0.65);
  const maxCenterWidth = usesGenericStraightPhotoGuard && middleBodyWidth > 0
    ? Math.min(rawMaxCenterWidth, Math.max(middleBodyWidth, percentile(middleBodyWidths, 0.75)))
    : rawMaxCenterWidth;
  const fitWarnings: string[] = [];
  if (usesGenericStraightPhotoGuard && rawMaxCenterWidth > maxCenterWidth * 1.18) {
    fitWarnings.push("shadow-run-rejected");
  }
  const stableRows = runs.filter((run) => run.width >= maxCenterWidth * 0.72);
  if (stableRows.length < 20) return null;

  const fullTop = stableRows[0].y;
  const fullBottom = stableRows[stableRows.length - 1].y;
  const fullHeightPx = fullBottom - fullTop + 1;
  if (fullHeightPx < 300) return null;

  const lowerColorRows = runs.filter((run) =>
    run.y >= fullTop + fullHeightPx * 0.58 &&
    run.y <= fullTop + fullHeightPx * 0.88 &&
    run.width >= maxCenterWidth * 0.35,
  );
  const bodyColor = medianRgb(
    lowerColorRows.map((run) => run.sampleColor),
    [213, 215, 117],
  );

  const bodyRowYs = runs
    .filter((run) =>
      run.y >= fullTop &&
      run.y <= fullBottom &&
      run.width >= maxCenterWidth * 0.28 &&
      colorDistance(run.sampleColor, bodyColor) <= 58,
    )
    .map((run) => run.y);

  const bodySegment = findLongestRowSegment(bodyRowYs);
  if (!bodySegment) return null;

  const bodyLuma = bodyColor[0] * 0.2126 + bodyColor[1] * 0.7152 + bodyColor[2] * 0.0722;
  const silverRowYs = runs
    .filter((run) => {
      if (run.y > fullTop + fullHeightPx * 0.28) return false;
      if (run.whole.width < maxCenterWidth * 0.7) return false;
      const luma = run.sampleColor[0] * 0.2126 + run.sampleColor[1] * 0.7152 + run.sampleColor[2] * 0.0722;
      return luma > bodyLuma + 12 && colorDistance(run.sampleColor, bodyColor) > 24;
    })
    .map((run) => run.y);
  const silverSegment = findLongestRowSegment(silverRowYs);

  const rimTop = silverSegment ? silverSegment.start : fullTop;
  const rimBottom = silverSegment ? silverSegment.end : Math.max(fullTop, bodySegment.start - 1);
  const paintedBodyTop = bodySegment.start;
  const colorBodyBottom = bodySegment.end;
  if (colorBodyBottom - paintedBodyTop < fullHeightPx * 0.5) return null;

  const fitDebugProfile = profile.generatedModelPolicy?.fitDebugProfile ?? {};
  const seamSilverBottomPx = deriveSeamReferenceBottomPx({
    runs,
    paintedBodyTopPx: paintedBodyTop,
    bodyColor,
    bodyLuma,
    maxCenterWidthPx: maxCenterWidth,
    fullTopPx: fullTop,
    fullHeightPx,
  });
  const engravingStartGuidePx = deriveEngravingStartGuidePx({
    rimBottomPx: rimBottom,
    paintedBodyTopPx: paintedBodyTop,
    seamSilverBottomPx,
    guideRatio: fitDebugProfile.engravingGuideRatio,
  });
  const bodyTrace = deriveBodyTraceExtents({
    runs,
    paintedBodyTopPx: paintedBodyTop,
    colorBodyBottomPx: colorBodyBottom,
    centerXPx: centerX,
    maxCenterWidthPx: maxCenterWidth,
    minTraceWidthRatio: fitDebugProfile.minTraceWidthRatio,
  });
  let bodyTop = bodyTrace.topPx;
  let bodyBottom = bodyTrace.bottomPx;
  if (bodyBottom - bodyTop < fullHeightPx * 0.5) return null;

  let bodyRuns = runs.filter((run) => run.y >= bodyTop && run.y <= bodyBottom);
  const rimRows = runs.filter((run) => run.y >= rimTop && run.y <= rimBottom);
  const rimHalfWidthPx = avg(rimRows.map((run) => Math.max(1, run.whole.right - centerX)));
  let measurementBand = deriveReferenceMeasurementBand({
    runs,
    bodyTopPx: paintedBodyTop,
    bodyBottomPx: bodyBottom,
    centerXPx: centerX,
    fallbackHalfWidthPx: Number.isFinite(rimHalfWidthPx) && rimHalfWidthPx > 0 ? rimHalfWidthPx : maxCenterWidth / 2,
    bandTopRatio: fitDebugProfile.measurementBandRatio?.top,
    bandHeightRatio: fitDebugProfile.measurementBandRatio?.height,
  });

  if (usesGenericStraightPhotoGuard) {
    const stableBodyRunFilter = filterStableStraightBodyProfileRuns({
      runs: bodyRuns,
      centerXPx: centerX,
      trustedOutsideDiameterMm: profile.outsideDiameterMm,
      referenceBandWidthPx: measurementBand.widthPx,
      lowerShelfStartYPx: bodyTop + (bodyBottom - bodyTop) * 0.86,
      minConsecutiveRows: Math.max(36, Math.round(bodyRuns.length * 0.45)),
    });
    fitWarnings.push(...stableBodyRunFilter.warnings);
    if (stableBodyRunFilter.usedFallback) return null;

    const stableBodyRunYs = new Set(stableBodyRunFilter.runs.map((run) => run.y));
    bodyRuns = bodyRuns.filter((run) => stableBodyRunYs.has(run.y));
    if (bodyRuns.length < 36) return null;
    bodyTop = bodyRuns[0].y;
    bodyBottom = bodyRuns[bodyRuns.length - 1].y;
    measurementBand = deriveReferenceMeasurementBand({
      runs: bodyRuns,
      bodyTopPx: bodyTop,
      bodyBottomPx: bodyBottom,
      centerXPx: centerX,
      fallbackHalfWidthPx: Number.isFinite(rimHalfWidthPx) && rimHalfWidthPx > 0 ? rimHalfWidthPx : maxCenterWidth / 2,
      bandTopRatio: fitDebugProfile.measurementBandRatio?.top,
      bandHeightRatio: fitDebugProfile.measurementBandRatio?.height,
    });
  }

  const profileFullBottom = usesGenericStraightPhotoGuard
    ? bodyBottom
    : Math.max(fullBottom, bodyBottom);
  const profileFullHeightPx = profileFullBottom - fullTop + 1;
  const profileFit = buildLatheProfileFromRows({
    profile,
    runs: bodyRuns,
    fullTop,
    fullHeightPx: profileFullHeightPx,
    bodyTop,
    bodyBottom,
    centerX,
    referenceHalfWidthPx: measurementBand.referenceHalfWidthPx,
  });

  const rimHeightMm = round2(Math.max(4, (rimBottom - rimTop + 1) * profileFit.mmPerPxY));
  const rimRadiusMm = round2(avg(rimRows.map((run) => (run.whole.width / 2) * profileFit.pxToMmX)) || profileFit.bodyProfile[0].radiusMm * 1.02);
  const rimColor = medianRgb(rimRows.map((run) => run.sampleColor), [185, 185, 185]);
  const overallTopYmm = profile.overallHeightMm / 2;
  const rimTopYmm = round2(overallTopYmm - (rimTop - fullTop) * profileFit.mmPerPxY);
  const rimBottomYmm = round2(overallTopYmm - (rimBottom - fullTop) * profileFit.mmPerPxY);
  const centerOffsetScore = normalizeScore(1 - Math.abs(centerX - width / 2) / Math.max(1, width * 0.18));
  const portraitRatio = width / Math.max(1, height);
  const portraitScore = normalizeScore(1 - Math.abs(portraitRatio - 0.44) / 0.32);
  const bodyCoverage = (bodyBottom - bodyTop + 1) / Math.max(1, profileFullHeightPx);
  const bodyCoverageScore = normalizeScore(1 - Math.abs(bodyCoverage - 0.74) / 0.2);
  const symmetryScore = normalizeScore(avg(bodyRuns.map((run) => {
    const leftSpan = centerX - run.left;
    const rightSpan = run.right - centerX;
    const maxSpan = Math.max(1, Math.max(leftSpan, rightSpan));
    return 1 - Math.abs(leftSpan - rightSpan) / maxSpan;
  })));
  const topBodyRadius = bodyRuns[0] ? Math.max(1, centerX - bodyRuns[0].left, bodyRuns[0].right - centerX) : rimHalfWidthPx;
  const bottomBodyRadius = bodyRuns[bodyRuns.length - 1]
    ? Math.max(1, centerX - bodyRuns[bodyRuns.length - 1].left, bodyRuns[bodyRuns.length - 1].right - centerX)
    : topBodyRadius;
  const taperRatio = bottomBodyRadius / Math.max(1, topBodyRadius);
  const taperScore = normalizeScore(1 - Math.abs(taperRatio - 0.82) / 0.18);
  const silverScore = silverSegment ? 1 : 0.2;
  const fitScore = round2(
    silverScore * 3 +
    centerOffsetScore * 2.4 +
    symmetryScore * 2 +
    bodyCoverageScore * 1.6 +
    taperScore * 1.2 +
    portraitScore * 0.8,
  );
  if (profileFit.smoothedSpikeCount > 0) {
    fitWarnings.push("isolated-radius-spike-smoothed");
  }

  const fitDebug: TumblerItemLookupFitDebug = {
    kind: "lathe-body-fit",
    sourceImageUrl: imageUrl,
    imageWidthPx: width,
    imageHeightPx: height,
    silhouetteBoundsPx: bounds,
    centerXPx: round2(centerX),
    fullTopPx: fullTop,
    fullBottomPx: profileFullBottom,
    bodyTopPx: bodyTop,
    bodyBottomPx: bodyBottom,
    paintedBodyTopPx: paintedBodyTop,
    colorBodyBottomPx: colorBodyBottom,
    bodyTraceTopPx: bodyTrace.topPx,
    bodyTraceBottomPx: bodyTrace.bottomPx,
    engravingStartGuidePx,
    seamSilverBottomPx,
    rimTopPx: rimTop,
    rimBottomPx: rimBottom,
    referenceBandTopPx: measurementBand.topPx,
    referenceBandBottomPx: measurementBand.bottomPx,
    referenceBandCenterYPx: measurementBand.centerYPx,
    referenceBandWidthPx: measurementBand.widthPx,
    measurementBandTopPx: measurementBand.topPx,
    measurementBandBottomPx: measurementBand.bottomPx,
    measurementBandCenterYPx: measurementBand.centerYPx,
    measurementBandCenterXPx: measurementBand.centerXPx,
    measurementBandWidthPx: measurementBand.widthPx,
    measurementBandLeftPx: measurementBand.leftPx,
    measurementBandRightPx: measurementBand.rightPx,
    measurementBandRowCount: measurementBand.rowCount,
    measurementBandWidthStdDevPx: measurementBand.widthStdDevPx,
    maxCenterWidthPx: round2(maxCenterWidth),
    referenceHalfWidthPx: measurementBand.referenceHalfWidthPx,
    fitScore,
    warnings: uniqueStrings(fitWarnings),
    profilePoints: profileFit.debugProfilePoints,
  };

  return {
    bodyProfile: profileFit.bodyProfile,
    bodyTopYmm: profileFit.bodyTopYmm,
    bodyBottomYmm: profileFit.bodyBottomYmm,
    rimTopYmm,
    rimBottomYmm,
    rimHeightMm,
    rimRadiusMm,
    bodyColorHex: rgbToHex(bodyColor),
    rimColorHex: rgbToHex(rimColor),
    fitScore,
    fitDebug,
  };
}

async function fitBestProfileBodyBandFromImages(
  profile: TumblerProfile,
  imageUrls: string[],
): Promise<ProfileSilhouetteFit | null> {
  const seen = new Set<string>();
  const candidates = imageUrls.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, 12);

  let bestFit: ProfileCandidateFit | null = null;
  for (const imageUrl of candidates) {
    try {
      const fit = await fitProfileBodyBandFromImage(profile, imageUrl);
      if (!fit) continue;
      if (!bestFit || fit.fitScore > bestFit.fitScore) {
        bestFit = fit;
      }
    } catch (error) {
      console.warn("[generateTumblerModel] candidate fit failed:", imageUrl, error);
    }
  }

  if (!bestFit) return null;
  console.info(
    "[generateTumblerModel] selected profile image:",
    bestFit.fitDebug?.sourceImageUrl ?? "unknown",
    "score",
    bestFit.fitScore,
  );
  return bestFit;
}

function buildFallbackBodyProfile(profile: TumblerProfile) {
  const overallHeight = profile.overallHeightMm;
  const topDiameter = profile.topDiameterMm ?? profile.outsideDiameterMm ?? 88.9;
  const bottomDiameter = profile.bottomDiameterMm ?? profile.outsideDiameterMm ?? topDiameter;
  const bodyTopYmm = overallHeight / 2 - 30;
  const bodyBottomYmm = -overallHeight / 2;
  const halfHeight = bodyTopYmm - bodyBottomYmm;
  const topRadius = topDiameter / 2;
  const bottomRadius = bottomDiameter / 2;

  return {
    bodyTopYmm: round2(bodyTopYmm),
    bodyBottomYmm: round2(bodyBottomYmm),
    rimTopYmm: round2(overallHeight / 2),
    rimBottomYmm: round2(bodyTopYmm),
    bodyProfile: [
      { yMm: bodyBottomYmm, radiusMm: bottomRadius * 0.92 },
      { yMm: bodyBottomYmm + 12, radiusMm: bottomRadius },
      { yMm: bodyBottomYmm + halfHeight * 0.32, radiusMm: bottomRadius + (topRadius - bottomRadius) * 0.45 },
      { yMm: bodyBottomYmm + halfHeight * 0.68, radiusMm: topRadius * 0.985 },
      { yMm: bodyTopYmm, radiusMm: topRadius },
    ],
    rimHeightMm: 12,
    rimRadiusMm: topRadius * 1.02,
    bodyColorHex: "#d5d775",
    rimColorHex: "#c2c5c7",
    fitDebug: null,
  } satisfies ProfileSilhouetteFit;
}

export function evaluateGenericStraightDiameterEnvelope(args: {
  trustedOutsideDiameterMm?: number | null;
  bodyProfile: Array<{ radiusMm: number }>;
}): {
  trustedOutsideDiameterMm: number | null;
  trustedRadiusMm: number | null;
  toleranceMm: number | null;
  maxAllowedRadiusMm: number | null;
  maxRadiusMm: number;
  exceedsEnvelope: boolean;
} {
  const trustedOutsideDiameterMm = Number.isFinite(args.trustedOutsideDiameterMm)
    ? Number(args.trustedOutsideDiameterMm)
    : null;
  const radii = args.bodyProfile
    .map((point) => point.radiusMm)
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxRadiusMm = radii.length > 0 ? Math.max(...radii) : 0;

  if (!trustedOutsideDiameterMm || trustedOutsideDiameterMm <= 0) {
    return {
      trustedOutsideDiameterMm: null,
      trustedRadiusMm: null,
      toleranceMm: null,
      maxAllowedRadiusMm: null,
      maxRadiusMm: round2(maxRadiusMm),
      exceedsEnvelope: false,
    };
  }

  const trustedRadiusMm = trustedOutsideDiameterMm / 2;
  const toleranceMm = Math.max(3, trustedRadiusMm * 0.08);
  const maxAllowedRadiusMm = trustedRadiusMm + toleranceMm;

  return {
    trustedOutsideDiameterMm: round2(trustedOutsideDiameterMm),
    trustedRadiusMm: round2(trustedRadiusMm),
    toleranceMm: round2(toleranceMm),
    maxAllowedRadiusMm: round2(maxAllowedRadiusMm),
    maxRadiusMm: round2(maxRadiusMm),
    exceedsEnvelope: maxRadiusMm > maxAllowedRadiusMm,
  };
}

export function buildGenericStraightDiameterEnvelopeWarning(args: {
  trustedOutsideDiameterMm?: number | null;
  bodyProfile: Array<{ radiusMm: number }>;
}): string | null {
  const envelope = evaluateGenericStraightDiameterEnvelope(args);
  if (!envelope.exceedsEnvelope || !envelope.trustedOutsideDiameterMm) {
    return null;
  }

  const imageDiameterMm = round2(envelope.maxRadiusMm * 2);
  return `diameter-envelope-clamped: Image-derived straight tumbler contour exceeded trusted diameter envelope (${imageDiameterMm} mm vs ${envelope.trustedOutsideDiameterMm} mm); using trusted profile dimensions.`;
}

function constrainGenericStraightFitToTrustedDiameter(args: {
  profile: TumblerProfile;
  fit: ProfileSilhouetteFit;
  fallbackFit: ProfileSilhouetteFit;
  enabled: boolean;
}): { fit: ProfileSilhouetteFit; warning: string | null } {
  if (!args.enabled) {
    return { fit: args.fit, warning: null };
  }

  const warning = buildGenericStraightDiameterEnvelopeWarning({
    trustedOutsideDiameterMm: args.profile.outsideDiameterMm,
    bodyProfile: args.fit.bodyProfile,
  });
  if (!warning) {
    return { fit: args.fit, warning: null };
  }

  const fallbackFit = {
    ...args.fallbackFit,
    bodyColorHex: args.fit.bodyColorHex,
    rimColorHex: args.fit.rimColorHex,
    fitDebug: null,
  };
  return {
    fit: fallbackFit,
    warning,
  };
}

function createBodyMesh(fit: ProfileSilhouetteFit): THREE.Mesh {
  const orderedProfile = [...fit.bodyProfile]
    .map((point) => ({
      yMm: round2(point.yMm),
      radiusMm: round2(Math.max(1, point.radiusMm)),
    }))
    .sort((a, b) => a.yMm - b.yMm);

  const bottomRadiusMm = orderedProfile[0]?.radiusMm ?? 1;
  const topRadiusMm = orderedProfile[orderedProfile.length - 1]?.radiusMm ?? bottomRadiusMm;
  const contour: Array<{ radiusMm: number; yMm: number }> = [
    { radiusMm: bottomRadiusMm, yMm: round2(fit.bodyBottomYmm) },
    ...orderedProfile,
    { radiusMm: topRadiusMm, yMm: round2(fit.bodyTopYmm) },
  ].filter((point, index, array) => {
    if (index === 0) return true;
    const prev = array[index - 1];
    return !(prev.radiusMm === point.radiusMm && prev.yMm === point.yMm);
  });

  const points = [
    new THREE.Vector2(0, fit.bodyBottomYmm),
    ...contour.map((point) => new THREE.Vector2(point.radiusMm, point.yMm)),
    new THREE.Vector2(0, fit.bodyTopYmm),
  ];

  const geometry = new THREE.LatheGeometry(points, 112);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    makeStandardMaterial(fit.bodyColorHex, { metalness: 0.18, roughness: 0.72 }),
  );
  mesh.name = "body_mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRimMesh(fit: ProfileSilhouetteFit): THREE.Mesh {
  const orderedProfile = [...fit.bodyProfile]
    .map((point) => ({
      yMm: round2(point.yMm),
      radiusMm: round2(Math.max(1, point.radiusMm)),
    }))
    .sort((a, b) => a.yMm - b.yMm);
  const topBodyRadiusMm = orderedProfile[orderedProfile.length - 1]?.radiusMm ?? fit.rimRadiusMm;
  const outerRadiusMm = round2(
    Math.min(Math.max(topBodyRadiusMm * 1.002, fit.rimRadiusMm), topBodyRadiusMm * 1.02),
  );
  const wallThicknessMm = round2(Math.max(1.2, outerRadiusMm * 0.04));
  const innerRadiusMm = round2(Math.max(1, outerRadiusMm - wallThicknessMm));
  const rimProfile = [
    new THREE.Vector2(innerRadiusMm, fit.rimBottomYmm),
    new THREE.Vector2(outerRadiusMm, fit.rimBottomYmm),
    new THREE.Vector2(outerRadiusMm, fit.rimTopYmm),
    new THREE.Vector2(innerRadiusMm, fit.rimTopYmm),
  ];
  const geometry = new THREE.LatheGeometry(rimProfile, 96);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    makeStandardMaterial(fit.rimColorHex, { metalness: 0.82, roughness: 0.22 }),
  );
  mesh.name = "rim_mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildProfileBodyBandScene(profile: TumblerProfile, fit: ProfileSilhouetteFit): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = `${profile.id}_generated_profile_body_band`;

  const body = createBodyMesh(fit);
  const rim = createRimMesh(fit);

  scene.add(body);
  scene.add(rim);

  return scene;
}

async function writeGeneratedGlb(
  fileName: string,
  scene: THREE.Scene,
): Promise<string> {
  const arrayBuffer = await exportSceneToGlb(scene);
  return writeGeneratedModelGlb(fileName, arrayBuffer);
}

export async function ensureGeneratedTumblerGlb(
  profileId: string,
  options?: { imageUrl?: string | null; imageUrls?: string[] },
) : Promise<GeneratedTumblerGlbResult> {
  const { getTumblerProfileById } = await import("../../data/tumblerProfiles.ts");
  const profile = getTumblerProfileById(profileId);
  if (!profile) return { glbPath: "", fitDebug: null };
  const primaryImageUrl = options?.imageUrl ?? null;
  const hasCandidateImage = Boolean(
    primaryImageUrl ||
    (options?.imageUrls ?? []).some((value) => Boolean(value)),
  );
  const generatedModelPolicy = resolveGeneratedBodyBandPolicy(profile, hasCandidateImage);
  if (generatedModelPolicy?.strategy !== "body-band-lathe") {
    return { glbPath: "", fitDebug: null };
  }

  const fallbackFit: ProfileSilhouetteFit = buildFallbackBodyProfile(profile);
  const warnings: string[] = [];
  const usesGenericStraightPolicy = shouldUseGenericStraightPhotoFitGuard(profile);
  let fit: ProfileSilhouetteFit = fallbackFit;

  const candidateImageUrls = [
    ...(options?.imageUrls ?? []),
  ].filter((value, index, array): value is string => Boolean(value) && value !== primaryImageUrl && array.indexOf(value) === index);

  if (primaryImageUrl) {
    try {
      const primaryFit = await fitProfileBodyBandFromImage(profile, primaryImageUrl);
      if (primaryFit) {
        const constrained = constrainGenericStraightFitToTrustedDiameter({
          profile,
          fit: primaryFit,
          fallbackFit,
          enabled: usesGenericStraightPolicy,
        });
        fit = constrained.fit;
        if (constrained.warning) warnings.push(constrained.warning);
      }
    } catch (error) {
      console.warn("[generateTumblerModel] selected variant fit failed:", primaryImageUrl, error);
    }
  }

  if (!fit.fitDebug && candidateImageUrls.length > 0) {
    try {
      const silhouetteFit = await fitBestProfileBodyBandFromImages(profile, candidateImageUrls);
      if (silhouetteFit) {
        const constrained = constrainGenericStraightFitToTrustedDiameter({
          profile,
          fit: silhouetteFit,
          fallbackFit,
          enabled: usesGenericStraightPolicy,
        });
        fit = constrained.fit;
        if (constrained.warning) warnings.push(constrained.warning);
      }
    } catch (error) {
      console.warn("[generateTumblerModel] silhouette fit failed:", error);
    }
  }

  if (hasCandidateImage && !fit.fitDebug) {
    warnings.push("dimension-fallback-used: no trustworthy image-derived body contour was available; using trusted profile dimensions.");
  }

  const fileStem = generatedModelPolicy.fileStem?.trim() || `${profile.id}-bodyfit-v5`;
  const fileName = `${fileStem}.glb`;
  return {
    glbPath: await writeGeneratedGlb(fileName, buildProfileBodyBandScene(profile, fit)),
    fitDebug: fit.fitDebug ?? null,
    warnings: uniqueStrings(warnings),
  };
}

export type BodyReferenceGenerationSourceMode =
  | "v1-approved-contour"
  | "v2-mirrored-profile";

export interface GenerateBodyReferenceGlbInput {
  renderMode?: BodyReferenceGlbRenderMode | null;
  templateName?: string | null;
  matchedProfileId?: string | null;
  generationSourceMode?: BodyReferenceGenerationSourceMode | null;
  bodyOutlineSourceMode?: EditableBodyOutline["sourceContourMode"] | null;
  bodyOutline?: EditableBodyOutline | null;
  canonicalBodyProfile?: CanonicalBodyProfile | null;
  canonicalDimensionCalibration?: CanonicalDimensionCalibration | null;
  bodyReferenceV2Draft?: BodyReferenceV2Draft | null;
  bodyHeightAuthorityInput?: BodyHeightAuthorityInput | null;
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
}

export interface GeneratedBodyReferenceMeshBounds {
  minMm: { x: number; y: number; z: number };
  maxMm: { x: number; y: number; z: number };
  sizeMm: { x: number; y: number; z: number };
}

export interface GeneratedBodyReferenceGlbResult {
  glbPath: string;
  auditJsonPath: string | null;
  fitDebug: null;
  modelStatus: "generated-reviewed-model";
  renderMode: BodyReferenceGlbRenderMode;
  generatedSourceSignature: string;
  modelSourceLabel: string;
  bodyColorHex: string | null;
  rimColorHex: string | null;
  meshNames: string[];
  fallbackMeshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
  bodyGeometryContract: BodyGeometryContract;
}

function slugifyFileStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "body-reference";
}

function overallYToBottomAnchoredModelY(totalHeightMm: number, yOverallMm: number): number {
  return round2(totalHeightMm - yOverallMm);
}

function buildBodyReferenceFileStem(
  input: GenerateBodyReferenceGlbInput,
  sourceHash: string,
): string {
  const base = slugifyFileStem(input.templateName ?? input.matchedProfileId ?? "body-reference");
  return `${base}-cutout-${sourceHash.slice(0, 10)}`;
}

function resolveBodyReferenceGenerationSourceMode(
  input: GenerateBodyReferenceGlbInput,
): BodyReferenceGenerationSourceMode {
  return input.generationSourceMode ?? "v1-approved-contour";
}

function createCanonicalBodyProfileMesh(args: {
  canonicalBodyProfile: CanonicalBodyProfile;
  totalHeightMm: number;
  color: string;
}): THREE.Mesh {
  const lathePoints = args.canonicalBodyProfile.samples
    .map((sample) => new THREE.Vector2(
      Math.max(0.5, sample.radiusMm),
      overallYToBottomAnchoredModelY(args.totalHeightMm, sample.yMm),
    ))
    .sort((left, right) => right.y - left.y);
  const bottomY = lathePoints[lathePoints.length - 1]?.y ?? 0;
  lathePoints.push(new THREE.Vector2(0, bottomY));

  const geometry = new THREE.LatheGeometry(lathePoints, 96);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    makeStandardMaterial(args.color, { metalness: 0.18, roughness: 0.72 }),
  );
  mesh.name = "body_mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createV2MirroredBodyMesh(args: {
  source: BodyReferenceV2GenerationSource;
  color: string;
}): {
  mesh: THREE.Mesh;
  mirroredProfile: BodyReferenceV2MirroredProfile;
} {
  const mirroredProfile = buildBodyReferenceV2MirroredProfile(args.source);
  const lathePoints = mirroredProfile.samples
    .map((sample) => new THREE.Vector2(
      Math.max(0.5, sample.radiusMm),
      round2(mirroredProfile.bodyHeightMm - sample.yMm),
    ))
    .sort((left, right) => right.y - left.y);
  const bottomY = lathePoints[lathePoints.length - 1]?.y ?? 0;
  lathePoints.push(new THREE.Vector2(0, bottomY));

  const geometry = new THREE.LatheGeometry(lathePoints, 96);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    makeStandardMaterial(args.color, { metalness: 0.18, roughness: 0.72 }),
  );
  mesh.name = "body_mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, mirroredProfile };
}

function buildGeneratedBodyMeshBounds(mesh: THREE.Object3D): GeneratedBodyReferenceMeshBounds | null {
  const bounds = new THREE.Box3().setFromObject(mesh);
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  return {
    minMm: {
      x: round2(bounds.min.x),
      y: round2(bounds.min.y),
      z: round2(bounds.min.z),
    },
    maxMm: {
      x: round2(bounds.max.x),
      y: round2(bounds.max.y),
      z: round2(bounds.max.z),
    },
    sizeMm: {
      x: round2(size.x),
      y: round2(size.y),
      z: round2(size.z),
    },
  };
}

function buildV1BodyReferenceScene(input: GenerateBodyReferenceGlbInput): {
  scene: THREE.Scene;
  meshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
} {
  if (!input.canonicalBodyProfile || !input.canonicalDimensionCalibration) {
    throw new Error("Approved BODY REFERENCE contour, canonical body profile, and calibration are required for v1 generation.");
  }
  const scene = new THREE.Scene();
  scene.name = "reviewed_body_reference_generated";
  const bodyMesh = createCanonicalBodyProfileMesh({
    canonicalBodyProfile: input.canonicalBodyProfile,
    totalHeightMm: input.canonicalDimensionCalibration.totalHeightMm,
    color: input.bodyColorHex ?? "#b0b8c4",
  });
  scene.add(bodyMesh);
  return {
    scene,
    meshNames: ["body_mesh"],
    bodyMeshBounds: buildGeneratedBodyMeshBounds(bodyMesh),
  };
}

function buildV2BodyReferenceScene(args: {
  source: BodyReferenceV2GenerationSource;
  bodyColorHex?: string | null;
}): {
  scene: THREE.Scene;
  meshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
  mirroredProfile: BodyReferenceV2MirroredProfile;
} {
  const scene = new THREE.Scene();
  scene.name = "reviewed_body_reference_v2_generated";
  const builtMesh = createV2MirroredBodyMesh({
    source: args.source,
    color: args.bodyColorHex ?? "#b0b8c4",
  });
  scene.add(builtMesh.mesh);
  return {
    scene,
    meshNames: ["body_mesh"],
    bodyMeshBounds: buildGeneratedBodyMeshBounds(builtMesh.mesh),
    mirroredProfile: builtMesh.mirroredProfile,
  };
}

function resolveV1BodyHeightAuthority(args: {
  input: GenerateBodyReferenceGlbInput;
  bodyHeightMm: number;
  sourceBoundsHeightMm?: number;
  generatedBodyBoundsHeightMm?: number;
}) {
  const calibration = args.input.canonicalDimensionCalibration!;
  const mmPerSourceUnit =
    calibration.photoToFrontTransform.type === "similarity" &&
    typeof calibration.photoToFrontTransform.matrix[0] === "number" &&
    Number.isFinite(calibration.photoToFrontTransform.matrix[0]) &&
    calibration.photoToFrontTransform.matrix[0] > 0
      ? calibration.photoToFrontTransform.matrix[0]
      : undefined;
  const sourceDiameterUnits = mmPerSourceUnit
    ? calibration.wrapDiameterMm / mmPerSourceUnit
    : undefined;
  const sourceContourHeightUnits = mmPerSourceUnit
    ? args.bodyHeightMm / mmPerSourceUnit
    : undefined;
  return resolveBodyHeightAuthority({
    ...(args.input.bodyHeightAuthorityInput ?? {}),
    diameterAuthorityKind: "diameter-primary",
    diameterAuthorityValueMm: calibration.wrapDiameterMm,
    diameterAuthoritySourceField: "canonicalDimensionCalibration.wrapDiameterMm",
    sourceDiameterUnits,
    sourceContourHeightUnits,
    mmPerSourceUnit,
    uniformScaleApplied: calibration.photoToFrontTransform.type === "similarity",
    derivedBodyHeightMm: args.bodyHeightMm,
    svgPhysicalMmTrusted: false,
    svgToPhotoTransformPresent: calibration.photoToFrontTransform.type === "similarity",
    canonicalBodyHeightMm: args.bodyHeightMm,
    bodyTopFromOverallMm: calibration.lidBodyLineMm,
    bodyBottomFromOverallMm: calibration.bodyBottomMm,
    templateDimensionsHeightMm: calibration.totalHeightMm,
    printableHeightMm: calibration.printableSurfaceContract?.printableHeightMm,
    approvedSvgBoundsHeightMm: args.sourceBoundsHeightMm,
    approvedSvgMarkedPhysicalMm: false,
    generatedBodyBoundsHeightMm: args.generatedBodyBoundsHeightMm,
    diameterAuthority: "canonicalDimensionCalibration.wrapDiameterMm",
    radialScaleSource: "canonicalDimensionCalibration.wrapDiameterMm",
    yScaleSource: "canonicalDimensionCalibration.photoToFrontTransform.similarityScale",
    sourceFunction: "buildV1BodyReferenceBodyGeometryContract",
  });
}

function resolveV2BodyHeightAuthority(args: {
  input: GenerateBodyReferenceGlbInput;
  v2Source: BodyReferenceV2GenerationSource;
  v2MirroredProfile: BodyReferenceV2MirroredProfile;
  generatedBodyBoundsHeightMm?: number;
}) {
  const scaleCalibration = args.v2Source.scaleCalibration;
  const sourceDiameterUnits =
    args.v2Source.mmPerPx > 0
      ? args.v2Source.wrapDiameterMm / args.v2Source.mmPerPx
      : undefined;
  const sourceContourHeightUnits = args.v2MirroredProfile.maxYPx - args.v2MirroredProfile.minYPx;
  return resolveBodyHeightAuthority({
    ...(args.input.bodyHeightAuthorityInput ?? {}),
    diameterAuthorityKind: "diameter-primary",
    diameterAuthorityValueMm: args.v2Source.wrapDiameterMm,
    diameterAuthoritySourceField: "bodyReferenceV2.scaleCalibration.lookupDiameterMm",
    sourceDiameterUnits,
    sourceContourHeightUnits,
    mmPerSourceUnit: args.v2Source.mmPerPx,
    uniformScaleApplied: true,
    derivedBodyHeightMm: args.v2MirroredProfile.bodyHeightMm,
    svgPhysicalMmTrusted: false,
    svgToPhotoTransformPresent: true,
    lookupBodyHeightMm: scaleCalibration.lookupBodyHeightMm,
    lookupBodyHeightSource: scaleCalibration.lookupBodyHeightMm
      ? (scaleCalibration.lookupHeightIgnoredForScale ? "usable-height" : "unknown")
      : undefined,
    lookupFullProductHeightMm: scaleCalibration.lookupFullProductHeightMm,
    templateDimensionsPrintHeightMm: scaleCalibration.expectedBodyHeightMm,
    v2ExpectedBodyHeightMm: scaleCalibration.expectedBodyHeightMm,
    v2ProfileBoundsHeightMm: args.v2MirroredProfile.bodyHeightMm,
    generatedBodyBoundsHeightMm: args.generatedBodyBoundsHeightMm,
    diameterAuthority: "bodyReferenceV2.scaleCalibration.lookupDiameterMm",
    radialScaleSource: "lookup-diameter",
    yScaleSource: "bodyReferenceV2.mmPerPx",
    sourceFunction: "buildV2BodyReferenceBodyGeometryContract",
  });
}

async function writeReviewedBodyReferenceGlb(
  fileName: string,
  scene: THREE.Scene,
): Promise<{
  glbPath: string;
  glbAbsolutePath: string;
  glbHash: string;
  generatedAt: string;
}> {
  const arrayBuffer = await exportSceneToGlb(scene);
  return {
    glbPath: await writeGeneratedModelGlb(fileName, arrayBuffer),
    glbAbsolutePath: getGeneratedModelWriteAbsolutePath(fileName),
    glbHash: hashArrayBufferSha256Node(arrayBuffer),
    generatedAt: new Date().toISOString(),
  };
}

function buildV1BodyReferenceBodyGeometryContract(args: {
  input: GenerateBodyReferenceGlbInput;
  sourceHash: string;
  generatedGlb: {
    glbPath: string;
    glbHash: string;
    generatedAt: string;
  };
  meshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
}): BodyGeometryContract {
  const calibration = args.input.canonicalDimensionCalibration!;
  const bodyOutline = args.input.bodyOutline!;
  const sourceViewport = bodyOutline.sourceContourViewport ?? null;
  const bodyHeightMm = round2(
    calibration.bodyBottomMm -
    calibration.lidBodyLineMm,
  );
  const svgQuality = buildBodyReferenceSvgQualityReportFromOutline({
    outline: bodyOutline,
    sourceHash: args.sourceHash,
    label: args.input.templateName ?? args.input.matchedProfileId ?? undefined,
  });
  const bodyHeightAuthority = resolveV1BodyHeightAuthority({
    input: args.input,
    bodyHeightMm,
    sourceBoundsHeightMm: svgQuality.bounds?.height,
    generatedBodyBoundsHeightMm: args.bodyMeshBounds?.sizeMm.y,
  });

  return updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: args.input.renderMode ?? "body-cutout-qa",
    source: {
      type: "approved-svg",
      filename: `${args.input.templateName ?? args.input.matchedProfileId ?? "body-reference"}.approved.svg`,
      hash: args.sourceHash,
      widthPx: sourceViewport?.width ? round2(sourceViewport.width) : undefined,
      heightPx: sourceViewport?.height ? round2(sourceViewport.height) : undefined,
      viewBox: sourceViewport
        ? `${round2(sourceViewport.minX)} ${round2(sourceViewport.minY)} ${round2(sourceViewport.width)} ${round2(sourceViewport.height)}`
        : undefined,
      detectedBodyOnly:
        args.input.bodyOutlineSourceMode === "body-only" ||
        bodyOutline.sourceContourMode === "body-only" ||
        (args.input.renderMode ?? "body-cutout-qa") === "body-cutout-qa",
      contourFrame: bodyOutline.contourFrame
        ? {
            ...bodyOutline.contourFrame,
            glbInputBounds: bodyOutline.contourFrame.glbInputBounds ?? svgQuality.bounds,
            canonicalInputBounds: bodyOutline.contourFrame.canonicalInputBounds ?? svgQuality.bounds,
          }
        : undefined,
    },
    glb: {
      path: args.generatedGlb.glbPath,
      hash: args.generatedGlb.glbHash,
      sourceHash: args.sourceHash,
      generatedAt: args.generatedGlb.generatedAt,
      freshRelativeToSource: true,
    },
    meshes: {
      names: args.meshNames,
      bodyMeshNames: ["body_mesh"],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: args.bodyMeshBounds
        ? {
            width: args.bodyMeshBounds.sizeMm.x,
            height: args.bodyMeshBounds.sizeMm.y,
            depth: args.bodyMeshBounds.sizeMm.z,
          }
        : undefined,
      bodyBoundsUnits: args.bodyMeshBounds ? "mm" : undefined,
      bodyHeightAuthority,
      wrapDiameterMm: round2(calibration.wrapDiameterMm),
      wrapWidthMm: round2(calibration.wrapWidthMm),
      frontVisibleWidthMm: round2(calibration.frontVisibleWidthMm),
      expectedBodyWidthMm: round2(calibration.frontVisibleWidthMm),
      expectedBodyHeightMm: bodyHeightMm,
      printableTopMm: calibration.printableSurfaceContract?.printableTopMm,
      printableBottomMm: calibration.printableSurfaceContract?.printableBottomMm,
      scaleSource: args.bodyMeshBounds ? "mesh-bounds" : "physical-wrap",
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
    svgQuality,
  });
}

function buildV2BodyReferenceBodyGeometryContract(args: {
  input: GenerateBodyReferenceGlbInput;
  v2Source: BodyReferenceV2GenerationSource;
  v2MirroredProfile: BodyReferenceV2MirroredProfile;
  sourceHash: string;
  generatedGlb: {
    glbPath: string;
    glbHash: string;
    generatedAt: string;
  };
  meshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
}): BodyGeometryContract {
  const diameterPx = round2(args.v2Source.wrapDiameterMm / args.v2Source.mmPerPx);
  const bodyHeightPx = round2(args.v2MirroredProfile.maxYPx - args.v2MirroredProfile.minYPx);
  const referenceLayersExcluded = [...new Set(
    (args.input.bodyReferenceV2Draft?.layers ?? [])
      .filter((layer) => layer.referenceOnly === true)
      .map((layer) => layer.kind),
  )].sort((left, right) => left.localeCompare(right));
  const nonBodyGenerationExclusions = [
    "product-appearance-layers",
    "artwork-placements",
    "engraving-overlay-preview",
  ].sort((left, right) => left.localeCompare(right));
  const bodyHeightAuthority = resolveV2BodyHeightAuthority({
    input: args.input,
    v2Source: args.v2Source,
    v2MirroredProfile: args.v2MirroredProfile,
    generatedBodyBoundsHeightMm: args.bodyMeshBounds?.sizeMm.y,
  });

  return updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: args.input.renderMode ?? "body-cutout-qa",
    source: {
      type: "body-reference-v2",
      filename: `${args.input.templateName ?? args.input.matchedProfileId ?? "body-reference"}.body-reference-v2.json`,
      hash: args.sourceHash,
      widthPx: diameterPx,
      heightPx: bodyHeightPx,
      viewBox: `${round2(-diameterPx / 2)} 0 ${diameterPx} ${bodyHeightPx}`,
      detectedBodyOnly: true,
      centerlineCaptured: true,
      leftBodyOutlineCaptured: true,
      mirroredBodyGenerated: true,
      blockedRegionCount: args.v2Source.blockedRegionCount,
      lookupDimensionAuthorityStatus: args.v2Source.scaleCalibration.lookupScaleStatus ?? "unknown",
      referenceLayersExcluded,
      nonBodyGenerationExclusions,
      fallbackGenerationModeAvailable: true,
      generationSourceMode: "v2-mirrored-profile",
    },
    glb: {
      path: args.generatedGlb.glbPath,
      hash: args.generatedGlb.glbHash,
      sourceHash: args.sourceHash,
      generatedAt: args.generatedGlb.generatedAt,
      freshRelativeToSource: true,
    },
    meshes: {
      names: args.meshNames,
      bodyMeshNames: ["body_mesh"],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: args.bodyMeshBounds
        ? {
            width: args.bodyMeshBounds.sizeMm.x,
            height: args.bodyMeshBounds.sizeMm.y,
            depth: args.bodyMeshBounds.sizeMm.z,
          }
        : undefined,
      bodyBoundsUnits: args.bodyMeshBounds ? "mm" : undefined,
      bodyHeightAuthority,
      wrapDiameterMm: round2(args.v2Source.wrapDiameterMm),
      wrapWidthMm: round2(args.v2Source.wrapWidthMm),
      frontVisibleWidthMm: round2(args.v2Source.wrapDiameterMm),
      expectedBodyWidthMm: round2(args.v2Source.wrapDiameterMm),
      expectedBodyHeightMm: round2(args.v2MirroredProfile.bodyHeightMm),
      printableTopMm: 0,
      printableBottomMm: round2(args.v2MirroredProfile.bodyHeightMm),
      scaleSource: "lookup-diameter",
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });
}

export async function generateBodyReferenceGlb(
  input: GenerateBodyReferenceGlbInput,
): Promise<GeneratedBodyReferenceGlbResult> {
  const generationSourceMode = resolveBodyReferenceGenerationSourceMode(input);

  if (generationSourceMode === "v2-mirrored-profile") {
    const v2Source = input.bodyReferenceV2Draft
      ? buildBodyReferenceV2GenerationSource(input.bodyReferenceV2Draft)
      : null;
    if (!v2Source) {
      throw new Error("BODY REFERENCE v2 mirrored profile is not ready for BODY CUTOUT QA generation.");
    }

    const sourceHashPayload = v2Source.sourceHashPayload;
    const sourceHash = hashJsonSha256Node(sourceHashPayload);
    const fileStem = buildBodyReferenceFileStem(input, sourceHash);
    const generatedSourceSignature = stableStringifyForHash(sourceHashPayload);
    const built = buildV2BodyReferenceScene({
      source: v2Source,
      bodyColorHex: input.bodyColorHex ?? null,
    });
    const generatedGlb = await writeReviewedBodyReferenceGlb(`${fileStem}.glb`, built.scene);
    const bodyGeometryContract = buildV2BodyReferenceBodyGeometryContract({
      input,
      v2Source,
      v2MirroredProfile: built.mirroredProfile,
      sourceHash,
      generatedGlb,
      meshNames: built.meshNames,
      bodyMeshBounds: built.bodyMeshBounds,
    });
    const auditArtifact = await writeBodyGeometryAuditArtifact({
      glbAbsolutePath: generatedGlb.glbAbsolutePath,
      contract: bodyGeometryContract,
    });

    return {
      glbPath: generatedGlb.glbPath,
      auditJsonPath: auditArtifact.auditAbsolutePath,
      fitDebug: null,
      modelStatus: "generated-reviewed-model",
      renderMode: input.renderMode ?? "body-cutout-qa",
      generatedSourceSignature,
      modelSourceLabel: "Generated from BODY REFERENCE v2 mirrored profile",
      bodyColorHex: input.bodyColorHex ?? null,
      rimColorHex: input.rimColorHex ?? null,
      meshNames: built.meshNames,
      fallbackMeshNames: [],
      bodyMeshBounds: built.bodyMeshBounds,
      bodyGeometryContract,
    };
  }

  if (!input.bodyOutline || !input.canonicalBodyProfile || !input.canonicalDimensionCalibration) {
    throw new Error("Approved BODY REFERENCE outline is required before generating a reviewed GLB.");
  }

  const sourceHashPayload = buildBodyReferenceGlbSourcePayload({
    bodyOutline: input.bodyOutline,
    canonicalBodyProfile: input.canonicalBodyProfile,
    canonicalDimensionCalibration: input.canonicalDimensionCalibration,
  });
  const sourceHash = hashJsonSha256Node(sourceHashPayload);
  const fileStem = buildBodyReferenceFileStem(input, sourceHash);
  const generatedSourceSignature = stableStringifyForHash(sourceHashPayload);
  const built = buildV1BodyReferenceScene(input);
  const generatedGlb = await writeReviewedBodyReferenceGlb(`${fileStem}.glb`, built.scene);
  const bodyGeometryContract = buildV1BodyReferenceBodyGeometryContract({
    input,
    sourceHash,
    generatedGlb,
    meshNames: built.meshNames,
    bodyMeshBounds: built.bodyMeshBounds,
  });
  const auditArtifact = await writeBodyGeometryAuditArtifact({
    glbAbsolutePath: generatedGlb.glbAbsolutePath,
    contract: bodyGeometryContract,
  });

  return {
    glbPath: generatedGlb.glbPath,
    auditJsonPath: auditArtifact.auditAbsolutePath,
    fitDebug: null,
    modelStatus: "generated-reviewed-model",
    renderMode: input.renderMode ?? "body-cutout-qa",
    generatedSourceSignature,
    modelSourceLabel: "Generated from accepted BODY REFERENCE cutout",
    bodyColorHex: input.bodyColorHex ?? null,
    rimColorHex: input.rimColorHex ?? null,
    meshNames: built.meshNames,
    fallbackMeshNames: [],
    bodyMeshBounds: built.bodyMeshBounds,
    bodyGeometryContract,
  };
}
