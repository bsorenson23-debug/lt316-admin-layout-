import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { getTumblerProfileById, type TumblerProfile } from "../../data/tumblerProfiles.ts";
import {
  resolveBodyReferenceTopBandArtifactGuard,
  resolveCompactBodyReferenceFallbackTopBand,
} from "../../lib/bodyReferenceTopBandGuard.ts";
import {
  getGeneratedModelWriteAbsolutePath,
  writeGeneratedModelGlb,
} from "../models/generatedModelStorage.ts";
import { writeBodyGeometryAuditArtifact } from "../models/bodyGeometryAuditArtifact.ts";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  CanonicalHandleProfile,
  EditableBodyOutline,
  EditableBodyOutlinePoint,
} from "../../types/productTemplate.ts";
import {
  resolveBodyReferenceVisualLikeness,
  type BodyReferenceVisualLikenessReport,
} from "../../lib/bodyReferenceVisualLikeness.ts";
import {
  buildBodyReferenceSilhouetteAudit,
  buildBodyReferenceSilhouetteAuditSvg,
  buildCanonicalBodyLatheContour,
  type BodyReferenceSilhouetteAuditReport,
} from "../../lib/bodyReferenceSilhouetteAudit.ts";
import {
  buildBodyReferenceGlbSourceSignature,
  type BodyReferenceGlbRenderMode,
} from "../../lib/bodyReferenceGlbSource.ts";
import {
  buildBodyGeometrySourceHashPayload,
  createEmptyBodyGeometryContract,
  detectAccessoryMeshes,
  detectFallbackMeshes,
  updateContractValidation,
  type BodyGeometryContract,
} from "../../lib/bodyGeometryContract.ts";
import { buildBodyReferenceSvgQualityReportFromOutline } from "../../lib/bodyReferenceSvgQuality.ts";
import { hashJsonSha256Node, hashArrayBufferSha256Node } from "../../lib/hashSha256.node.ts";
import type {
  TumblerItemLookupFitDebug,
  TumblerItemLookupFitProfilePoint,
} from "../../types/tumblerItemLookup.ts";
import { isFiniteNumber } from "../../utils/guards.ts";
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

type ModelCoordinateOrigin = "center" | "bottom";

type CenterRun = {
  y: number;
  left: number;
  right: number;
  width: number;
  sampleColor: Rgb;
  whole: RowBounds;
};

type StanleySilhouetteFit = {
  bodyProfile: Array<{ yMm: number; radiusMm: number }>;
  bodyTopYmm: number;
  bodyBottomYmm: number;
  rimTopYmm: number;
  rimBottomYmm: number;
  rimHeightMm: number;
  rimRadiusMm: number;
  bodyReferenceFallbackAssemblyRadiusMm?: number;
  bodyReferenceRadialFit?: BodyReferenceGlbRadialFit;
  bodyReferenceFallbackTopGeometryMode?: "artifact-guard" | "compact-preview-body-only" | "omitted" | null;
  modelCoordinateOrigin?: ModelCoordinateOrigin;
  bodyColorHex: string;
  rimColorHex: string;
  fitDebug?: TumblerItemLookupFitDebug | null;
};

type StanleyCandidateFit = StanleySilhouetteFit & {
  fitScore: number;
};

export type GeneratedTumblerGlbResult = {
  glbPath: string;
  auditJsonPath?: string | null;
  fitDebug: TumblerItemLookupFitDebug | null;
  bodyColorHex: string | null;
  rimColorHex: string | null;
};

type EnsureGeneratedTumblerGlbInput = {
  profileId?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  [key: string]: unknown;
};

export type GenerateBodyReferenceGlbInput = {
  renderMode?: BodyReferenceGlbRenderMode | null;
  templateName?: string | null;
  matchedProfileId?: string | null;
  bodyOutlineSourceMode?: EditableBodyOutline["sourceContourMode"] | null;
  bodyOutline?: EditableBodyOutline | null;
  canonicalBodyProfile: CanonicalBodyProfile;
  canonicalDimensionCalibration: CanonicalDimensionCalibration;
  canonicalHandleProfile?: CanonicalHandleProfile | null;
  lidProfile?: EditableBodyOutline | null;
  silverProfile?: EditableBodyOutline | null;
  bodyColorHex?: string | null;
  lidColorHex?: string | null;
  rimColorHex?: string | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  topOuterDiameterMm?: number | null;
};

export type GeneratedBodyReferenceMeshBounds = {
  minMm: { x: number; y: number; z: number };
  maxMm: { x: number; y: number; z: number };
  sizeMm: { x: number; y: number; z: number };
};

export type GeneratedBodyReferenceGlbResult = GeneratedTumblerGlbResult & {
  modelStatus: "generated-reviewed-model";
  renderMode: BodyReferenceGlbRenderMode;
  generatedSourceSignature: string;
  modelSourceLabel: string;
  bodyGeometrySource: string;
  lidGeometrySource: string;
  ringGeometrySource: string;
  meshNames: string[];
  fallbackMeshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
  visualLikeness: BodyReferenceVisualLikenessReport;
  silhouetteAudit: BodyReferenceSilhouetteAuditReport | null;
  bodyGeometryContract: BodyGeometryContract;
  auditJsonPath: string | null;
};

export type BodyReferenceGlbRadialFit = {
  sourceMaxRadiusMm: number;
  targetMaxRadiusMm: number;
  scale: number;
  normalized: boolean;
  toleranceMm: number;
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

export function overallYToBottomAnchoredModelY(
  totalHeightMm: number,
  yOverallMm: number,
): number {
  return round2(Math.max(1, totalHeightMm) - yOverallMm);
}

function overallYToModelY(
  totalHeightMm: number,
  yOverallMm: number,
  origin: ModelCoordinateOrigin,
): number {
  return origin === "bottom"
    ? overallYToBottomAnchoredModelY(totalHeightMm, yOverallMm)
    : round2((Math.max(1, totalHeightMm) / 2) - yOverallMm);
}

function modelYToOverallY(
  totalHeightMm: number,
  modelYmm: number,
  origin: ModelCoordinateOrigin,
): number {
  return origin === "bottom"
    ? round2(Math.max(1, totalHeightMm) - modelYmm)
    : round2((Math.max(1, totalHeightMm) / 2) - modelYmm);
}

function getFitModelCoordinateOrigin(fit: StanleySilhouetteFit): ModelCoordinateOrigin {
  return fit.modelCoordinateOrigin ?? "center";
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

function slugifyFileStem(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "body-reference";
}

function buildBodyReferenceFileStem(input: GenerateBodyReferenceGlbInput): string {
  const hash = createHash("sha1")
    .update(JSON.stringify({
      bodyReferenceGlbFitVersion: 9,
      renderMode: input.renderMode ?? "hybrid-preview",
      profile: input.matchedProfileId ?? null,
      bodyOutlineSourceMode: input.bodyOutlineSourceMode ?? null,
      totalHeightMm: input.canonicalDimensionCalibration.totalHeightMm,
      lidBodyLineMm: input.canonicalDimensionCalibration.lidBodyLineMm,
      bodyBottomMm: input.canonicalDimensionCalibration.bodyBottomMm,
      wrapDiameterMm: input.canonicalDimensionCalibration.wrapDiameterMm,
      lidSeamFromOverallMm: input.lidSeamFromOverallMm ?? null,
      silverBandBottomFromOverallMm: input.silverBandBottomFromOverallMm ?? null,
      topOuterDiameterMm: input.topOuterDiameterMm ?? null,
      bodyOutline:
        input.bodyOutline?.directContour?.map((point) => [round2(point.x), round2(point.y)]) ??
        input.bodyOutline?.points?.map((point) => [round2(point.x), round2(point.y)]) ??
        null,
      bodyColorHex: input.bodyColorHex ?? null,
      lidColorHex: input.lidColorHex ?? null,
      rimColorHex: input.rimColorHex ?? null,
      samples: input.canonicalBodyProfile.samples.map((sample) => [round2(sample.yMm), round2(sample.radiusMm)]),
      lidProfile: input.lidProfile?.directContour?.map((point) => [round2(point.x), round2(point.y)]) ?? null,
      silverProfile: input.silverProfile?.directContour?.map((point) => [round2(point.x), round2(point.y)]) ?? null,
    }))
    .digest("hex")
    .slice(0, 12);
  return `${slugifyFileStem(input.templateName ?? input.matchedProfileId ?? "body-reference")}-cutout-${hash}`;
}

type OutlineContourPointMm = {
  x: number;
  y: number;
};

function buildClosedContourFromOutlinePoints(
  points: EditableBodyOutlinePoint[],
): OutlineContourPointMm[] | null {
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.y - right.y);
  if (sorted.length < 2) return null;
  const right = sorted.map((point) => ({ x: round2(point.x), y: round2(point.y) }));
  const left = [...sorted]
    .reverse()
    .map((point) => ({ x: round2(-point.x), y: round2(point.y) }));
  return [...right, ...left];
}

function resolveOutlineHalfProfilePointsMm(
  outline: EditableBodyOutline | null | undefined,
): Array<{ x: number; y: number }> | null {
  const sorted = [...(outline?.points ?? [])]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: round2(Math.abs(point.x)), y: round2(point.y) }))
    .sort((left, right) => left.y - right.y);
  if (sorted.length < 2) {
    return null;
  }
  return sorted;
}

