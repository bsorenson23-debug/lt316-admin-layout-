import type {
  EditableBodyOutline,
  EditableBodyOutlineContourPoint,
  EditableBodyOutlinePoint,
  EditableOutlineHandle,
  EditableOutlinePointType,
  ReferenceLayerKey,
  ReferenceLayerState,
  ReferencePaths,
} from "@/types/productTemplate";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";

export interface ImportedEditableBodyOutlineSource {
  svgText: string;
  pathData: string;
  viewport: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  contour: EditableBodyOutlineContourPoint[];
}

type CreateOutlineArgs = {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  topOuterDiameterMm?: number | null;
  baseDiameterMm?: number | null;
  shoulderDiameterMm?: number | null;
  taperUpperDiameterMm?: number | null;
  taperLowerDiameterMm?: number | null;
  bevelDiameterMm?: number | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
};

type ImportOutlineArgs = {
  source: ImportedEditableBodyOutlineSource;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  topOuterDiameterMm?: number | null;
  scalePct?: number;
  widthScalePct?: number;
  heightScalePct?: number;
  offsetYMm?: number;
  side?: "left" | "right";
};

type DerivedOutlineDimensions = {
  bodyTopFromOverallMm?: number;
  bodyBottomFromOverallMm?: number;
  diameterMm?: number;
  topOuterDiameterMm?: number;
  baseDiameterMm?: number;
  shoulderDiameterMm?: number;
  taperUpperDiameterMm?: number;
  taperLowerDiameterMm?: number;
  bevelDiameterMm?: number;
};

const DEFAULT_LAYER_VISIBILITY: Record<ReferenceLayerKey, boolean> = {
  bodyOutline: true,
  lidProfile: true,
  silverProfile: true,
};

const DEFAULT_LAYER_LOCKS: Record<ReferenceLayerKey, boolean> = {
  bodyOutline: false,
  lidProfile: false,
  silverProfile: false,
};

