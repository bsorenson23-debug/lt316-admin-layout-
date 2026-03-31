import { access, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { FlatItemLookupTraceDebug, FlatItemLookupTracePoint } from "@/types/flatItemLookup";

const GENERATED_PUBLIC_PREFIX = "/models/generated";
const GENERATED_DIR = path.join(process.cwd(), "public", "models", "generated");
const DOWNLOAD_TIMEOUT_MS = 12_000;
const MAX_REMOTE_MODEL_BYTES = 40 * 1024 * 1024;
const MAX_TRACE_IMAGE_BYTES = 12 * 1024 * 1024;
const MIN_TRACE_SCORE = 0.92;

type FileReaderLike = {
  result: string | ArrayBuffer | null;
  onloadend: null | (() => void);
  onerror: null | ((error: unknown) => void);
  readAsArrayBuffer(blob: Blob): Promise<void>;
  readAsDataURL(blob: Blob): Promise<void>;
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

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "flat-item";
}

function createRoundedRectShape(widthMm: number, heightMm: number, radiusMm: number): THREE.Shape {
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const r = Math.min(radiusMm, halfW * 0.45, halfH * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + r, -halfH);
  shape.lineTo(halfW - r, -halfH);
  shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + r);
  shape.lineTo(halfW, halfH - r);
  shape.quadraticCurveTo(halfW, halfH, halfW - r, halfH);
  shape.lineTo(-halfW + r, halfH);
  shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - r);
  shape.lineTo(-halfW, -halfH + r);
  shape.quadraticCurveTo(-halfW, -halfH, -halfW + r, -halfH);
  return shape;
}

function createDogTagShape(widthMm: number, heightMm: number): THREE.Shape {
  const radius = Math.min(widthMm, heightMm) * 0.22;
  const shape = createRoundedRectShape(widthMm, heightMm, radius);
  const hole = new THREE.Path();
  const holeRadius = Math.min(widthMm, heightMm) * 0.09;
  hole.absellipse(0, heightMm * 0.28, holeRadius, holeRadius, 0, Math.PI * 2, false, 0);
  shape.holes.push(hole);
  return shape;
}

function createMagazineShape(widthMm: number, heightMm: number): THREE.Shape {
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const shape = new THREE.Shape();
  const points: THREE.Vector2[] = [];
  const sampleCount = 18;

  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    const y = halfH - t * heightMm;
    const centerOffset = THREE.MathUtils.lerp(-halfW * 0.05, halfW * 0.14, Math.pow(t, 1.18));
    const widthFactor =
      t < 0.12
        ? THREE.MathUtils.lerp(0.34, 0.4, t / 0.12)
        : t < 0.84
          ? THREE.MathUtils.lerp(0.4, 0.47, (t - 0.12) / 0.72)
          : THREE.MathUtils.lerp(0.47, 0.5, (t - 0.84) / 0.16);
    points.push(new THREE.Vector2(centerOffset + halfW * widthFactor, y));
  }

  points.push(new THREE.Vector2(halfW * 0.56, -halfH * 0.97));
  points.push(new THREE.Vector2(halfW * 0.18, -halfH * 1.04));
  points.push(new THREE.Vector2(-halfW * 0.2, -halfH * 1.02));
  points.push(new THREE.Vector2(-halfW * 0.34, -halfH * 0.9));

  for (let i = sampleCount; i >= 0; i -= 1) {
    const t = i / sampleCount;
    const y = halfH - t * heightMm;
    const centerOffset = THREE.MathUtils.lerp(-halfW * 0.05, halfW * 0.14, Math.pow(t, 1.18));
    const widthFactor =
      t < 0.1
        ? THREE.MathUtils.lerp(0.31, 0.36, t / 0.1)
        : t < 0.82
          ? THREE.MathUtils.lerp(0.36, 0.39, (t - 0.1) / 0.72)
          : THREE.MathUtils.lerp(0.39, 0.43, (t - 0.82) / 0.18);
    points.push(new THREE.Vector2(centerOffset - halfW * widthFactor, y));
  }

  shape.setFromPoints(points);
  return shape;
}