function resolveOutlineContourMm(
  outline: EditableBodyOutline | null | undefined,
): OutlineContourPointMm[] | null {
  if (outline?.directContour && outline.directContour.length >= 3) {
    return outline.directContour
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => ({ x: round2(point.x), y: round2(point.y) }));
  }
  if (outline?.points && outline.points.length >= 2) {
    return buildClosedContourFromOutlinePoints(outline.points);
  }
  return null;
}

function getContourBoundsMm(
  contour: OutlineContourPointMm[],
): { minY: number; maxY: number } | null {
  if (contour.length < 2) return null;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of contour) {
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) {
    return null;
  }
  return { minY: round2(minY), maxY: round2(maxY) };
}

function getContourIntersectionsAtYMm(
  contour: OutlineContourPointMm[],
  yMm: number,
): number[] {
  if (contour.length < 2) return [];
  const xs: number[] = [];
  for (let index = 0; index < contour.length; index += 1) {
    const current = contour[index];
    const next = contour[(index + 1) % contour.length];
    if (!current || !next) continue;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    if (yMm < minY || yMm > maxY) continue;
    if (Math.abs(next.y - current.y) < 0.0001) {
      xs.push(current.x, next.x);
      continue;
    }
    const t = (yMm - current.y) / (next.y - current.y);
    if (t < 0 || t > 1) continue;
    xs.push(round2(current.x + ((next.x - current.x) * t)));
  }
  return xs;
}

function sampleHalfWidthAtYMm(
  contour: OutlineContourPointMm[],
  yMm: number,
): number {
  const intersections = getContourIntersectionsAtYMm(contour, yMm)
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.abs(value));
  if (intersections.length > 0) {
    return round2(Math.max(...intersections));
  }
  const nearest = contour.reduce<OutlineContourPointMm | null>((best, point) => {
    if (!best) return point;
    return Math.abs(point.y - yMm) < Math.abs(best.y - yMm) ? point : best;
  }, null);
  return round2(Math.abs(nearest?.x ?? 0));
}

function sampleHalfWidthFromProfilePointsAtYMm(
  points: Array<{ x: number; y: number }>,
  yMm: number,
): number {
  if (points.length === 0) {
    return 0;
  }
  if (points.length === 1) {
    return round2(Math.abs(points[0]?.x ?? 0));
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) continue;
    if (Math.abs(yMm - current.y) < 0.0001) {
      return round2(Math.abs(current.x));
    }
    if (yMm < current.y || yMm > next.y) {
      continue;
    }
    const span = next.y - current.y;
    if (Math.abs(span) < 0.0001) {
      return round2(Math.abs(next.x));
    }
    const t = clamp((yMm - current.y) / span, 0, 1);
    return round2(Math.abs(current.x + ((next.x - current.x) * t)));
  }
  const nearest = points.reduce<{ x: number; y: number } | null>((best, point) => {
    if (!best) return point;
    return Math.abs(point.y - yMm) < Math.abs(best.y - yMm) ? point : best;
  }, null);
  return round2(Math.abs(nearest?.x ?? 0));
}

function buildOutlineLatheContour(args: {
  outline: EditableBodyOutline | null | undefined;
  totalHeightMm: number;
  sampleCount?: number;
  minYOverallMm?: number | null;
  maxYOverallMm?: number | null;
  modelCoordinateOrigin?: ModelCoordinateOrigin;
}): Array<{ radiusMm: number; yMm: number }> | null {
  const halfProfilePoints = resolveOutlineHalfProfilePointsMm(args.outline);
  if (halfProfilePoints) {
    const pointMinY = halfProfilePoints[0]?.y ?? 0;
    const pointMaxY = halfProfilePoints[halfProfilePoints.length - 1]?.y ?? 0;
    const minYOverallMm = round2(Math.max(pointMinY, args.minYOverallMm ?? pointMinY));
    const maxYOverallMm = round2(Math.min(pointMaxY, args.maxYOverallMm ?? pointMaxY));
    if (maxYOverallMm - minYOverallMm >= 0.5) {
      const totalHeightMm = Math.max(1, args.totalHeightMm);
      const origin = args.modelCoordinateOrigin ?? "center";
      const profileRowYs = Array.from(
        new Set(
          halfProfilePoints
            .map((point) => round2(point.y))
            .filter((yMm) => yMm >= minYOverallMm && yMm <= maxYOverallMm),
        ),
      ).sort((a, b) => a - b);
      const sampledYs =
        profileRowYs.length >= 12
          ? profileRowYs
          : (() => {
              const sampleCount = Math.max(24, args.sampleCount ?? 48);
              const ys: number[] = [];
              for (let index = 0; index < sampleCount; index += 1) {
                const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
                ys.push(round2(minYOverallMm + ((maxYOverallMm - minYOverallMm) * t)));
              }
              return ys;
            })();
      return sampledYs.map((yOverallMm) => ({
        radiusMm: round2(Math.max(0.8, sampleHalfWidthFromProfilePointsAtYMm(halfProfilePoints, yOverallMm))),
        yMm: overallYToModelY(totalHeightMm, yOverallMm, origin),
      }));
    }
  }
  const contour = resolveOutlineContourMm(args.outline);
  if (!contour) return null;
  const bounds = getContourBoundsMm(contour);
  if (!bounds) return null;
  const minYOverallMm = round2(Math.max(bounds.minY, args.minYOverallMm ?? bounds.minY));
  const maxYOverallMm = round2(Math.min(bounds.maxY, args.maxYOverallMm ?? bounds.maxY));
  if (maxYOverallMm - minYOverallMm < 0.5) {
    return null;
  }
  const totalHeightMm = Math.max(1, args.totalHeightMm);
  const origin = args.modelCoordinateOrigin ?? "center";
  const contourRowYs = Array.from(
    new Set(
      contour
        .map((point) => round2(point.y))
        .filter((yMm) => yMm >= minYOverallMm && yMm <= maxYOverallMm),
    ),
  ).sort((a, b) => a - b);
  const sampledYs =
    contourRowYs.length >= 8
      ? contourRowYs
      : (() => {
          const sampleCount = Math.max(8, args.sampleCount ?? 20);
          const ys: number[] = [];
          for (let index = 0; index < sampleCount; index += 1) {
            const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
            ys.push(round2(minYOverallMm + ((maxYOverallMm - minYOverallMm) * t)));
          }
          return ys;
        })();
  const latheContour: Array<{ radiusMm: number; yMm: number }> = [];
  for (const yOverallMm of sampledYs) {
    const radiusMm = Math.max(0.8, sampleHalfWidthAtYMm(contour, yOverallMm));
    latheContour.push({
      radiusMm: round2(radiusMm),
      yMm: overallYToModelY(totalHeightMm, yOverallMm, origin),
    });
  }
  return latheContour;
}

export function resolveBodyReferenceGlbRadialFit(args: {
  sourceRadiiMm: number[];
  wrapDiameterMm?: number | null;
}): BodyReferenceGlbRadialFit {
  const sourceRadii = args.sourceRadiiMm
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.max(0, value));
  const sourceMaxRadiusMm = round2(sourceRadii.length > 0 ? Math.max(...sourceRadii) : 0);
  const wrapRadiusMm =
    isFiniteNumber(args.wrapDiameterMm) && (args.wrapDiameterMm ?? 0) > 0
      ? round2((args.wrapDiameterMm ?? 0) / 2)
      : 0;
  const toleranceMm = round2(Math.max(0.25, wrapRadiusMm * 0.006));
  const shouldNormalize =
    sourceMaxRadiusMm > 0 &&
    wrapRadiusMm > 0 &&
    sourceMaxRadiusMm > wrapRadiusMm + toleranceMm;
  const targetMaxRadiusMm = shouldNormalize ? wrapRadiusMm : sourceMaxRadiusMm;
  const scale = shouldNormalize ? targetMaxRadiusMm / sourceMaxRadiusMm : 1;

  return {
    sourceMaxRadiusMm,
    targetMaxRadiusMm: round2(targetMaxRadiusMm),
    scale,
    normalized: shouldNormalize,
    toleranceMm,
  };
}