const ROLE_ORDER: Array<EditableBodyOutlinePoint["role"]> = [
  "topOuter",
  "body",
  "shoulder",
  "upperTaper",
  "lowerTaper",
  "bevel",
  "base",
  "custom",
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix = "outline"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneHandle(handle?: EditableOutlineHandle | null): EditableOutlineHandle | null {
  return handle ? { x: handle.x, y: handle.y } : null;
}

function roleIndex(role?: EditableBodyOutlinePoint["role"]): number {
  const index = ROLE_ORDER.indexOf(role ?? "custom");
  return index >= 0 ? index : ROLE_ORDER.length;
}

function getBounds(points: EditableBodyOutlineContourPoint[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function buildContourSvgPath(points: Array<{ x: number; y: number }>): string | null {
  if (points.length < 3) return null;
  return `M ${points
    .map((point, index) => `${index === 0 ? "" : "L "}${round1(point.x)} ${round1(point.y)}`)
    .join(" ")} Z`;
}

function getRolePoint(points: EditableBodyOutlinePoint[], role: EditableBodyOutlinePoint["role"]) {
  return points.find((point) => point.role === role) ?? null;
}

function widthForRole(points: EditableBodyOutlinePoint[], role: EditableBodyOutlinePoint["role"]) {
  const point = getRolePoint(points, role);
  return point ? round1(point.x * 2) : undefined;
}

function nearestHalfWidthAtY(contour: EditableBodyOutlineContourPoint[], y: number): number {
  if (contour.length === 0) return 0;
  const window = Math.max(2, (Math.max(...contour.map((point) => point.y)) - Math.min(...contour.map((point) => point.y))) * 0.015);
  const matching = contour.filter((point) => Math.abs(point.y - y) <= window);
  const source = matching.length > 0 ? matching : contour;
  const widths = source.map((point) => Math.abs(point.x));
  return round1(Math.max(...widths));
}

function buildProfilePointsFromContour(args: {
  contour: EditableBodyOutlineContourPoint[];
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
}): EditableBodyOutlinePoint[] {
  const { contour, bodyTopFromOverallMm, bodyBottomFromOverallMm } = args;
  const bodyHeight = Math.max(10, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const anchors: Array<{ role: EditableBodyOutlinePoint["role"]; y: number }> = [
    { role: "topOuter", y: bodyTopFromOverallMm },
    { role: "body", y: bodyTopFromOverallMm + bodyHeight * 0.14 },
    { role: "shoulder", y: bodyTopFromOverallMm + bodyHeight * 0.58 },
    { role: "upperTaper", y: bodyTopFromOverallMm + bodyHeight * 0.72 },
    { role: "lowerTaper", y: bodyTopFromOverallMm + bodyHeight * 0.86 },
    { role: "bevel", y: bodyTopFromOverallMm + bodyHeight * 0.96 },
    { role: "base", y: bodyBottomFromOverallMm },
  ];

  return anchors.map(({ role, y }) => {
    const x = nearestHalfWidthAtY(contour, y);
    return {
      id: makeId(role ?? "point"),
      x,
      y: round1(y),
      inHandle: null,
      outHandle: null,
      pointType: role === "body" || role === "shoulder" ? "smooth" : "corner",
      role,
    };
  });
}

function buildContourFromProfile(points: EditableBodyOutlinePoint[]): EditableBodyOutlineContourPoint[] {
  const sorted = sortEditableOutlinePoints(points);
  const right = sorted.map((point) => ({ x: round1(point.x), y: round1(point.y) }));
  const left = [...sorted]
    .reverse()
    .map((point) => ({ x: round1(-point.x), y: round1(point.y) }));
  return [...right, ...left];
}

function getContourIntersectionsAtY(
  contour: EditableBodyOutlineContourPoint[],
  y: number,
): number[] {
  if (contour.length < 2) return [];
  const xs: number[] = [];
  for (let index = 0; index < contour.length; index += 1) {
    const current = contour[index];
    const next = contour[(index + 1) % contour.length];
    if (!current || !next) continue;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    if (y < minY || y > maxY) continue;
    if (Math.abs(next.y - current.y) < 0.0001) {
      xs.push(current.x, next.x);
      continue;
    }
    const t = (y - current.y) / (next.y - current.y);
    if (t < 0 || t > 1) continue;
    xs.push(round1(current.x + ((next.x - current.x) * t)));
  }
  return xs;
}

type ContourSegment = {
  leftX: number;
  rightX: number;
  width: number;
  centerX: number;
};

function getContourSegmentsAtY(
  contour: EditableBodyOutlineContourPoint[],
  y: number,
): ContourSegment[] {
  const xs = getContourIntersectionsAtY(contour, y)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const segments: ContourSegment[] = [];

  for (let index = 0; index + 1 < xs.length; index += 2) {
    const leftX = round1(xs[index]!);
    const rightX = round1(xs[index + 1]!);
    const width = round1(rightX - leftX);
    if (width <= 0.1) continue;
    segments.push({
      leftX,
      rightX,
      width,
      centerX: round1((leftX + rightX) / 2),
    });
  }

  return segments;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

function estimateBodyCenterX(contour: EditableBodyOutlineContourPoint[]): number {
  const bounds = getBounds(contour);
  if (!bounds) return 0;

  const sampleCount = Math.max(32, Math.min(180, Math.round(bounds.height * 1.5)));
  const minSampleY = bounds.minY + (bounds.height * 0.08);
  const maxSampleY = bounds.minY + (bounds.height * 0.72);
  const centers: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(minSampleY + ((maxSampleY - minSampleY) * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const bodySegment = segments.reduce((best, segment) =>
      segment.width > best.width ? segment : best,
    );
    centers.push(bodySegment.centerX);
  }

  if (centers.length === 0) {
    return round1((bounds.minX + bounds.maxX) / 2);
  }

  return round1(median(centers));
}

function estimateReferenceWidth(contour: EditableBodyOutlineContourPoint[]): number {
  const bounds = getBounds(contour);
  if (!bounds) return 0;

  const sampleCount = Math.max(18, Math.min(80, Math.round(bounds.height * 0.8)));
  const minSampleY = bounds.minY + (bounds.height * 0.04);
  const maxSampleY = bounds.minY + (bounds.height * 0.22);
  const widths: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(minSampleY + ((maxSampleY - minSampleY) * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const bodySegment = segments.reduce((best, segment) =>
      segment.width > best.width ? segment : best,
    );
    widths.push(bodySegment.width);
  }

  if (widths.length === 0) return bounds.width;
  return Math.max(0.1, round1(median(widths)));
}

function buildMirroredSourceContour(contour: EditableBodyOutlineContourPoint[]): EditableBodyOutlineContourPoint[] | null {
  const bounds = getBounds(contour);
  if (!bounds) return null;
  const sampleCount = Math.max(48, Math.min(220, Math.round(bounds.height * 2)));
  const centerX = estimateBodyCenterX(contour);
  const rows: Array<{
    y: number;
    leftX: number;
    rightX: number;
    leftHalfWidth: number;
    rightHalfWidth: number;
  }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(bounds.minY + (bounds.height * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const bodySegment = segments.reduce((best, segment) => {
      if (segment.width > best.width + 0.1) return segment;
      if (best.width > segment.width + 0.1) return best;
      return Math.abs(segment.centerX - centerX) < Math.abs(best.centerX - centerX) ? segment : best;
    });
    rows.push({
      y,
      leftX: bodySegment.leftX,
      rightX: bodySegment.rightX,
      leftHalfWidth: Math.max(0.1, centerX - bodySegment.leftX),
      rightHalfWidth: Math.max(0.1, bodySegment.rightX - centerX),
    });
  }

  if (rows.length < 8) return null;
  const midBandStartY = bounds.minY + (bounds.height * 0.12);
  const midBandEndY = bounds.minY + (bounds.height * 0.88);
  const midBandRows = rows.filter((row) => row.y >= midBandStartY && row.y <= midBandEndY);
  const leftBand = midBandRows.map((row) => row.leftHalfWidth).filter((value) => value > 0);
  const rightBand = midBandRows.map((row) => row.rightHalfWidth).filter((value) => value > 0);
  const leftSpread = percentile(leftBand, 0.9);
  const rightSpread = percentile(rightBand, 0.9);
  const sourceSide = rightSpread > leftSpread * 1.06 ? "left" : leftSpread > rightSpread * 1.06 ? "right" : "left";

  const left = rows.map((row) => ({
    x: round1(sourceSide === "left" ? row.leftX : (2 * centerX) - row.rightX),
    y: row.y,
  }));
  const right = [...rows].reverse().map((row) => ({
    x: round1(sourceSide === "left" ? (2 * centerX) - row.leftX : row.rightX),
    y: row.y,
  }));

  return [...left, ...right];
}

function parsePathContour(path: SVGGeometryElement, sampleCount = 240): EditableBodyOutlineContourPoint[] {
  const totalLength = typeof path.getTotalLength === "function" ? path.getTotalLength() : 0;
  const count = Math.max(24, Math.min(600, Math.round(totalLength / 3) || sampleCount));
  const points: EditableBodyOutlineContourPoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const point = path.getPointAtLength((totalLength * index) / count);
    points.push({ x: round1(point.x), y: round1(point.y) });
  }

  if (points.length > 0) {
    points.push({ ...points[0] });
  }

  return points;
}

function splitPathSubpaths(pathData: string): string[] {
  const matches = pathData.match(/[Mm][^Mm]*/g);
  if (!matches || matches.length === 0) return pathData.trim() ? [pathData] : [];
  return matches
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function ensureSvgGeometryElement(element: Element): element is SVGGeometryElement {
  return typeof (element as SVGGeometryElement).getTotalLength === "function";
}

function parseImportedSvg(svgText: string): ImportedEditableBodyOutlineSource {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    throw new Error("SVG outline import requires a browser environment.");
  }

  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(svgText, "image/svg+xml");
  const parsedSvg = documentRoot.documentElement;
  if (!parsedSvg || parsedSvg.nodeName.toLowerCase() !== "svg") {
    throw new Error("SVG outline import requires a valid SVG document.");
  }

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.style.width = "1px";
  host.style.height = "1px";
  host.style.pointerEvents = "none";
  host.style.opacity = "0";

  const liveSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const widthAttr = parsedSvg.getAttribute("width");
  const heightAttr = parsedSvg.getAttribute("height");
  const viewBox = parsedSvg.getAttribute("viewBox");
  if (widthAttr) liveSvg.setAttribute("width", widthAttr);
  if (heightAttr) liveSvg.setAttribute("height", heightAttr);
  if (viewBox) liveSvg.setAttribute("viewBox", viewBox);
  liveSvg.innerHTML = parsedSvg.innerHTML;
  host.appendChild(liveSvg);
  document.body.appendChild(host);

  try {
    const viewportFromViewBox = (() => {
      if (!viewBox) return null;
      const values = viewBox
        .trim()
        .split(/[\s,]+/)
        .map((value) => Number.parseFloat(value))
        .filter(Number.isFinite);
      if (values.length !== 4) return null;
      return {
        minX: round1(values[0] ?? 0),
        minY: round1(values[1] ?? 0),
        width: Math.max(0.1, round1(values[2] ?? 0)),
        height: Math.max(0.1, round1(values[3] ?? 0)),
      };
    })();
    const viewportFromDimensions = (() => {
      const width = Number.parseFloat(widthAttr ?? "");
      const height = Number.parseFloat(heightAttr ?? "");
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
      }
      return {
        minX: 0,
        minY: 0,
        width: round1(width),
        height: round1(height),
      };
    })();

    const geometryCandidates = Array.from(
      liveSvg.querySelectorAll("path, rect, circle, ellipse, polygon"),
    ).filter(ensureSvgGeometryElement);

    if (geometryCandidates.length === 0) {
      throw new Error("SVG does not contain a supported closed outline path.");
    }

    let bestElement: SVGGeometryElement | null = null;
    let bestArea = Number.NEGATIVE_INFINITY;

    for (const candidate of geometryCandidates) {
      const bbox = candidate.getBBox();
      const area = bbox.width * bbox.height;
      if (area > bestArea && bbox.width > 0 && bbox.height > 0) {
        bestArea = area;
        bestElement = candidate;
      }
    }

    if (!bestElement) {
      throw new Error("SVG body outline could not be resolved.");
    }

    let resolvedElement: SVGGeometryElement = bestElement;
    let resolvedPathData =
      bestElement.tagName.toLowerCase() === "path"
        ? bestElement.getAttribute("d") ?? ""
        : "";

    if (bestElement.tagName.toLowerCase() === "path" && resolvedPathData) {
      const subpaths = splitPathSubpaths(resolvedPathData);
      if (subpaths.length > 1) {
        let bestSubpathElement: SVGGeometryElement | null = null;
        let bestSubpathData = resolvedPathData;
        let bestSubpathArea = Number.NEGATIVE_INFINITY;
        const tempPaths: SVGGeometryElement[] = [];

        for (const subpath of subpaths) {
          const candidate = document.createElementNS("http://www.w3.org/2000/svg", "path");
          candidate.setAttribute("d", subpath);
          liveSvg.appendChild(candidate);
          tempPaths.push(candidate);
          const bbox = candidate.getBBox();
          const area = bbox.width * bbox.height;
          if (bbox.width > 0 && bbox.height > 0 && area > bestSubpathArea) {
            bestSubpathArea = area;
            bestSubpathElement = candidate;
            bestSubpathData = subpath;
          }
        }

        if (bestSubpathElement) {
          resolvedElement = bestSubpathElement;
          resolvedPathData = bestSubpathData;
        }

        for (const candidate of tempPaths) {
          if (candidate !== bestSubpathElement) {
            candidate.remove();
          }
        }
      }
    }

    const contour = parsePathContour(resolvedElement);
    const bounds = getBounds(contour);
    if (!bounds) {
      throw new Error("SVG body outline did not produce a usable contour.");
    }
    const viewport = viewportFromViewBox
      ?? viewportFromDimensions
      ?? {
        minX: bounds.minX,
        minY: bounds.minY,
        width: bounds.width,
        height: bounds.height,
      };

    return {
      svgText,
      pathData: resolvedPathData,
      viewport,
      bounds,
      contour,
    };
  } finally {
    host.remove();
  }
}

export function createDefaultReferenceLayerState(): ReferenceLayerState {
  return {
    activeLayer: "bodyOutline",
    visibility: { ...DEFAULT_LAYER_VISIBILITY },
    locked: { ...DEFAULT_LAYER_LOCKS },
  };
}

export function cloneReferenceLayerState(
  state?: ReferenceLayerState | null,
): ReferenceLayerState {
  const source = state ?? createDefaultReferenceLayerState();
  return {
    activeLayer: source.activeLayer ?? "bodyOutline",
    visibility: {
      ...DEFAULT_LAYER_VISIBILITY,
      ...(source.visibility ?? {}),
    },
    locked: {
      ...DEFAULT_LAYER_LOCKS,
      ...(source.locked ?? {}),
    },
  };
}

export function createReferencePaths(paths?: Partial<ReferencePaths> | null): ReferencePaths {
  return {
    bodyOutline: paths?.bodyOutline ?? null,
    lidProfile: paths?.lidProfile ?? null,
    silverProfile: paths?.silverProfile ?? null,
  };
}

export function cloneEditableBodyOutline(
  outline?: EditableBodyOutline | null,
): EditableBodyOutline | undefined {
  if (!outline) return undefined;
  return {
    closed: outline.closed,
    version: 1,
    points: outline.points.map((point) => ({
      ...point,
      inHandle: cloneHandle(point.inHandle),
      outHandle: cloneHandle(point.outHandle),
    })),
    directContour: outline.directContour?.map((point) => ({ ...point })),
    sourceContour: outline.sourceContour?.map((point) => ({ ...point })),
    sourceContourBounds: outline.sourceContourBounds ? { ...outline.sourceContourBounds } : undefined,
    sourceContourViewport: outline.sourceContourViewport ? { ...outline.sourceContourViewport } : undefined,
  };
}

export function sortEditableOutlinePoints(points: EditableBodyOutlinePoint[]): EditableBodyOutlinePoint[] {
  return [...points].sort((a, b) => {
    const deltaY = a.y - b.y;
    if (Math.abs(deltaY) > 0.05) return deltaY;
    return roleIndex(a.role) - roleIndex(b.role);
  });
}

export function createEditableBodyOutline(args: CreateOutlineArgs): EditableBodyOutline {
  const bodyTop = round1(args.bodyTopFromOverallMm);
  const bodyBottom = round1(args.bodyBottomFromOverallMm);
  const bodyHeight = Math.max(10, bodyBottom - bodyTop);
  const bodyDiameter = round1(args.diameterMm);
  const topOuterDiameter = round1(args.topOuterDiameterMm ?? Math.max(args.diameterMm, bodyDiameter));
  const baseDiameter = round1(args.baseDiameterMm ?? Math.max(20, bodyDiameter * 0.78));
  const shoulderDiameter = round1(args.shoulderDiameterMm ?? Math.max(baseDiameter, bodyDiameter * 0.98));
  const taperUpperDiameter = round1(args.taperUpperDiameterMm ?? Math.max(baseDiameter, shoulderDiameter * 0.88));
  const taperLowerDiameter = round1(args.taperLowerDiameterMm ?? Math.max(baseDiameter, taperUpperDiameter * 0.76));
  const bevelDiameter = round1(args.bevelDiameterMm ?? Math.max(baseDiameter, taperLowerDiameter * 0.92));

  const pointDefs: Array<Omit<EditableBodyOutlinePoint, "id" | "inHandle" | "outHandle">> = [
    { role: "topOuter", x: topOuterDiameter / 2, y: bodyTop, pointType: "corner" },
    { role: "body", x: bodyDiameter / 2, y: round1(bodyTop + bodyHeight * 0.14), pointType: "smooth" },
    { role: "shoulder", x: shoulderDiameter / 2, y: round1(bodyTop + bodyHeight * 0.58), pointType: "smooth" },
    { role: "upperTaper", x: taperUpperDiameter / 2, y: round1(bodyTop + bodyHeight * 0.72), pointType: "corner" },
    { role: "lowerTaper", x: taperLowerDiameter / 2, y: round1(bodyTop + bodyHeight * 0.86), pointType: "corner" },
    { role: "bevel", x: bevelDiameter / 2, y: round1(bodyTop + bodyHeight * 0.96), pointType: "corner" },
    { role: "base", x: baseDiameter / 2, y: bodyBottom, pointType: "corner" },
  ];

  const points = pointDefs.map((point) => ({
    ...point,
    id: makeId(point.role ?? "point"),
    inHandle: null,
    outHandle: null,
  }));

  return {
    closed: true,
    version: 1,
    points,
    directContour: buildContourFromProfile(points),
  };
}

export function createEditableBodyOutlineFromImportedSvg(args: ImportOutlineArgs): EditableBodyOutline {
  const {
    source,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    topOuterDiameterMm,
    scalePct = 100,
    widthScalePct = 100,
    heightScalePct = 100,
    offsetYMm = 0,
    side = "right",
  } = args;
  const sourceContour = source.contour;
  const mirroredSourceContour = buildMirroredSourceContour(sourceContour);
  const bodySourceContour = mirroredSourceContour ?? sourceContour;
  const bounds = getBounds(bodySourceContour) ?? getBounds(sourceContour) ?? source.bounds;
  const referenceDiameterMm = round1(topOuterDiameterMm && topOuterDiameterMm > 0 ? topOuterDiameterMm : diameterMm);
  const targetBodyHeightMm = Math.max(10, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const scaleFactor = scalePct / 100;
  const referenceSourceWidth = estimateReferenceWidth(bodySourceContour);
  const scaleX = (referenceDiameterMm / Math.max(0.1, referenceSourceWidth)) * (widthScalePct / 100) * scaleFactor;
  const scaleY = (targetBodyHeightMm / Math.max(1, bounds.height)) * (heightScalePct / 100) * scaleFactor;
  const centerX = estimateBodyCenterX(bodySourceContour);
  const minY = bounds.minY;
  const sign = side === "left" ? -1 : 1;

  const rawContour = bodySourceContour.map((point) => ({
    x: round1(((point.x - centerX) * scaleX) * sign),
    y: round1(bodyTopFromOverallMm + ((point.y - minY) * scaleY) + offsetYMm),
  }));

  const clippedContour = rawContour.filter((point) =>
    point.y >= bodyTopFromOverallMm - 2 && point.y <= bodyBottomFromOverallMm + 2,
  );
  const bodyContour = clippedContour.length >= 8 ? clippedContour : rawContour;
  const contour = bodyContour;
  const points = buildProfilePointsFromContour({
    contour,
    bodyTopFromOverallMm: round1(bodyTopFromOverallMm + offsetYMm),
    bodyBottomFromOverallMm: round1(bodyBottomFromOverallMm + offsetYMm),
  });

  return {
    closed: true,
    version: 1,
    points,
    directContour: contour,
    sourceContour,
    sourceContourBounds: bounds,
    sourceContourViewport: source.viewport,
  };
}

export function createEditableBodyOutlineFromSeedSvgText(args: {
  svgText: string;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  topOuterDiameterMm?: number | null;
  side?: "left" | "right";
}): { source: ImportedEditableBodyOutlineSource; outline: EditableBodyOutline } {
  const source = parseImportedSvg(args.svgText);
  const outline = createEditableBodyOutlineFromImportedSvg({
    source,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    diameterMm: args.diameterMm,
    topOuterDiameterMm: args.topOuterDiameterMm,
    side: args.side,
  });
  return { source, outline };
}

export function buildDirectContourSvgPath(args: {
  outline: EditableBodyOutline;
  centerXPx: number;
  pxPerMm: number;
}): string | null {
  const contour = args.outline.directContour;
  if (!contour || contour.length < 3) return null;
  const points = contour.map((point) => ({
    x: args.centerXPx + (point.x * args.pxPerMm),
    y: point.y * args.pxPerMm,
  }));
  return buildContourSvgPath(points);
}

export function buildMirroredOutlineSvgPath(args: {
  outline: EditableBodyOutline;
  centerXPx: number;
  pxPerMm: number;
}): string | null {
  const sorted = sortEditableOutlinePoints(args.outline.points);
  if (sorted.length < 2) return null;
  const right = sorted.map((point) => ({
    x: args.centerXPx + (point.x * args.pxPerMm),
    y: point.y * args.pxPerMm,
  }));
  const left = [...sorted].reverse().map((point) => ({
    x: args.centerXPx - (point.x * args.pxPerMm),
    y: point.y * args.pxPerMm,
  }));
  return buildContourSvgPath([...right, ...left]);
}

export function deriveDimensionsFromEditableBodyOutline(
  outline?: EditableBodyOutline | null,
): DerivedOutlineDimensions {
  if (!outline || outline.points.length === 0) return {};
  const sorted = sortEditableOutlinePoints(outline.points);
  const bodyTopFromOverallMm = round1(sorted[0]?.y ?? 0);
  const bodyBottomFromOverallMm = round1(sorted[sorted.length - 1]?.y ?? bodyTopFromOverallMm);

  return {
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm: widthForRole(sorted, "body") ?? widthForRole(sorted, "topOuter"),
    topOuterDiameterMm: widthForRole(sorted, "topOuter"),
    baseDiameterMm: widthForRole(sorted, "base"),
    shoulderDiameterMm: widthForRole(sorted, "shoulder"),
    taperUpperDiameterMm: widthForRole(sorted, "upperTaper"),
    taperLowerDiameterMm: widthForRole(sorted, "lowerTaper"),
    bevelDiameterMm: widthForRole(sorted, "bevel"),
  };
}

export function insertEditableOutlinePoint(
  outline: EditableBodyOutline,
  segmentIndex: number,
): EditableBodyOutline {
  const sorted = sortEditableOutlinePoints(outline.points);
  const current = sorted[segmentIndex];
  const next = sorted[(segmentIndex + 1) % sorted.length];
  if (!current || !next) return outline;
  const inserted: EditableBodyOutlinePoint = {
    id: makeId("custom"),
    x: round1((current.x + next.x) / 2),
    y: round1((current.y + next.y) / 2),
    inHandle: null,
    outHandle: null,
    pointType: "corner",
    role: "custom",
  };
  return {
    ...outline,
    points: sortEditableOutlinePoints([...outline.points, inserted]),
  };
}

export function removeEditableOutlinePoint(
  outline: EditableBodyOutline,
  pointId: string,
): EditableBodyOutline {
  if (outline.points.length <= 4) return outline;
  const nextPoints = outline.points.filter((point) => point.id !== pointId);
  if (nextPoints.length === outline.points.length) return outline;
  return {
    ...outline,
    points: sortEditableOutlinePoints(nextPoints),
  };
}

export function convertEditableOutlinePointType(
  outline: EditableBodyOutline,
  pointId: string,
  pointType: EditableOutlinePointType,
): EditableBodyOutline {
  return {
    ...outline,
    points: outline.points.map((point) => {
      if (point.id !== pointId) return point;
      return {
        ...point,
        pointType,
        inHandle: pointType === "corner" ? null : point.inHandle ?? { x: point.x, y: round1(point.y - 6) },
        outHandle: pointType === "corner" ? null : point.outHandle ?? { x: point.x, y: round1(point.y + 6) },
      };
    }),
  };
}