function createKnifeBlankShape(widthMm: number, heightMm: number): THREE.Shape {
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const bladeX = halfW * 0.58;
  const tangX = -halfW * 0.14;
  const handleBulgeX = -halfW;
  const guardX = halfW * 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(handleBulgeX, -halfH * 0.22);
  shape.quadraticCurveTo(-halfW * 0.82, -halfH * 0.58, tangX, -halfH * 0.5);
  shape.lineTo(guardX, -halfH * 0.46);
  shape.lineTo(bladeX, -halfH * 0.14);
  shape.lineTo(halfW, 0);
  shape.lineTo(bladeX, halfH * 0.14);
  shape.lineTo(guardX, halfH * 0.46);
  shape.lineTo(tangX, halfH * 0.5);
  shape.quadraticCurveTo(-halfW * 0.82, halfH * 0.58, handleBulgeX, halfH * 0.22);
  shape.quadraticCurveTo(-halfW * 0.72, 0, handleBulgeX, -halfH * 0.22);
  return shape;
}

function buildShape(familyKey: string, widthMm: number, heightMm: number): THREE.Shape {
  switch (familyKey) {
    case "dog-tag":
      return createDogTagShape(widthMm, heightMm);
    case "magazine":
      return createMagazineShape(widthMm, heightMm);
    case "knife-blank":
      return createKnifeBlankShape(widthMm, heightMm);
    case "round-plate": {
      const radius = Math.min(widthMm, heightMm) / 2;
      const shape = new THREE.Shape();
      shape.absellipse(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
      return shape;
    }
    case "keychain":
    case "card":
    case "phone-case":
    case "rect-plate":
    default:
      return createRoundedRectShape(widthMm, heightMm, Math.min(widthMm, heightMm) * 0.12);
  }
}

function materialColor(material: string): string {
  if (/stainless|steel/.test(material)) return "#a7adb4";
  if (/anodized|aluminum/.test(material)) return "#7a8694";
  if (/brass/.test(material)) return "#b58b4b";
  if (/wood|bamboo/.test(material)) return "#9b6b3d";
  if (/slate/.test(material)) return "#596169";
  if (/ceramic/.test(material)) return "#d7d6d1";
  if (/glass/.test(material)) return "#92afbf";
  if (/acrylic/.test(material)) return "#c8d2db";
  return "#606a78";
}

function buildSceneFromShape(args: {
  shape: THREE.Shape;
  thicknessMm: number;
  material: string;
  label: string;
}): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = sanitizeSlug(args.label);

  const geometry = new THREE.ExtrudeGeometry(args.shape, {
    depth: Math.max(0.8, args.thicknessMm),
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: Math.min(1.2, Math.max(0.18, args.thicknessMm * 0.06)),
    bevelThickness: Math.min(0.9, Math.max(0.12, args.thicknessMm * 0.05)),
    curveSegments: 24,
  });
  geometry.center();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: materialColor(args.material),
      metalness: /steel|aluminum|brass/.test(args.material) ? 0.72 : 0.18,
      roughness: /steel|aluminum|brass/.test(args.material) ? 0.36 : 0.7,
    }),
  );
  body.name = "flat_item_body";
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  return scene;
}

function buildFlatItemScene(args: {
  familyKey: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  material: string;
  label: string;
}): THREE.Scene {
  return buildSceneFromShape({
    shape: buildShape(args.familyKey, args.widthMm, args.heightMm),
    thicknessMm: args.thicknessMm,
    material: args.material,
    label: args.label,
  });
}

async function generatedFileExists(fileName: string): Promise<boolean> {
  try {
    await access(path.join(GENERATED_DIR, fileName));
    return true;
  } catch {
    return false;
  }
}

async function writeGeneratedFile(fileName: string, buffer: Buffer | Uint8Array): Promise<string> {
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(path.join(GENERATED_DIR, fileName), buffer);
  return `${GENERATED_PUBLIC_PREFIX}/${fileName}`;
}

function extensionFromUrl(value: string): string {
  const match = value.toLowerCase().match(/\.(glb|gltf|stl|obj)(?:[?#]|$)/);
  return match?.[1] ?? "";
}

function extensionFromContentType(value: string | null): string {
  if (!value) return "";
  if (/gltf-binary|model\/glb|application\/octet-stream/i.test(value)) return "glb";
  if (/model\/gltf\+json|application\/json/i.test(value)) return "gltf";
  if (/model\/stl|application\/sla/i.test(value)) return "stl";
  if (/text\/plain|model\/obj/i.test(value)) return "obj";
  return "";
}

function buildRemoteAssetFileName(label: string, url: string, ext: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `${sanitizeSlug(label)}-${hash}.${ext}`;
}

async function fetchBinary(url: string, maxBytes: number): Promise<{ buffer: Buffer; contentType: string | null }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > maxBytes) {
    throw new Error("Remote asset exceeds size limit.");
  }

  return {
    buffer,
    contentType: response.headers.get("content-type"),
  };
}

function averageRgba(
  data: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * width + x) * 4;
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
      a += data[index + 3];
      count += 1;
    }
  }
  return count > 0
    ? [r / count, g / count, b / count, a / count]
    : [255, 255, 255, 255];
}