export function resolveBodyReferenceFallbackAssemblyRadius(args: {
  normalizedBodyRadiiMm: number[];
  wrapDiameterMm?: number | null;
}): number {
  const bodyRadii = args.normalizedBodyRadiiMm
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.max(0, value));
  const bodyMaxRadiusMm = bodyRadii.length > 0 ? Math.max(...bodyRadii) : 0;
  const wrapRadiusMm =
    isFiniteNumber(args.wrapDiameterMm) && (args.wrapDiameterMm ?? 0) > 0
      ? (args.wrapDiameterMm ?? 0) / 2
      : 0;
  const capRadiusMm = wrapRadiusMm > 0 ? wrapRadiusMm : bodyMaxRadiusMm;
  const assemblyRadiusMm = bodyMaxRadiusMm > 0
    ? Math.min(bodyMaxRadiusMm, capRadiusMm)
    : capRadiusMm;

  return round2(Math.max(1, assemblyRadiusMm));
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
  debugProfilePoints: TumblerItemLookupFitProfilePoint[];
} {
  const { profile, runs, fullTop, fullHeightPx, bodyTop, bodyBottom, centerX, referenceHalfWidthPx } = args;
  const mmPerPxY = profile.overallHeightMm / Math.max(1, fullHeightPx);
  const bodyRuns = runs.filter((run) => run.y >= bodyTop && run.y <= bodyBottom);
  const widths = smoothSeries(
    bodyRuns.map((run) => Math.max(1, run.whole.right - centerX)),
    2,
  );
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
    debugProfilePoints,
  };
}

async function fitStanleyIceFlow30FromImage(
  profile: TumblerProfile,
  imageUrl: string,
): Promise<StanleyCandidateFit | null> {
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

  const maxCenterWidth = percentile(runs.map((run) => run.width), 0.95);
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

  const bodyTop = silverSegment ? silverSegment.end + 1 : bodySegment.start;
  const bodyBottom = bodySegment.end;
  if (bodyBottom - bodyTop < fullHeightPx * 0.5) return null;

  const bodyRuns = runs.filter((run) => run.y >= bodyTop && run.y <= bodyBottom);

  const rimTop = silverSegment ? silverSegment.start : fullTop;
  const rimBottom = silverSegment ? silverSegment.end : Math.max(fullTop, bodyTop - 1);
  const rimRows = runs.filter((run) => run.y >= rimTop && run.y <= rimBottom);
  const rimHalfWidthPx = avg(rimRows.map((run) => Math.max(1, run.whole.right - centerX)));

  const profileFit = buildLatheProfileFromRows({
    profile,
    runs,
    fullTop,
    fullHeightPx,
    bodyTop,
    bodyBottom,
    centerX,
    referenceHalfWidthPx: rimHalfWidthPx > 0 ? rimHalfWidthPx : maxCenterWidth / 2,
  });

  const rimHeightMm = round2(Math.max(4, (rimBottom - rimTop + 1) * profileFit.mmPerPxY));
  const rimRadiusMm = round2(avg(rimRows.map((run) => (run.whole.width / 2) * profileFit.pxToMmX)) || profileFit.bodyProfile[0].radiusMm * 1.02);
  const rimColor = medianRgb(rimRows.map((run) => run.sampleColor), [185, 185, 185]);
  const overallTopYmm = profile.overallHeightMm / 2;
  const rimTopYmm = round2(overallTopYmm - (rimTop - fullTop) * profileFit.mmPerPxY);
  const rimBottomYmm = round2(overallTopYmm - (rimBottom - fullTop) * profileFit.mmPerPxY);
  const referenceBandCenterYPx = Math.round(bodyTop + ((bodyBottom - bodyTop) * 0.22));
  const referenceBandHeightPx = Math.max(12, Math.round((bodyBottom - bodyTop + 1) * 0.12));
  const referenceBandTopPx = Math.max(bodyTop, referenceBandCenterYPx - Math.floor(referenceBandHeightPx / 2));
  const referenceBandBottomPx = Math.min(bodyBottom, referenceBandTopPx + referenceBandHeightPx - 1);
  const centerOffsetScore = normalizeScore(1 - Math.abs(centerX - width / 2) / Math.max(1, width * 0.18));
  const portraitRatio = width / Math.max(1, height);
  const portraitScore = normalizeScore(1 - Math.abs(portraitRatio - 0.44) / 0.32);
  const bodyCoverage = (bodyBottom - bodyTop + 1) / Math.max(1, fullHeightPx);
  const bodyCoverageScore = normalizeScore(1 - Math.abs(bodyCoverage - 0.74) / 0.2);
  const symmetryScore = normalizeScore(avg(bodyRuns.map((run) => {
    const leftSpan = centerX - run.whole.left;
    const rightSpan = run.whole.right - centerX;
    const maxSpan = Math.max(1, Math.max(leftSpan, rightSpan));
    return 1 - Math.abs(leftSpan - rightSpan) / maxSpan;
  })));
  const topBodyRadius = bodyRuns[0] ? Math.max(1, bodyRuns[0].whole.right - centerX) : rimHalfWidthPx;
  const bottomBodyRadius = bodyRuns[bodyRuns.length - 1] ? Math.max(1, bodyRuns[bodyRuns.length - 1].whole.right - centerX) : topBodyRadius;
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

  const fitDebug: TumblerItemLookupFitDebug = {
    kind: "lathe-body-fit",
    sourceImageUrl: imageUrl,
    imageWidthPx: width,
    imageHeightPx: height,
    silhouetteBoundsPx: bounds,
    centerXPx: round2(centerX),
    fullTopPx: fullTop,
    fullBottomPx: fullBottom,
    bodyTopPx: bodyTop,
    bodyBottomPx: bodyBottom,
    rimTopPx: rimTop,
    rimBottomPx: rimBottom,
    referenceBandTopPx,
    referenceBandBottomPx,
    referenceBandCenterYPx,
    referenceBandWidthPx: round2(maxCenterWidth),
    maxCenterWidthPx: round2(maxCenterWidth),
    referenceHalfWidthPx: round2(rimHalfWidthPx > 0 ? rimHalfWidthPx : maxCenterWidth / 2),
    fitScore,
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

async function fitBestStanleyIceFlow30FromImages(
  profile: TumblerProfile,
  imageUrls: string[],
): Promise<StanleySilhouetteFit | null> {
  const seen = new Set<string>();
  const candidates = imageUrls.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, 12);

  let bestFit: StanleyCandidateFit | null = null;
  for (const imageUrl of candidates) {
    try {
      const fit = await fitStanleyIceFlow30FromImage(profile, imageUrl);
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
    "[generateTumblerModel] selected Stanley image:",
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
  } satisfies StanleySilhouetteFit;
}

function buildBodyReferenceFit(input: GenerateBodyReferenceGlbInput): StanleySilhouetteFit {
  const totalHeightMm = input.canonicalDimensionCalibration.totalHeightMm;
  const bodyTopFromOverallMm = input.canonicalDimensionCalibration.lidBodyLineMm;
  const bodyBottomFromOverallMm = input.canonicalDimensionCalibration.bodyBottomMm;
  const coordinateOrigin: ModelCoordinateOrigin = "bottom";
  const bodyOnlyTrace = input.bodyOutlineSourceMode === "body-only";
  const hasReviewedLidGeometry = Boolean(
    (input.lidProfile?.directContour && input.lidProfile.directContour.length >= 3) ||
    (input.lidProfile?.points && input.lidProfile.points.length >= 2),
  );
  const hasReviewedRingGeometry = Boolean(
    (input.silverProfile?.directContour && input.silverProfile.directContour.length >= 3) ||
    (input.silverProfile?.points && input.silverProfile.points.length >= 2),
  );
  const rawBodyProfile = [...input.canonicalBodyProfile.samples]
    .map((sample) => ({
      yMm: overallYToBottomAnchoredModelY(totalHeightMm, sample.yMm),
      radiusMm: round2(Math.max(1, sample.radiusMm)),
    }))
    .sort((left, right) => left.yMm - right.yMm);

  if (rawBodyProfile.length < 2) {
    throw new Error("Canonical body profile is missing enough samples to generate a GLB.");
  }

  const radialFit = resolveBodyReferenceGlbRadialFit({
    sourceRadiiMm: rawBodyProfile.map((point) => point.radiusMm),
    wrapDiameterMm: input.canonicalDimensionCalibration.wrapDiameterMm,
  });
  const normalizedBodyProfile = rawBodyProfile.map((point) => ({
    ...point,
    radiusMm: round2(point.radiusMm * radialFit.scale),
  }));
  const fallbackAssemblyRadiusMm = resolveBodyReferenceFallbackAssemblyRadius({
    normalizedBodyRadiiMm: normalizedBodyProfile.map((point) => point.radiusMm),
    wrapDiameterMm: input.canonicalDimensionCalibration.wrapDiameterMm,
  });

  const bodyTopYmm = overallYToBottomAnchoredModelY(totalHeightMm, bodyTopFromOverallMm);
  const bodyBottomYmm = overallYToBottomAnchoredModelY(totalHeightMm, bodyBottomFromOverallMm);
  const topBandArtifactGuard =
    !hasReviewedLidGeometry && !hasReviewedRingGeometry
      ? resolveBodyReferenceTopBandArtifactGuard({
          totalHeightMm,
          bodyTopFromOverallMm,
          bodyBottomFromOverallMm,
          wrapDiameterMm: input.canonicalDimensionCalibration.wrapDiameterMm,
          frontVisibleWidthMm: input.canonicalDimensionCalibration.frontVisibleWidthMm,
          lidSeamFromOverallMm: input.lidSeamFromOverallMm,
          silverBandBottomFromOverallMm: input.silverBandBottomFromOverallMm,
          printableTopOverrideMm: input.canonicalDimensionCalibration.printableSurfaceContract?.printableTopMm,
        })
      : null;
  const explicitLidSeamFromOverallMm = isFiniteNumber(input.lidSeamFromOverallMm)
    ? round2(input.lidSeamFromOverallMm ?? bodyTopFromOverallMm)
    : null;
  const explicitSilverBandBottomFromOverallMm =
    isFiniteNumber(input.silverBandBottomFromOverallMm) &&
    (input.silverBandBottomFromOverallMm ?? 0) > (explicitLidSeamFromOverallMm ?? bodyTopFromOverallMm) + 0.5
      ? round2(input.silverBandBottomFromOverallMm ?? bodyTopFromOverallMm)
      : null;
  const previewBodyOnlyTopBandFallback =
    !topBandArtifactGuard &&
    bodyOnlyTrace &&
    !hasReviewedLidGeometry &&
    !hasReviewedRingGeometry &&
    explicitLidSeamFromOverallMm == null &&
    explicitSilverBandBottomFromOverallMm == null
      ? resolveCompactBodyReferenceFallbackTopBand({
          totalHeightMm,
          bodyTopFromOverallMm,
          bodyBottomFromOverallMm,
        })
      : null;
  const resolvedTopBandFallback = topBandArtifactGuard ?? previewBodyOnlyTopBandFallback;
  const rimTopFromOverallMm =
    resolvedTopBandFallback?.lidSeamFromOverallMm ??
    (
      explicitLidSeamFromOverallMm != null
        ? explicitLidSeamFromOverallMm
        : bodyTopFromOverallMm
    );
  const rimBottomFromOverallMm =
    resolvedTopBandFallback?.silverBandBottomFromOverallMm ??
    (
      explicitSilverBandBottomFromOverallMm != null
        ? explicitSilverBandBottomFromOverallMm
        : null
    );
  const fallbackTopGeometryMode =
    topBandArtifactGuard
      ? "artifact-guard"
      : previewBodyOnlyTopBandFallback
        ? "compact-preview-body-only"
        : (
            bodyOnlyTrace &&
            !hasReviewedLidGeometry &&
            !hasReviewedRingGeometry &&
            explicitLidSeamFromOverallMm == null &&
            explicitSilverBandBottomFromOverallMm == null
          )
          ? "omitted"
          : null;

  return {
    bodyProfile: normalizedBodyProfile,
    bodyTopYmm,
    bodyBottomYmm,
    rimTopYmm: overallYToBottomAnchoredModelY(totalHeightMm, rimTopFromOverallMm),
    rimBottomYmm:
      rimBottomFromOverallMm != null
        ? overallYToBottomAnchoredModelY(totalHeightMm, rimBottomFromOverallMm)
        : bodyTopYmm,
    rimHeightMm:
      rimBottomFromOverallMm != null
        ? round2(Math.max(0, rimBottomFromOverallMm - rimTopFromOverallMm))
        : 0,
    rimRadiusMm: fallbackAssemblyRadiusMm,
    bodyReferenceFallbackAssemblyRadiusMm: fallbackAssemblyRadiusMm,
    bodyReferenceRadialFit: radialFit,
    bodyReferenceFallbackTopGeometryMode: fallbackTopGeometryMode,
    modelCoordinateOrigin: coordinateOrigin,
    bodyColorHex: input.bodyColorHex ?? "#d7d4df",
    rimColorHex: input.rimColorHex ?? "#b6b6b6",
    fitDebug: null,
  };
}

function createBodyMesh(fit: StanleySilhouetteFit): THREE.Mesh {
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
  ]
    .sort((left, right) => left.yMm - right.yMm)
    .filter((point, index, array) => {
      if (index === 0) return true;
      const prev = array[index - 1];
      return !(prev.radiusMm === point.radiusMm && prev.yMm === point.yMm);
    });
  const yValues = contour.map((point) => point.yMm);
  const bodyBottomYmm = round2(Math.min(...yValues));
  const bodyTopYmm = round2(Math.max(...yValues));

  const points = [
    new THREE.Vector2(0, bodyBottomYmm),
    ...contour.map((point) => new THREE.Vector2(point.radiusMm, point.yMm)),
    new THREE.Vector2(0, bodyTopYmm),
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

function createBodyOnlyMeshFromFit(args: {
  fit: StanleySilhouetteFit;
  bodyColorHex?: string | null;
}): THREE.Mesh | null {
  const orderedProfile = [...args.fit.bodyProfile]
    .map((point) => ({
      yMm: round2(point.yMm),
      radiusMm: round2(Math.max(1, point.radiusMm)),
    }))
    .sort((left, right) => left.yMm - right.yMm);
  if (orderedProfile.length < 2) {
    return null;
  }

  const bottomRadiusMm = orderedProfile[0]?.radiusMm ?? 1;
  const topRadiusMm = orderedProfile[orderedProfile.length - 1]?.radiusMm ?? bottomRadiusMm;
  const contour: Array<{ radiusMm: number; yMm: number }> = [
    { radiusMm: bottomRadiusMm, yMm: round2(args.fit.bodyBottomYmm) },
    ...orderedProfile,
    { radiusMm: topRadiusMm, yMm: round2(args.fit.bodyTopYmm) },
  ]
    .sort((left, right) => left.yMm - right.yMm)
    .filter((point, index, array) => {
      if (index === 0) return true;
      const previous = array[index - 1];
      return !(previous.radiusMm === point.radiusMm && previous.yMm === point.yMm);
    });
  const bottomYmm = contour[0]?.yMm ?? round2(args.fit.bodyBottomYmm);
  const topYmm = contour[contour.length - 1]?.yMm ?? round2(args.fit.bodyTopYmm);
  return createLatheMeshFromContour({
    name: "body_mesh",
    contour,
    bottomYmm,
    topYmm,
    material: makeStandardMaterial(args.bodyColorHex ?? args.fit.bodyColorHex, {
      metalness: 0.16,
      roughness: 0.72,
    }),
    closeBottom: true,
    closeTop: false,
  });
}

function createRimMesh(fit: StanleySilhouetteFit): THREE.Mesh {
  const orderedProfile = [...fit.bodyProfile]
    .map((point) => ({
      yMm: round2(point.yMm),
      radiusMm: round2(Math.max(1, point.radiusMm)),
    }))
    .sort((a, b) => a.yMm - b.yMm);
  const topBodyRadiusMm = orderedProfile[orderedProfile.length - 1]?.radiusMm ?? fit.rimRadiusMm;
  const fallbackAssemblyRadiusMm =
    isFiniteNumber(fit.bodyReferenceFallbackAssemblyRadiusMm) && (fit.bodyReferenceFallbackAssemblyRadiusMm ?? 0) > 0
      ? fit.bodyReferenceFallbackAssemblyRadiusMm ?? null
      : null;
  const outerRadiusMm = fallbackAssemblyRadiusMm != null
    ? round2(fallbackAssemblyRadiusMm)
    : round2(
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

function createLatheMeshFromContour(args: {
  name: string;
  contour: Array<{ radiusMm: number; yMm: number }>;
  material: THREE.MeshStandardMaterial;
  bottomYmm: number;
  topYmm: number;
  segments?: number;
  closeBottom?: boolean;
  closeTop?: boolean;
}): THREE.Mesh | null {
  const dedupedContour = args.contour
    .map((point) => ({
      radiusMm: round2(Math.max(0.8, point.radiusMm)),
      yMm: round2(point.yMm),
    }))
    .sort((left, right) => left.yMm - right.yMm)
    .filter((point, index, array) => {
      if (index === 0) return true;
      const previous = array[index - 1];
      return !(previous.radiusMm === point.radiusMm && previous.yMm === point.yMm);
    });
  if (dedupedContour.length < 2) {
    return null;
  }

  const points: THREE.Vector2[] = [];
  if (args.closeBottom !== false) {
    points.push(new THREE.Vector2(0, args.bottomYmm));
  }
  points.push(...dedupedContour.map((point) => new THREE.Vector2(point.radiusMm, point.yMm)));
  if (args.closeTop !== false) {
    points.push(new THREE.Vector2(0, args.topYmm));
  }
  const geometry = new THREE.LatheGeometry(points, args.segments ?? 96);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, args.material);
  mesh.name = args.name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createOutlineDrivenMesh(args: {
  outline: EditableBodyOutline | null | undefined;
  totalHeightMm: number;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  minYOverallMm?: number | null;
  maxYOverallMm?: number | null;
  modelCoordinateOrigin?: ModelCoordinateOrigin;
  closeBottom?: boolean;
  closeTop?: boolean;
}): THREE.Mesh | null {
  const contour = buildOutlineLatheContour({
    outline: args.outline,
    totalHeightMm: args.totalHeightMm,
    minYOverallMm: args.minYOverallMm,
    maxYOverallMm: args.maxYOverallMm,
    modelCoordinateOrigin: args.modelCoordinateOrigin,
  });
  if (!contour || contour.length < 2) {
    return null;
  }
  const yValues = contour.map((point) => point.yMm);
  const bottomYmm = round2(Math.min(...yValues));
  const topYmm = round2(Math.max(...yValues));
  return createLatheMeshFromContour({
    name: args.name,
    contour,
    bottomYmm,
    topYmm,
    material: makeStandardMaterial(args.color, {
      metalness: args.metalness,
      roughness: args.roughness,
    }),
    closeBottom: args.closeBottom,
    closeTop: args.closeTop,
  });
}

function createCanonicalBodyProfileMesh(args: {
  canonicalBodyProfile: CanonicalBodyProfile;
  totalHeightMm: number;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  minYOverallMm?: number | null;
  maxYOverallMm?: number | null;
  modelCoordinateOrigin?: ModelCoordinateOrigin;
  closeBottom?: boolean;
  closeTop?: boolean;
}): THREE.Mesh | null {
  const contour = buildCanonicalBodyLatheContour({
    canonicalBodyProfile: args.canonicalBodyProfile,
    totalHeightMm: args.totalHeightMm,
    minYOverallMm: args.minYOverallMm,
    maxYOverallMm: args.maxYOverallMm,
    modelCoordinateOrigin: args.modelCoordinateOrigin,
  });
  if (contour.length < 2) {
    return null;
  }
  const yValues = contour.map((point) => point.yMm);
  const bottomYmm = round2(Math.min(...yValues));
  const topYmm = round2(Math.max(...yValues));
  return createLatheMeshFromContour({
    name: args.name,
    contour,
    bottomYmm,
    topYmm,
    material: makeStandardMaterial(args.color, {
      metalness: args.metalness,
      roughness: args.roughness,
    }),
    closeBottom: args.closeBottom,
    closeTop: args.closeTop,
  });
}

function createParametricLidMesh(args: {
  fit: StanleySilhouetteFit;
  totalHeightMm: number;
  lidColorHex: string;
}): THREE.Mesh | null {
  const origin = getFitModelCoordinateOrigin(args.fit);
  const topYmm = origin === "bottom" ? round2(args.totalHeightMm) : round2(args.totalHeightMm / 2);
  const bottomYmm = round2(args.fit.rimTopYmm);
  if (topYmm - bottomYmm < 1) {
    return null;
  }
  const fallbackAssemblyRadiusMm =
    isFiniteNumber(args.fit.bodyReferenceFallbackAssemblyRadiusMm) &&
    (args.fit.bodyReferenceFallbackAssemblyRadiusMm ?? 0) > 0
      ? args.fit.bodyReferenceFallbackAssemblyRadiusMm ?? null
      : null;
  const outerRadiusMm = fallbackAssemblyRadiusMm != null
    ? round2(Math.max(fallbackAssemblyRadiusMm, 8))
    : round2(Math.max(args.fit.rimRadiusMm * 1.02, 8));
  const mouthRadiusMm = round2(Math.max(2, outerRadiusMm * 0.22));
  const lidContour = [
    { radiusMm: mouthRadiusMm, yMm: topYmm },
    { radiusMm: mouthRadiusMm, yMm: round2(topYmm - 6) },
    { radiusMm: outerRadiusMm * 0.94, yMm: round2(topYmm - 9) },
    { radiusMm: outerRadiusMm, yMm: round2(topYmm - 14) },
    { radiusMm: outerRadiusMm, yMm: bottomYmm },
  ];
  return createLatheMeshFromContour({
    name: "lid_mesh",
    contour: lidContour,
    bottomYmm,
    topYmm,
    material: makeStandardMaterial(args.lidColorHex, { metalness: 0.22, roughness: 0.56 }),
  });
}

function createHandleMesh(args: {
  fit: StanleySilhouetteFit;
  handleProfile: CanonicalHandleProfile;
  canonicalBodyProfile: CanonicalBodyProfile;
  calibration: CanonicalDimensionCalibration;
  bodyColorHex: string;
}): THREE.Mesh | null {
  const { handleProfile, canonicalBodyProfile, calibration, fit } = args;
  const upper = handleProfile.anchors.upper;
  const lower = handleProfile.anchors.lower;
  if (
    !Number.isFinite(upper?.yPx) ||
    !Number.isFinite(lower?.yPx) ||
    !Number.isFinite(upper?.xPx) ||
    !Number.isFinite(lower?.xPx)
  ) {
    return null;
  }

  const axis = canonicalBodyProfile.axis;
  const bodyYSpanPx = axis.yBottom - axis.yTop;
  if (!Number.isFinite(bodyYSpanPx) || Math.abs(bodyYSpanPx) < 1) {
    return null;
  }

  const orderedProfile = [...fit.bodyProfile].sort((a, b) => a.yMm - b.yMm);
  if (orderedProfile.length < 2) return null;
  const bodyMinYmm = orderedProfile[0].yMm;
  const bodyMaxYmm = orderedProfile[orderedProfile.length - 1].yMm;

  const anchorToBodyModelY = (yPx: number): number => {
    const t = clamp((yPx - axis.yTop) / bodyYSpanPx, 0, 1);
    // In photo coords, yPx increases downward. axis.yTop is the body top in photo space.
    // In model space (origin "bottom"), modelY increases upward — so t=0 (top) maps to bodyMaxYmm.
    return bodyMaxYmm + (bodyMinYmm - bodyMaxYmm) * t;
  };

  const upperModelYmm = anchorToBodyModelY(upper.yPx);
  const lowerModelYmm = anchorToBodyModelY(lower.yPx);
  const handleTopYmm = Math.max(upperModelYmm, lowerModelYmm);
  const handleBottomYmm = Math.min(upperModelYmm, lowerModelYmm);
  const handleHeightMm = handleTopYmm - handleBottomYmm;
  if (handleHeightMm < 4) return null;
  const handleMidYmm = (handleTopYmm + handleBottomYmm) / 2;

  const sx = calibration.photoToFrontTransform.matrix[0] ?? 0;
  if (!Number.isFinite(sx) || sx === 0) return null;
  const pxToMmX = Math.abs(sx);

  const bodyRadiusAtMid =
    orderedProfile.reduce((best, point) => {
      return Math.abs(point.yMm - handleMidYmm) < Math.abs(best.yMm - handleMidYmm)
        ? point
        : best;
    }).radiusMm;

  const anchorXPx = (upper.xPx + lower.xPx) / 2;
  const axisXAtMidPx = axis.xTop + ((axis.xBottom - axis.xTop) * (axis.yTop + bodyYSpanPx / 2 - axis.yTop)) / bodyYSpanPx;
  const lateralOffsetMm = Math.abs(anchorXPx - axisXAtMidPx) * pxToMmX;
  const extrusionWidthPx = handleProfile.symmetricExtrusionWidthPx;
  const estimatedOuterOffsetMm =
    Number.isFinite(extrusionWidthPx) && (extrusionWidthPx ?? 0) > 0
      ? Math.max(lateralOffsetMm, (extrusionWidthPx ?? 0) * pxToMmX * 0.85)
      : lateralOffsetMm;
  const minOuterOffsetMm = Math.max(handleHeightMm * 0.28, 12);
  const outerOffsetMm = Math.max(estimatedOuterOffsetMm, minOuterOffsetMm);

  const widthSamples = handleProfile.widthProfile
    .map((sample) => Math.abs(sample.widthPx) * pxToMmX)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianWidthMm =
    widthSamples.length > 0 ? widthSamples[Math.floor(widthSamples.length / 2)] : 0;
  const tubeRadiusMm = clamp(medianWidthMm > 0 ? medianWidthMm * 0.4 : 4.5, 2.5, 9);

  const sideSign = handleProfile.side === "left" ? -1 : 1;
  const attachX = bodyRadiusAtMid * sideSign;
  const outwardX = (bodyRadiusAtMid + outerOffsetMm) * sideSign;

  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(attachX, handleTopYmm, 0),
    new THREE.Vector3(outwardX, handleTopYmm - handleHeightMm * 0.08, 0),
    new THREE.Vector3(outwardX, handleBottomYmm + handleHeightMm * 0.08, 0),
    new THREE.Vector3(attachX, handleBottomYmm, 0),
  );
  const geometry = new THREE.TubeGeometry(curve, 48, tubeRadiusMm, 20, false);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    makeStandardMaterial(args.bodyColorHex, { metalness: 0.18, roughness: 0.7 }),
  );
  mesh.name = "handle_mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildLatheScene(args: {
  sceneName: string;
  fit: StanleySilhouetteFit;
  totalHeightMm: number;
  lidProfile?: EditableBodyOutline | null;
  silverProfile?: EditableBodyOutline | null;
  canonicalHandleProfile?: CanonicalHandleProfile | null;
  canonicalBodyProfile?: CanonicalBodyProfile | null;
  canonicalDimensionCalibration?: CanonicalDimensionCalibration | null;
  allowFallbackTopGeometry?: boolean;
  lidColorHex: string;
  rimColorHex: string;
}): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = args.sceneName;

  const origin = getFitModelCoordinateOrigin(args.fit);
  const rimTopOverallMm = modelYToOverallY(args.totalHeightMm, args.fit.rimTopYmm, origin);
  const rimBottomOverallMm = modelYToOverallY(args.totalHeightMm, args.fit.rimBottomYmm, origin);

  const body = createBodyMesh(args.fit);

  scene.add(body);
  const allowFallbackTopGeometry = args.allowFallbackTopGeometry !== false;
  const lidMesh =
    createOutlineDrivenMesh({
      outline: args.lidProfile,
      totalHeightMm: args.totalHeightMm,
      name: "lid_mesh",
      color: args.lidColorHex,
      metalness: 0.22,
      roughness: 0.56,
      maxYOverallMm: rimTopOverallMm,
      modelCoordinateOrigin: origin,
    }) ??
    (allowFallbackTopGeometry
      ? createParametricLidMesh({
          fit: args.fit,
          totalHeightMm: args.totalHeightMm,
          lidColorHex: args.lidColorHex,
        })
      : null);
  if (lidMesh) {
    scene.add(lidMesh);
  }

  const silverMesh =
    createOutlineDrivenMesh({
      outline: args.silverProfile,
      totalHeightMm: args.totalHeightMm,
      name: "silver_ring_mesh",
      color: args.rimColorHex,
      metalness: 0.82,
      roughness: 0.22,
      minYOverallMm: rimTopOverallMm,
      maxYOverallMm:
        args.fit.rimHeightMm > 0.5
          ? rimBottomOverallMm
          : undefined,
      modelCoordinateOrigin: origin,
    }) ??
    (allowFallbackTopGeometry && args.fit.rimHeightMm > 0.5 && args.fit.rimTopYmm > args.fit.rimBottomYmm
      ? createRimMesh(args.fit)
      : null);
  if (silverMesh) {
    scene.add(silverMesh);
  }

  if (args.canonicalHandleProfile && args.canonicalBodyProfile && args.canonicalDimensionCalibration) {
    const handleMesh = createHandleMesh({
      fit: args.fit,
      handleProfile: args.canonicalHandleProfile,
      canonicalBodyProfile: args.canonicalBodyProfile,
      calibration: args.canonicalDimensionCalibration,
      bodyColorHex: args.fit.bodyColorHex,
    });
    if (handleMesh) {
      scene.add(handleMesh);
    }
  }

  return scene;
}

function buildGeneratedMeshBounds(object: THREE.Object3D | null | undefined): GeneratedBodyReferenceMeshBounds | null {
  if (!object) return null;
  const bounds = new THREE.Box3().setFromObject(object);
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

function collectSceneMeshNames(scene: THREE.Scene): string[] {
  const meshNames = new Set<string>();
  scene.traverse((child) => {
    const maybeMesh = child as THREE.Object3D & { isMesh?: boolean };
    if (maybeMesh.isMesh && child.name) {
      meshNames.add(child.name);
    }
  });
  return [...meshNames].sort((left, right) => left.localeCompare(right));
}

function buildBodyOutlineOnlyScene(args: {
  sceneName: string;
  fit: StanleySilhouetteFit;
  renderMode: BodyReferenceGlbRenderMode;
  canonicalBodyProfile: CanonicalBodyProfile;
  lidProfile?: EditableBodyOutline | null;
  silverProfile?: EditableBodyOutline | null;
  totalHeightMm: number;
  bodyTopMm: number;
  bodyBottomMm: number;
  bodyColorHex: string;
  lidColorHex: string;
  rimColorHex: string;
}): {
  scene: THREE.Scene;
  bodyMesh: THREE.Mesh;
  meshNames: string[];
  fallbackMeshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
} {
  const scene = new THREE.Scene();
  scene.name = args.sceneName;
  const fallbackMeshNames: string[] = [];
  const origin = getFitModelCoordinateOrigin(args.fit);
  const rimTopOverallMm = modelYToOverallY(args.totalHeightMm, args.fit.rimTopYmm, origin);
  const rimBottomOverallMm = modelYToOverallY(args.totalHeightMm, args.fit.rimBottomYmm, origin);

  const bodyMesh = createCanonicalBodyProfileMesh({
    canonicalBodyProfile: args.canonicalBodyProfile,
    totalHeightMm: args.totalHeightMm,
    name: "body_mesh",
    color: args.bodyColorHex,
    metalness: 0.16,
    roughness: 0.72,
    minYOverallMm: args.bodyTopMm,
    maxYOverallMm: args.bodyBottomMm,
    modelCoordinateOrigin: origin,
    closeBottom: true,
    closeTop: false,
  });
  if (!bodyMesh) {
    throw new Error("Reviewed body outline is missing enough geometry to generate a reviewed preview GLB.");
  }
  scene.add(bodyMesh);

  if (args.renderMode === "hybrid-preview") {
    const reviewedLidMesh = createOutlineDrivenMesh({
      outline: args.lidProfile,
      totalHeightMm: args.totalHeightMm,
      name: "lid_mesh",
      color: args.lidColorHex,
      metalness: 0.22,
      roughness: 0.56,
      maxYOverallMm: rimTopOverallMm,
      modelCoordinateOrigin: origin,
    });
    const lidMesh =
      reviewedLidMesh ??
      createParametricLidMesh({
        fit: args.fit,
        totalHeightMm: args.totalHeightMm,
        lidColorHex: args.lidColorHex,
      });
    if (lidMesh) {
      scene.add(lidMesh);
      if (!reviewedLidMesh) {
        fallbackMeshNames.push(lidMesh.name);
      }
    }

    const reviewedRingMesh = createOutlineDrivenMesh({
      outline: args.silverProfile,
      totalHeightMm: args.totalHeightMm,
      name: "silver_ring_mesh",
      color: args.rimColorHex,
      metalness: 0.82,
      roughness: 0.22,
      minYOverallMm: rimTopOverallMm,
      maxYOverallMm:
        args.fit.rimHeightMm > 0.5
          ? rimBottomOverallMm
          : undefined,
      modelCoordinateOrigin: origin,
    });
    const ringMesh =
      reviewedRingMesh ??
      (args.fit.rimHeightMm > 0.5 && args.fit.rimTopYmm > args.fit.rimBottomYmm
        ? createRimMesh(args.fit)
        : null);
    if (ringMesh) {
      scene.add(ringMesh);
      if (!reviewedRingMesh) {
        fallbackMeshNames.push(ringMesh.name);
      }
    }
  }

  return {
    scene,
    bodyMesh,
    meshNames: collectSceneMeshNames(scene),
    fallbackMeshNames,
    bodyMeshBounds: buildGeneratedMeshBounds(bodyMesh),
  };
}

function buildResolvedBodyProfileOnlyScene(args: {
  sceneName: string;
  fit: StanleySilhouetteFit;
  bodyColorHex: string;
}): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = args.sceneName;
  const bodyMesh = createBodyOnlyMeshFromFit({
    fit: args.fit,
    bodyColorHex: args.bodyColorHex,
  });
  if (!bodyMesh) {
    throw new Error("Resolved body profile is missing enough geometry to generate a body-only GLB.");
  }
  scene.add(bodyMesh);
  return scene;
}

function buildStanleyIceFlow30Scene(profile: TumblerProfile, fit: StanleySilhouetteFit): THREE.Scene {
  return buildLatheScene({
    sceneName: "stanley_iceflow_30_generated",
    fit,
    totalHeightMm: profile.overallHeightMm,
    lidColorHex: "#d8ef80",
    rimColorHex: fit.rimColorHex,
  });
}

function resolveOutlineGeometrySource(
  outline: EditableBodyOutline | null | undefined,
  fallbackLabel: string,
): string {
  const hasDirectContour = Boolean(outline?.directContour && outline.directContour.length >= 3);
  const hasPointProfile = Boolean(outline?.points && outline.points.length >= 2);
  if (hasDirectContour || hasPointProfile) {
    return "reviewed outline";
  }
  return fallbackLabel;
}

async function writeGeneratedGlb(
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

function buildGeneratedTumblerAuditContract(args: {
  profile: TumblerProfile;
  generatedGlb: {
    glbPath: string;
    glbHash: string;
    generatedAt: string;
  };
  scene: THREE.Scene;
}): BodyGeometryContract {
  const meshNames = collectSceneMeshNames(args.scene);
  const accessoryMeshNames = detectAccessoryMeshes(meshNames);
  const fallbackMeshNames = detectFallbackMeshes(meshNames);
  const bodyMeshBounds = buildGeneratedMeshBounds(args.scene.getObjectByName("body_mesh"));
  const wrapDiameterMm = round2(args.profile.outsideDiameterMm ?? args.profile.topDiameterMm ?? 0);
  const expectedBodyHeightMm = round2(args.profile.usableHeightMm ?? args.profile.overallHeightMm ?? 0);

  return updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "hybrid-preview",
    source: {
      type: "generated",
      filename: `${args.profile.id}.generated-profile`,
      detectedBodyOnly: false,
    },
    glb: {
      path: args.generatedGlb.glbPath,
      hash: args.generatedGlb.glbHash,
      generatedAt: args.generatedGlb.generatedAt,
      freshRelativeToSource: undefined,
    },
    meshes: {
      names: meshNames,
      bodyMeshNames: meshNames.filter((name) => name === "body_mesh"),
      accessoryMeshNames,
      fallbackMeshNames,
      fallbackDetected: fallbackMeshNames.length > 0,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: bodyMeshBounds
        ? {
            width: bodyMeshBounds.sizeMm.x,
            height: bodyMeshBounds.sizeMm.y,
            depth: bodyMeshBounds.sizeMm.z,
          }
        : undefined,
      bodyBoundsUnits: bodyMeshBounds ? "mm" : undefined,
      wrapDiameterMm: wrapDiameterMm > 0 ? wrapDiameterMm : undefined,
      wrapWidthMm: wrapDiameterMm > 0 ? round2(Math.PI * wrapDiameterMm) : undefined,
      expectedBodyWidthMm: wrapDiameterMm > 0 ? wrapDiameterMm : undefined,
      expectedBodyHeightMm: expectedBodyHeightMm > 0 ? expectedBodyHeightMm : undefined,
      scaleSource: bodyMeshBounds ? "mesh-bounds" : (wrapDiameterMm > 0 ? "physical-wrap" : "unknown"),
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });
}

function buildBodyReferenceBodyGeometryContract(args: {
  input: GenerateBodyReferenceGlbInput;
  renderMode: BodyReferenceGlbRenderMode;
  meshNames: string[];
  fallbackMeshNames: string[];
  bodyMeshBounds: GeneratedBodyReferenceMeshBounds | null;
  glbPath: string;
  glbHash: string;
  generatedAt: string;
  silhouetteAudit: BodyReferenceSilhouetteAuditReport | null;
}): BodyGeometryContract {
  const sourceHashPayload = buildBodyGeometrySourceHashPayload(args.input.bodyOutline);
  const sourceContourViewport = args.input.bodyOutline?.sourceContourViewport ?? null;
  const sourceType = args.input.bodyOutline ? "approved-svg" : "unknown";
  const contract = createEmptyBodyGeometryContract();
  const accessoryMeshNames = detectAccessoryMeshes(args.meshNames);
  const fallbackMeshNames = detectFallbackMeshes(args.meshNames);
  const sourceHash = sourceHashPayload ? hashJsonSha256Node(sourceHashPayload) : undefined;
  const svgQuality = buildBodyReferenceSvgQualityReportFromOutline({
    outline: args.input.bodyOutline,
    sourceHash,
    label: args.input.templateName ?? args.input.matchedProfileId ?? undefined,
  });

  return updateContractValidation({
    ...contract,
    mode: args.renderMode,
    source: {
      type: sourceType,
      hash: sourceHash,
      widthPx: sourceContourViewport?.width ? round2(sourceContourViewport.width) : undefined,
      heightPx: sourceContourViewport?.height ? round2(sourceContourViewport.height) : undefined,
      viewBox: sourceContourViewport
        ? `${round2(sourceContourViewport.minX)} ${round2(sourceContourViewport.minY)} ${round2(sourceContourViewport.width)} ${round2(sourceContourViewport.height)}`
        : undefined,
      detectedBodyOnly: args.input.bodyOutlineSourceMode === "body-only",
    },
    glb: {
      path: args.glbPath,
      hash: args.glbHash,
      sourceHash,
      generatedAt: args.generatedAt,
      freshRelativeToSource: sourceHashPayload ? true : undefined,
    },
    meshes: {
      names: args.meshNames,
      bodyMeshNames: args.meshNames.filter((name) => name === "body_mesh"),
      accessoryMeshNames,
      fallbackMeshNames: [...new Set([...args.fallbackMeshNames, ...fallbackMeshNames])],
      fallbackDetected: args.fallbackMeshNames.length > 0 || fallbackMeshNames.length > 0,
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
      wrapDiameterMm: round2(args.input.canonicalDimensionCalibration.wrapDiameterMm),
      wrapWidthMm: round2(args.input.canonicalDimensionCalibration.wrapWidthMm),
      frontVisibleWidthMm: round2(args.input.canonicalDimensionCalibration.frontVisibleWidthMm),
      expectedBodyWidthMm: args.silhouetteAudit?.approvedWidthMm ?? round2(args.input.canonicalDimensionCalibration.frontVisibleWidthMm),
      expectedBodyHeightMm: args.silhouetteAudit?.approvedHeightMm ?? round2(
        args.input.canonicalDimensionCalibration.bodyBottomMm - args.input.canonicalDimensionCalibration.lidBodyLineMm,
      ),
      printableTopMm: args.input.canonicalDimensionCalibration.printableSurfaceContract?.printableTopMm,
      printableBottomMm: args.input.canonicalDimensionCalibration.printableSurfaceContract?.printableBottomMm,
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

const BODY_REFERENCE_AUDIT_DIR = path.join(process.cwd(), "tmp", "audit");

async function writeBodyReferenceSilhouetteAuditArtifacts(args: {
  fileStem: string;
  audit: BodyReferenceSilhouetteAuditReport;
}): Promise<BodyReferenceSilhouetteAuditReport> {
  try {
    await mkdir(BODY_REFERENCE_AUDIT_DIR, { recursive: true });
    const jsonPath = path.join(BODY_REFERENCE_AUDIT_DIR, `${args.fileStem}-silhouette-audit.json`);
    const svgPath = path.join(BODY_REFERENCE_AUDIT_DIR, `${args.fileStem}-silhouette-audit.svg`);
    const nextAudit: BodyReferenceSilhouetteAuditReport = {
      ...args.audit,
      artifactPaths: {
        jsonPath,
        svgPath,
      },
    };
    await writeFile(jsonPath, JSON.stringify(nextAudit, null, 2), "utf8");
    await writeFile(svgPath, buildBodyReferenceSilhouetteAuditSvg(nextAudit), "utf8");
    return nextAudit;
  } catch {
    return args.audit;
  }
}

export async function ensureGeneratedTumblerGlb(
  profileIdOrInput: string | EnsureGeneratedTumblerGlbInput,
  options?: { imageUrl?: string | null; imageUrls?: string[] },
) : Promise<GeneratedTumblerGlbResult> {
  const profileId = typeof profileIdOrInput === "string"
    ? profileIdOrInput
    : profileIdOrInput.profileId ?? "";
  const resolvedOptions = typeof profileIdOrInput === "string"
    ? options
    : {
        imageUrl: profileIdOrInput.imageUrl ?? options?.imageUrl ?? null,
        imageUrls: profileIdOrInput.imageUrls ?? options?.imageUrls ?? [],
      };

  if (profileId !== "stanley-iceflow-30") {
    return { glbPath: "", fitDebug: null, bodyColorHex: null, rimColorHex: null };
  }

  const profile = getTumblerProfileById(profileId);
  if (!profile) return { glbPath: "", fitDebug: null, bodyColorHex: null, rimColorHex: null };

  let fit: StanleySilhouetteFit = buildFallbackBodyProfile(profile);

  const candidateImageUrls = [
    ...(resolvedOptions?.imageUrls ?? []),
    ...(resolvedOptions?.imageUrl ? [resolvedOptions.imageUrl] : []),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  if (candidateImageUrls.length > 0) {
    try {
      const silhouetteFit = await fitBestStanleyIceFlow30FromImages(profile, candidateImageUrls);
      if (silhouetteFit) {
        fit = silhouetteFit;
      }
    } catch (error) {
      console.warn("[generateTumblerModel] silhouette fit failed:", error);
    }
  }

  const fileName = `${profileId}-bodyfit-v5.glb`;
  const scene = buildStanleyIceFlow30Scene(profile, fit);
  const generated = await writeGeneratedGlb(fileName, scene);
  const auditArtifact = await writeBodyGeometryAuditArtifact({
    glbAbsolutePath: generated.glbAbsolutePath,
    contract: buildGeneratedTumblerAuditContract({
      profile,
      generatedGlb: generated,
      scene,
    }),
  });
  return {
    glbPath: generated.glbPath,
    auditJsonPath: auditArtifact.auditAbsolutePath,
    fitDebug: fit.fitDebug ?? null,
    bodyColorHex: fit.bodyColorHex ?? null,
    rimColorHex: fit.rimColorHex ?? null,
  };
}

export async function generateBodyReferenceGlb(
  input: GenerateBodyReferenceGlbInput,
): Promise<GeneratedBodyReferenceGlbResult> {
  const fit = buildBodyReferenceFit(input);
  const renderMode = input.renderMode ?? "hybrid-preview";
  const bodyOnlyTrace = input.bodyOutlineSourceMode === "body-only";
  const hasReviewedLidGeometry = Boolean(
    (input.lidProfile?.directContour && input.lidProfile.directContour.length >= 3) ||
    (input.lidProfile?.points && input.lidProfile.points.length >= 2),
  );
  const hasReviewedRingGeometry = Boolean(
    (input.silverProfile?.directContour && input.silverProfile.directContour.length >= 3) ||
    (input.silverProfile?.points && input.silverProfile.points.length >= 2),
  );
  if (!input.bodyOutline) {
    throw new Error("Reviewed body outline is required to generate a reviewed preview GLB.");
  }
  const fallbackTopGeometryOmitted =
    renderMode === "body-cutout-qa" ||
    fit.bodyReferenceFallbackTopGeometryMode === "omitted";
  const visualLikeness = resolveBodyReferenceVisualLikeness({
    canonicalDimensionCalibration: input.canonicalDimensionCalibration,
    canonicalBodyProfile: input.canonicalBodyProfile,
    canonicalHandleProfile: input.canonicalHandleProfile ?? null,
    lidProfile: input.lidProfile ?? null,
    silverProfile: input.silverProfile ?? null,
    fallbackTopGeometryOmitted,
  });
  const bodyGeometrySource = bodyOnlyTrace
    ? "approved contour -> mirrored body profile -> revolved body_mesh (body-only trace)"
    : "approved contour -> mirrored body profile -> revolved body_mesh";
  const lidGeometrySource = renderMode === "body-cutout-qa"
    ? "excluded in BODY CUTOUT QA mode"
    : hasReviewedLidGeometry
    ? "reviewed lid outline"
    : fallbackTopGeometryOmitted
      ? bodyOnlyTrace
        ? "unreviewed lid geometry omitted (body-only trace)"
        : "unreviewed lid geometry omitted"
    : bodyOnlyTrace
      ? "parametric lid fallback (body-only trace)"
      : "parametric lid fallback";
  const ringGeometrySource = renderMode === "body-cutout-qa"
    ? "excluded in BODY CUTOUT QA mode"
    : hasReviewedRingGeometry
    ? "reviewed silver-ring outline"
    : fallbackTopGeometryOmitted
      ? bodyOnlyTrace
        ? "unreviewed silver-ring geometry omitted (body-only trace)"
        : "unreviewed silver-ring geometry omitted"
    : bodyOnlyTrace
      ? "parametric silver-ring fallback (body-only trace)"
      : "parametric silver-ring fallback";
  const lidPreviewLabel = renderMode === "body-cutout-qa"
    ? lidGeometrySource
    : hasReviewedLidGeometry
    ? lidGeometrySource
    : fallbackTopGeometryOmitted
      ? lidGeometrySource
      : `${lidGeometrySource} as preview-only silhouette`;
  const ringPreviewLabel = renderMode === "body-cutout-qa"
    ? ringGeometrySource
    : hasReviewedRingGeometry
    ? ringGeometrySource
    : fallbackTopGeometryOmitted
      ? ringGeometrySource
      : `${ringGeometrySource} as preview-only silhouette`;
  const fileStem = buildBodyReferenceFileStem(input);
  const generatedSourceSignature = buildBodyReferenceGlbSourceSignature(input);
  const builtScene = buildBodyOutlineOnlyScene({
    sceneName: `${fileStem}_generated`,
    fit,
    renderMode,
    canonicalBodyProfile: input.canonicalBodyProfile,
    lidProfile: input.lidProfile ?? null,
    silverProfile: input.silverProfile ?? null,
    totalHeightMm: input.canonicalDimensionCalibration.totalHeightMm,
    bodyTopMm: input.canonicalDimensionCalibration.lidBodyLineMm,
    bodyBottomMm: input.canonicalDimensionCalibration.bodyBottomMm,
    bodyColorHex: input.bodyColorHex ?? fit.bodyColorHex ?? "#d7d4df",
    lidColorHex: input.lidColorHex ?? input.bodyColorHex ?? fit.bodyColorHex ?? "#d7d4df",
    rimColorHex: input.rimColorHex ?? fit.rimColorHex ?? "#b6b6b6",
  });
  const silhouetteAudit = await writeBodyReferenceSilhouetteAuditArtifacts({
    fileStem,
    audit: buildBodyReferenceSilhouetteAudit({
      bodyMesh: builtScene.bodyMesh,
      canonicalBodyProfile: input.canonicalBodyProfile,
      canonicalDimensionCalibration: input.canonicalDimensionCalibration,
      modelCoordinateOrigin: getFitModelCoordinateOrigin(fit),
      minYOverallMm: input.canonicalDimensionCalibration.lidBodyLineMm,
      maxYOverallMm: input.canonicalDimensionCalibration.bodyBottomMm,
    }),
  });
  const generatedGlb = await writeGeneratedGlb(
    `${fileStem}.glb`,
    builtScene.scene,
  );
  const bodyGeometryContract = buildBodyReferenceBodyGeometryContract({
    input,
    renderMode,
    meshNames: builtScene.meshNames,
    fallbackMeshNames: builtScene.fallbackMeshNames,
    bodyMeshBounds: builtScene.bodyMeshBounds,
    glbPath: generatedGlb.glbPath,
    glbHash: generatedGlb.glbHash,
    generatedAt: generatedGlb.generatedAt,
    silhouetteAudit,
  });
  const auditArtifact = await writeBodyGeometryAuditArtifact({
    glbAbsolutePath: generatedGlb.glbAbsolutePath,
    contract: bodyGeometryContract,
  });
  const modelSourceLabel = renderMode === "body-cutout-qa"
    ? `BODY CUTOUT QA mode. Body geometry authority: ${bodyGeometrySource}. Lid geometry: ${lidGeometrySource}. Ring geometry: ${ringGeometrySource}. Preview trust: ${visualLikeness.status} (${visualLikeness.score}).`
    : `Body geometry authority: ${bodyGeometrySource}. Lid preview geometry: ${lidPreviewLabel}. Ring preview geometry: ${ringPreviewLabel}. Preview trust: ${visualLikeness.status} (${visualLikeness.score}).`;

  return {
    glbPath: generatedGlb.glbPath,
    modelStatus: "generated-reviewed-model",
    renderMode,
    generatedSourceSignature,
    fitDebug: null,
    bodyColorHex: fit.bodyColorHex ?? null,
    rimColorHex: fit.rimColorHex ?? null,
    modelSourceLabel,
    bodyGeometrySource,
    lidGeometrySource,
    ringGeometrySource,
    meshNames: builtScene.meshNames,
    fallbackMeshNames: builtScene.fallbackMeshNames,
    bodyMeshBounds: builtScene.bodyMeshBounds,
    visualLikeness,
    silhouetteAudit,
    bodyGeometryContract,
    auditJsonPath: auditArtifact.auditAbsolutePath,
  };
}