function buildMaskFromImageData(data: Uint8Array, width: number, height: number): Uint8Array {
  const patchSize = Math.max(4, Math.floor(Math.min(width, height) * 0.06));
  const corners = [
    averageRgba(data, width, 0, 0, patchSize, patchSize),
    averageRgba(data, width, width - patchSize, 0, width, patchSize),
    averageRgba(data, width, 0, height - patchSize, patchSize, height),
    averageRgba(data, width, width - patchSize, height - patchSize, width, height),
  ];
  const background = corners.reduce<[number, number, number, number]>(
    (acc, sample) => [acc[0] + sample[0], acc[1] + sample[1], acc[2] + sample[2], acc[3] + sample[3]],
    [0, 0, 0, 0],
  ).map((value) => value / corners.length) as [number, number, number, number];
  const hasTransparency = corners.some((sample) => sample[3] < 240);
  const mask = new Uint8Array(width * height);
  const bgLuma = background[0] * 0.299 + background[1] * 0.587 + background[2] * 0.114;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 16) continue;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const colorDistance = Math.sqrt(
        (r - background[0]) ** 2 +
        (g - background[1]) ** 2 +
        (b - background[2]) ** 2,
      );
      const lumaDistance = Math.abs(luma - bgLuma);
      const isForeground = hasTransparency
        ? alpha > 40
        : colorDistance > 30 || lumaDistance > 24;
      if (isForeground) {
        mask[y * width + x] = 1;
      }
    }
  }

  return mask;
}

function dilateMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          next[ny * width + nx] = 1;
        }
      }
    }
  }
  return next;
}

function erodeMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            keep = 0;
            break;
          }
        }
        if (!keep) break;
      }
      next[y * width + x] = keep;
    }
  }
  return next;
}

function closeMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  return erodeMask(dilateMask(mask, width, height), width, height);
}

type MaskBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
};

function findMaskBounds(mask: Uint8Array, width: number, height: number): MaskBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY || area === 0) return null;
  return { minX, minY, maxX, maxY, area };
}

function cropMask(mask: Uint8Array, width: number, height: number, bounds: MaskBounds) {
  const padding = 2;
  const minX = Math.max(0, bounds.minX - padding);
  const minY = Math.max(0, bounds.minY - padding);
  const maxX = Math.min(width - 1, bounds.maxX + padding);
  const maxY = Math.min(height - 1, bounds.maxY + padding);
  const nextWidth = maxX - minX + 1;
  const nextHeight = maxY - minY + 1;
  const next = new Uint8Array(nextWidth * nextHeight);
  for (let y = 0; y < nextHeight; y += 1) {
    for (let x = 0; x < nextWidth; x += 1) {
      next[y * nextWidth + x] = mask[(minY + y) * width + (minX + x)];
    }
  }
  return {
    mask: next,
    width: nextWidth,
    height: nextHeight,
  };
}

function perpendicularDistance(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return point.distanceTo(start);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy);
}

function simplifyPoints(points: THREE.Vector2[], epsilon: number): THREE.Vector2[] {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= epsilon) {
    return [points[0], points[points.length - 1]];
  }
  const left = simplifyPoints(points.slice(0, index + 1), epsilon);
  const right = simplifyPoints(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function polygonArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area / 2);
}

function buildSilhouetteShapeFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
  widthMm: number,
  heightMm: number,
  offsetX: number,
  offsetY: number,
): { shape: THREE.Shape; outlinePointsPx: FlatItemLookupTracePoint[] } | null {
  const leftPoints: THREE.Vector2[] = [];
  const rightPoints: THREE.Vector2[] = [];
  const leftPointsPx: THREE.Vector2[] = [];
  const rightPointsPx: THREE.Vector2[] = [];
  let filledRows = 0;

  for (let y = 0; y < height; y += 1) {
    let minX = -1;
    let maxX = -1;
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (minX === -1) minX = x;
      maxX = x;
    }
    if (minX === -1 || maxX === -1) continue;
    filledRows += 1;
    const yy = ((height - 1 - y) / Math.max(1, height - 1) - 0.5) * heightMm;
    leftPoints.push(new THREE.Vector2((minX / Math.max(1, width - 1) - 0.5) * widthMm, yy));
    rightPoints.push(new THREE.Vector2((maxX / Math.max(1, width - 1) - 0.5) * widthMm, yy));
    leftPointsPx.push(new THREE.Vector2(offsetX + minX, offsetY + y));
    rightPointsPx.push(new THREE.Vector2(offsetX + maxX, offsetY + y));
  }

  if (filledRows < Math.max(12, height * 0.3)) {
    return null;
  }

  const polygon = [...leftPoints, ...rightPoints.reverse()];
  const polygonPx = [...leftPointsPx, ...rightPointsPx.reverse()];
  const simplified = simplifyPoints(polygon, Math.max(widthMm, heightMm) * 0.006);
  const simplifiedPx = simplifyPoints(polygonPx, 2);
  if (simplified.length < 6 || polygonArea(simplified) < widthMm * heightMm * 0.08) {
    return null;
  }

  return {
    shape: new THREE.Shape(simplified),
    outlinePointsPx: simplifiedPx.map((point) => ({ xPx: round2(point.x), yPx: round2(point.y) })),
  };
}

async function buildTraceCandidate(
  url: string,
  widthMm: number,
  heightMm: number,
): Promise<{ shape: THREE.Shape | null; score: number; debug: FlatItemLookupTraceDebug }> {
  const { buffer } = await fetchBinary(url, MAX_TRACE_IMAGE_BYTES);
  const image = await sharp(buffer, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let mask = buildMaskFromImageData(image.data, image.info.width, image.info.height);
  mask = closeMask(mask, image.info.width, image.info.height);
  const bounds = findMaskBounds(mask, image.info.width, image.info.height);
  if (!bounds) {
    return {
      shape: null,
      score: 0,
      debug: {
        kind: "silhouette-trace",
        sourceImageUrl: url,
        imageWidthPx: image.info.width,
        imageHeightPx: image.info.height,
        silhouetteBoundsPx: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        coverage: 0,
        traceScore: 0,
        accepted: false,
        rejectionReason: "No stable foreground silhouette was detected.",
        targetWidthMm: round2(widthMm),
        targetHeightMm: round2(heightMm),
        outlinePointsPx: [],
      },
    };
  }

  const coverage = bounds.area / (image.info.width * image.info.height);
  if (coverage < 0.03 || coverage > 0.92) {
    return {
      shape: null,
      score: 0,
      debug: {
        kind: "silhouette-trace",
        sourceImageUrl: url,
        imageWidthPx: image.info.width,
        imageHeightPx: image.info.height,
        silhouetteBoundsPx: bounds,
        coverage: round2(coverage),
        traceScore: 0,
        accepted: false,
        rejectionReason: "Foreground coverage was outside the usable trace range.",
        targetWidthMm: round2(widthMm),
        targetHeightMm: round2(heightMm),
        outlinePointsPx: [],
      },
    };
  }

  const cropped = cropMask(mask, image.info.width, image.info.height, bounds);
  const silhouette = buildSilhouetteShapeFromMask(
    cropped.mask,
    cropped.width,
    cropped.height,
    widthMm,
    heightMm,
    bounds.minX,
    bounds.minY,
  );
  if (!silhouette) {
    return {
      shape: null,
      score: 0,
      debug: {
        kind: "silhouette-trace",
        sourceImageUrl: url,
        imageWidthPx: image.info.width,
        imageHeightPx: image.info.height,
        silhouetteBoundsPx: bounds,
        coverage: round2(coverage),
        traceScore: 0,
        accepted: false,
        rejectionReason: "The extracted outline was too noisy or too small to use.",
        targetWidthMm: round2(widthMm),
        targetHeightMm: round2(heightMm),
        outlinePointsPx: [],
      },
    };
  }

  const aspectRatio = cropped.width / Math.max(1, cropped.height);
  const targetAspectRatio = widthMm / Math.max(1, heightMm);
  const aspectPenalty = Math.abs(aspectRatio - targetAspectRatio);
  const score = (1 - aspectPenalty) + clamp(cropped.height / 320, 0, 0.4);
  const roundedScore = round2(score);
  const accepted = score >= MIN_TRACE_SCORE;

  return {
    shape: silhouette.shape,
    score,
    debug: {
      kind: "silhouette-trace",
      sourceImageUrl: url,
      imageWidthPx: image.info.width,
      imageHeightPx: image.info.height,
      silhouetteBoundsPx: bounds,
      coverage: round2(coverage),
      traceScore: roundedScore,
      accepted,
      rejectionReason: accepted ? null : `Best silhouette scored ${roundedScore}, below the ${MIN_TRACE_SCORE} acceptance threshold.`,
      targetWidthMm: round2(widthMm),
      targetHeightMm: round2(heightMm),
      outlinePointsPx: silhouette.outlinePointsPx,
    },
  };
}

export async function ensureDownloadedFlatItemModel(args: {
  modelUrls: string[];
  label: string;
}): Promise<{ path: string; sourceUrl: string } | null> {
  for (const modelUrl of args.modelUrls) {
    const url = modelUrl.trim();
    if (!url) continue;
    try {
      const fetched = await fetchBinary(url, MAX_REMOTE_MODEL_BYTES);
      const ext = extensionFromUrl(url) || extensionFromContentType(fetched.contentType);
      if (!ext || !["glb", "gltf", "stl", "obj"].includes(ext)) continue;

      const fileName = buildRemoteAssetFileName(args.label, url, ext);
      const publicPath = `${GENERATED_PUBLIC_PREFIX}/${fileName}`;
      if (await generatedFileExists(fileName)) {
        return { path: publicPath, sourceUrl: url };
      }
      await writeGeneratedFile(fileName, fetched.buffer);
      return { path: publicPath, sourceUrl: url };
    } catch {
      continue;
    }
  }
  return null;
}

export async function ensureTracedFlatItemGlb(args: {
  imageUrls: string[];
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  material: string;
  label: string;
}): Promise<{
  path: string;
  sourceUrl: string | null;
  traceScore: number | null;
  traceDebug: FlatItemLookupTraceDebug | null;
}> {
  const candidates = args.imageUrls.slice(0, 6);
  let best: { shape: THREE.Shape; score: number; sourceUrl: string; traceDebug: FlatItemLookupTraceDebug } | null = null;
  let bestDebug: FlatItemLookupTraceDebug | null = null;

  for (const imageUrl of candidates) {
    try {
      const candidate = await buildTraceCandidate(imageUrl, args.widthMm, args.heightMm);
      if (!bestDebug || candidate.debug.traceScore > bestDebug.traceScore) {
        bestDebug = candidate.debug;
      }
      if (!candidate.shape || !candidate.debug.accepted) continue;
      if (!best || candidate.score > best.score) {
        best = {
          shape: candidate.shape,
          score: candidate.score,
          sourceUrl: imageUrl,
          traceDebug: candidate.debug,
        };
      }
    } catch {
      continue;
    }
  }

  if (!best) {
    return {
      path: "",
      sourceUrl: bestDebug?.sourceImageUrl ?? null,
      traceScore: bestDebug?.traceScore ?? null,
      traceDebug: bestDebug,
    };
  }

  const hash = createHash("sha1")
    .update(`${best.sourceUrl}|${round2(args.widthMm)}|${round2(args.heightMm)}|${round2(args.thicknessMm)}`)
    .digest("hex")
    .slice(0, 10);
  const fileName = `${sanitizeSlug(args.label)}-trace-${hash}.glb`;
  const publicPath = `${GENERATED_PUBLIC_PREFIX}/${fileName}`;
  if (await generatedFileExists(fileName)) {
    return { path: publicPath, sourceUrl: best.sourceUrl, traceScore: round2(best.score), traceDebug: best.traceDebug };
  }

  const scene = buildSceneFromShape({
    shape: best.shape,
    thicknessMm: args.thicknessMm,
    material: args.material,
    label: args.label,
  });
  const arrayBuffer = await exportSceneToGlb(scene);
  await writeGeneratedFile(fileName, Buffer.from(arrayBuffer));
  return { path: publicPath, sourceUrl: best.sourceUrl, traceScore: round2(best.score), traceDebug: best.traceDebug };
}

export async function ensureGeneratedFlatItemGlb(args: {
  familyKey: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  material: string;
  label: string;
}): Promise<string> {
  const safeFile = `${sanitizeSlug(args.familyKey)}-proxy-v2-${round2(args.widthMm)}x${round2(args.heightMm)}x${round2(args.thicknessMm)}-${sanitizeSlug(args.material)}.glb`;
  const publicPath = `${GENERATED_PUBLIC_PREFIX}/${safeFile}`;
  if (await generatedFileExists(safeFile)) {
    return publicPath;
  }

  const scene = buildFlatItemScene(args);
  const arrayBuffer = await exportSceneToGlb(scene);
  await writeGeneratedFile(safeFile, Buffer.from(arrayBuffer));
  return publicPath;
}
