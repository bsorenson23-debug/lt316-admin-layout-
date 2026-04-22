import type {
  EditableBodyOutline,
  EditableBodyOutlineContourPoint,
  EditableBodyOutlinePoint,
  EditableOutlineHandle,
  NormalizedMeasurementContour,
  EditableOutlinePointType,
  ReferenceLayerKey,
  ReferenceLayerState,
  ReferencePaths,
} from "@/types/productTemplate";
import type { FlatItemLookupTraceDebug } from "@/types/flatItemLookup";
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
  matchedProfileId?: string | null;
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
  matchedProfileId?: string | null;
  topOuterDiameterMm?: number | null;
  baseDiameterMm?: number | null;
  shoulderDiameterMm?: number | null;
  taperUpperDiameterMm?: number | null;
  taperLowerDiameterMm?: number | null;
  bevelDiameterMm?: number | null;
  scalePct?: number;
  widthScalePct?: number;
  heightScalePct?: number;
  offsetYMm?: number;
  side?: "left" | "right";
  sourceMode?: "auto" | "body-only";
};

type TraceImportArgs = {
  traceDebug: FlatItemLookupTraceDebug;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  matchedProfileId?: string | null;
  topOuterDiameterMm?: number | null;
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

type SeededOutlineRole =
  | "topOuter"
  | "body"
  | "shoulder"
  | "upperTaper"
  | "lowerTaper"
  | "bevel"
  | "base";

type KnownTumblerOutlineFamily = "stanley-quencher" | "stanley-iceflow" | "yeti-rambler";

type KnownTumblerOutlinePreset = {
  family: KnownTumblerOutlineFamily;
  anchorYRatios: Record<SeededOutlineRole, number>;
  widthRatios: Record<SeededOutlineRole, number>;
  traceNudgeMm: Record<SeededOutlineRole, number>;
  upperTraceWidthClampRatio: number;
  shoulderTraceWidthClampRatio: number;
  rowSmoothingRadius: number;
  bodySeedStartMinWidthRatio: number;
  bodySeedStartMaxWidthRatio: number;
  bodySeedMinStartRatio: number;
};

const KNOWN_TUMBLER_OUTLINE_PRESETS: Record<KnownTumblerOutlineFamily, KnownTumblerOutlinePreset> = {
  "stanley-quencher": {
    family: "stanley-quencher",
    anchorYRatios: {
      topOuter: 0,
      body: 0.1,
      shoulder: 0.28,
      upperTaper: 0.66,
      lowerTaper: 0.84,
      bevel: 0.95,
      base: 1,
    },
    widthRatios: {
      topOuter: 0.86,
      body: 0.96,
      shoulder: 0.99,
      upperTaper: 0.93,
      lowerTaper: 0.82,
      bevel: 0.76,
      base: 0.79,
    },
    traceNudgeMm: {
      topOuter: 1.4,
      body: 1.8,
      shoulder: 2.2,
      upperTaper: 2.4,
      lowerTaper: 2.6,
      bevel: 2.1,
      base: 1.5,
    },
    upperTraceWidthClampRatio: 0.96,
    shoulderTraceWidthClampRatio: 1.02,
    rowSmoothingRadius: 2,
    bodySeedStartMinWidthRatio: 0.9,
    bodySeedStartMaxWidthRatio: 1.04,
    bodySeedMinStartRatio: 0.24,
  },
  "stanley-iceflow": {
    family: "stanley-iceflow",
    anchorYRatios: {
      topOuter: 0,
      body: 0.09,
      shoulder: 0.24,
      upperTaper: 0.7,
      lowerTaper: 0.87,
      bevel: 0.965,
      base: 1,
    },
    widthRatios: {
      topOuter: 0.92,
      body: 0.985,
      shoulder: 1,
      upperTaper: 0.95,
      lowerTaper: 0.89,
      bevel: 0.84,
      base: 0.86,
    },
    traceNudgeMm: {
      topOuter: 1.4,
      body: 1.8,
      shoulder: 2.0,
      upperTaper: 2.2,
      lowerTaper: 2.2,
      bevel: 1.8,
      base: 1.5,
    },
    upperTraceWidthClampRatio: 0.985,
    shoulderTraceWidthClampRatio: 1.03,
    rowSmoothingRadius: 2,
    bodySeedStartMinWidthRatio: 0.94,
    bodySeedStartMaxWidthRatio: 1.02,
    bodySeedMinStartRatio: 0.3,
  },
  "yeti-rambler": {
    family: "yeti-rambler",
    anchorYRatios: {
      topOuter: 0,
      body: 0.12,
      shoulder: 0.4,
      upperTaper: 0.72,
      lowerTaper: 0.9,
      bevel: 0.975,
      base: 1,
    },
    widthRatios: {
      topOuter: 0.985,
      body: 1,
      shoulder: 1,
      upperTaper: 0.995,
      lowerTaper: 0.985,
      bevel: 0.97,
      base: 1,
    },
    traceNudgeMm: {
      topOuter: 1.1,
      body: 1.2,
      shoulder: 1.2,
      upperTaper: 1.2,
      lowerTaper: 1.1,
      bevel: 0.9,
      base: 0.8,
    },
    upperTraceWidthClampRatio: 1.01,
    shoulderTraceWidthClampRatio: 1.015,
    rowSmoothingRadius: 1,
    bodySeedStartMinWidthRatio: 0.97,
    bodySeedStartMaxWidthRatio: 1.02,
    bodySeedMinStartRatio: 0.08,
  },
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - (2 * t));
}

function resolveKnownTumblerOutlinePreset(
  matchedProfileId?: string | null,
): KnownTumblerOutlinePreset | null {
  if (!matchedProfileId) return null;
  const normalized = matchedProfileId.trim().toLowerCase();
  if (normalized.startsWith("stanley-quencher") || normalized.startsWith("stanley-protour")) {
    return KNOWN_TUMBLER_OUTLINE_PRESETS["stanley-quencher"];
  }
  if (normalized.startsWith("stanley-iceflow")) {
    return KNOWN_TUMBLER_OUTLINE_PRESETS["stanley-iceflow"];
  }
  if (normalized.startsWith("yeti-rambler")) {
    return KNOWN_TUMBLER_OUTLINE_PRESETS["yeti-rambler"];
  }
  return null;
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

function resolveFitDebugAnchorRadius(args: {
  role: EditableBodyOutlinePoint["role"];
  measuredRadiusMm: number;
  seedRadiusMm: number;
}): number {
  const { role, measuredRadiusMm, seedRadiusMm } = args;
  if (!(seedRadiusMm > 0)) {
    return round1(Math.max(0.1, measuredRadiusMm));
  }
  if (!(measuredRadiusMm > 0)) {
    return round1(seedRadiusMm);
  }

  const config = role === "body" || role === "shoulder"
    ? { minRatio: 0.88, maxRatio: 1.12, measuredWeight: 0.55 }
    : role === "upperTaper" || role === "lowerTaper"
      ? { minRatio: 0.78, maxRatio: 1.18, measuredWeight: 0.35 }
      : { minRatio: 0.72, maxRatio: 1.16, measuredWeight: 0.2 };

  if (
    measuredRadiusMm < seedRadiusMm * config.minRatio ||
    measuredRadiusMm > seedRadiusMm * config.maxRatio
  ) {
    return round1(seedRadiusMm);
  }

  return round1(
    (seedRadiusMm * (1 - config.measuredWeight))
    + (measuredRadiusMm * config.measuredWeight),
  );
}

function nearestHalfWidthAtY(contour: EditableBodyOutlineContourPoint[], y: number): number {
  if (contour.length === 0) return 0;
  const bounds = getBounds(contour);
  if (!bounds) return 0;

  const sampleYs = [y];
  const window = Math.max(2, bounds.height * 0.015);
  for (let offset = window * 0.5; offset <= window; offset += window * 0.5) {
    sampleYs.push(y - offset, y + offset);
  }

  const segments = sampleYs
    .flatMap((sampleY) => getContourSegmentsAtY(contour, sampleY))
    .filter((segment) => Number.isFinite(segment.width) && segment.width > 0.1);

  if (segments.length > 0) {
    const centeredSegment = segments.reduce((best, segment) => {
      const bestDistance = Math.abs(best.centerX);
      const segmentDistance = Math.abs(segment.centerX);
      if (segmentDistance < bestDistance - 0.05) return segment;
      if (bestDistance < segmentDistance - 0.05) return best;
      return segment.width < best.width ? segment : best;
    });
    return round1(Math.max(Math.abs(centeredSegment.leftX), Math.abs(centeredSegment.rightX)));
  }

  const matching = contour.filter((point) => Math.abs(point.y - y) <= window);
  const source = matching.length > 0 ? matching : contour;
  const widths = source.map((point) => Math.abs(point.x));
  return round1(Math.max(...widths));
}

type OutlineAnchorDefinition = {
  role: EditableBodyOutlinePoint["role"];
  y: number;
  pointType: EditableOutlinePointType;
  seedHalfWidthMm: number;
};

function buildOutlineAnchorDefinitions(args: {
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  matchedProfileId?: string | null;
  topOuterDiameterMm?: number | null;
  baseDiameterMm?: number | null;
  shoulderDiameterMm?: number | null;
  taperUpperDiameterMm?: number | null;
  taperLowerDiameterMm?: number | null;
  bevelDiameterMm?: number | null;
  forceTopOuterHalfWidthMm?: number | null;
}): OutlineAnchorDefinition[] {
  const preset = resolveKnownTumblerOutlinePreset(args.matchedProfileId);
  const bodyTop = round1(args.bodyTopFromOverallMm);
  const bodyBottom = round1(args.bodyBottomFromOverallMm);
  const bodyHeight = Math.max(10, bodyBottom - bodyTop);
  const bodyDiameter = round1(args.diameterMm);
  const topOuterDiameter = round1(
    args.topOuterDiameterMm && args.topOuterDiameterMm > Math.max(1, bodyDiameter * 0.6)
      ? args.topOuterDiameterMm
      : Math.max(args.diameterMm, bodyDiameter),
  );
  const baseDiameter = round1(args.baseDiameterMm ?? Math.max(20, bodyDiameter * 0.78));
  const shoulderDiameter = round1(args.shoulderDiameterMm ?? Math.max(baseDiameter, bodyDiameter * 0.98));
  const taperUpperDiameter = round1(args.taperUpperDiameterMm ?? Math.max(baseDiameter, shoulderDiameter * 0.88));
  const taperLowerDiameter = round1(args.taperLowerDiameterMm ?? Math.max(baseDiameter, taperUpperDiameter * 0.76));
  const bevelDiameter = round1(args.bevelDiameterMm ?? Math.max(baseDiameter, taperLowerDiameter * 0.92));
  const forcedTopOuterHalfWidthMm =
    args.forceTopOuterHalfWidthMm != null && args.forceTopOuterHalfWidthMm > 0
      ? round1(args.forceTopOuterHalfWidthMm)
      : null;
  if (!preset) {
    return [
      {
        role: "topOuter",
        y: bodyTop,
        pointType: "corner",
        seedHalfWidthMm: forcedTopOuterHalfWidthMm ?? (topOuterDiameter / 2),
      },
      { role: "body", y: round1(bodyTop + bodyHeight * 0.14), pointType: "smooth", seedHalfWidthMm: bodyDiameter / 2 },
      { role: "shoulder", y: round1(bodyTop + bodyHeight * 0.58), pointType: "smooth", seedHalfWidthMm: shoulderDiameter / 2 },
      { role: "upperTaper", y: round1(bodyTop + bodyHeight * 0.72), pointType: "corner", seedHalfWidthMm: taperUpperDiameter / 2 },
      { role: "lowerTaper", y: round1(bodyTop + bodyHeight * 0.86), pointType: "corner", seedHalfWidthMm: taperLowerDiameter / 2 },
      { role: "bevel", y: round1(bodyTop + bodyHeight * 0.96), pointType: "corner", seedHalfWidthMm: bevelDiameter / 2 },
      { role: "base", y: bodyBottom, pointType: "corner", seedHalfWidthMm: baseDiameter / 2 },
    ];
  }

  const referenceHalfWidthMm = bodyDiameter / 2;
  const baseHalfWidthMm = baseDiameter / 2;
  const resolvedHalfWidth = (role: SeededOutlineRole) => {
    if (role === "topOuter" && forcedTopOuterHalfWidthMm != null) {
      return forcedTopOuterHalfWidthMm;
    }
    if (role === "base") return round1(baseHalfWidthMm);
    const ratioBasedHalfWidth = referenceHalfWidthMm * preset.widthRatios[role];
    if (role === "bevel" || role === "lowerTaper" || role === "upperTaper") {
      return round1(Math.max(baseHalfWidthMm, ratioBasedHalfWidth));
    }
    return round1(ratioBasedHalfWidth);
  };

  return [
    { role: "topOuter", y: bodyTop, pointType: "corner", seedHalfWidthMm: resolvedHalfWidth("topOuter") },
    { role: "body", y: round1(bodyTop + bodyHeight * preset.anchorYRatios.body), pointType: "smooth", seedHalfWidthMm: resolvedHalfWidth("body") },
    { role: "shoulder", y: round1(bodyTop + bodyHeight * preset.anchorYRatios.shoulder), pointType: "smooth", seedHalfWidthMm: resolvedHalfWidth("shoulder") },
    { role: "upperTaper", y: round1(bodyTop + bodyHeight * preset.anchorYRatios.upperTaper), pointType: "corner", seedHalfWidthMm: resolvedHalfWidth("upperTaper") },
    { role: "lowerTaper", y: round1(bodyTop + bodyHeight * preset.anchorYRatios.lowerTaper), pointType: "corner", seedHalfWidthMm: resolvedHalfWidth("lowerTaper") },
    { role: "bevel", y: round1(bodyTop + bodyHeight * preset.anchorYRatios.bevel), pointType: "corner", seedHalfWidthMm: resolvedHalfWidth("bevel") },
    { role: "base", y: bodyBottom, pointType: "corner", seedHalfWidthMm: resolvedHalfWidth("base") },
  ];
}

function constrainKnownProfileHalfWidth(args: {
  matchedProfileId?: string | null;
  role: EditableBodyOutlinePoint["role"];
  measuredHalfWidthMm: number;
  seedHalfWidthMm: number;
}): number {
  const preset = resolveKnownTumblerOutlinePreset(args.matchedProfileId);
  if (!preset) {
    return round1(Math.max(0.1, args.measuredHalfWidthMm));
  }
  const maxNudgeMm = preset.traceNudgeMm[args.role as SeededOutlineRole] ?? 1.5;
  return round1(clamp(
    args.measuredHalfWidthMm,
    Math.max(0.1, args.seedHalfWidthMm - maxNudgeMm),
    args.seedHalfWidthMm + maxNudgeMm,
  ));
}

function buildProfilePointsFromContour(args: {
  contour: EditableBodyOutlineContourPoint[];
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  matchedProfileId?: string | null;
  topOuterHalfWidthMm?: number;
  baseDiameterMm?: number | null;
  shoulderDiameterMm?: number | null;
  taperUpperDiameterMm?: number | null;
  taperLowerDiameterMm?: number | null;
  bevelDiameterMm?: number | null;
}): EditableBodyOutlinePoint[] {
  const {
    contour,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    matchedProfileId,
    topOuterHalfWidthMm,
    baseDiameterMm,
    shoulderDiameterMm,
    taperUpperDiameterMm,
    taperLowerDiameterMm,
    bevelDiameterMm,
  } = args;
  const anchors = buildOutlineAnchorDefinitions({
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    matchedProfileId,
    topOuterDiameterMm: topOuterHalfWidthMm != null ? topOuterHalfWidthMm * 2 : undefined,
    baseDiameterMm,
    shoulderDiameterMm,
    taperUpperDiameterMm,
    taperLowerDiameterMm,
    bevelDiameterMm,
    forceTopOuterHalfWidthMm: topOuterHalfWidthMm ?? null,
  });

  return anchors.map(({ role, y, pointType, seedHalfWidthMm }) => {
    const tracedHalfWidth = nearestHalfWidthAtY(contour, y);
    const x =
      role === "topOuter" && topOuterHalfWidthMm != null
        ? round1(topOuterHalfWidthMm)
        : matchedProfileId
      ? constrainKnownProfileHalfWidth({
          matchedProfileId,
          role,
          measuredHalfWidthMm: tracedHalfWidth,
          seedHalfWidthMm,
        })
      : role === "topOuter" && topOuterHalfWidthMm != null
        ? round1(Math.max(tracedHalfWidth, topOuterHalfWidthMm))
        : tracedHalfWidth;
    return {
      id: makeId(role ?? "point"),
      x,
      y: round1(y),
      inHandle: null,
      outHandle: null,
      pointType,
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

function buildSmoothedContourFromProfile(
  points: EditableBodyOutlinePoint[],
  samplesPerSegment = 8,
): EditableBodyOutlineContourPoint[] {
  const sorted = sortEditableOutlinePoints(points);
  if (sorted.length < 2) {
    return buildContourFromProfile(points);
  }

  const rightSide: EditableBodyOutlineContourPoint[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;
    const count = Math.max(2, samplesPerSegment);
    for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
      if (index > 0 && sampleIndex === 0) continue;
      const t = sampleIndex / count;
      const eased = smoothstep(t);
      rightSide.push({
        x: round1(current.x + ((next.x - current.x) * eased)),
        y: round1(current.y + ((next.y - current.y) * t)),
      });
    }
  }
  const lastPoint = sorted[sorted.length - 1]!;
  rightSide.push({ x: round1(lastPoint.x), y: round1(lastPoint.y) });

  const leftSide = [...rightSide]
    .reverse()
    .map((point) => ({ x: round1(-point.x), y: point.y }));
  return [...rightSide, ...leftSide];
}

export function resolveEditableBodyOutlineDirectContour(
  outline: EditableBodyOutline | null | undefined,
): EditableBodyOutlineContourPoint[] | null {
  if (!outline) return null;
  const hasSourceContour = Boolean(outline.sourceContour && outline.sourceContour.length >= 3);
  if (!hasSourceContour && outline.points.length >= 2) {
    return buildSmoothedContourFromProfile(outline.points);
  }
  if (outline.directContour && outline.directContour.length >= 3) {
    return outline.directContour;
  }
  if (outline.points.length >= 2) {
    return buildSmoothedContourFromProfile(outline.points);
  }
  return null;
}

function interpolateFitDebugRadius(
  profilePoints: TumblerItemLookupFitDebug["profilePoints"],
  yMm: number,
): number {
  const sorted = [...profilePoints]
    .filter((point) => Number.isFinite(point.yMm) && Number.isFinite(point.radiusMm))
    .sort((a, b) => a.yMm - b.yMm);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return round1(sorted[0]!.radiusMm);

  const clampedY = clamp(yMm, sorted[0]!.yMm, sorted[sorted.length - 1]!.yMm);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;
    if (clampedY < current.yMm || clampedY > next.yMm) continue;
    const span = next.yMm - current.yMm;
    if (Math.abs(span) < 0.001) return round1(current.radiusMm);
    const t = (clampedY - current.yMm) / span;
    return round1(current.radiusMm + ((next.radiusMm - current.radiusMm) * t));
  }

  return round1(sorted[sorted.length - 1]!.radiusMm);
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

function sampleHalfWidthFromContour(
  contour: EditableBodyOutlineContourPoint[],
  centerX: number,
  y: number,
): number {
  const segments = getContourSegmentsAtY(contour, y);
  if (segments.length === 0) {
    return nearestHalfWidthAtY(
      contour.map((point) => ({ x: round1(point.x - centerX), y: point.y })),
      y,
    );
  }

  const bodySegment = segments.reduce((best, segment) => {
    const bestDistance = Math.abs(best.centerX - centerX);
    const segmentDistance = Math.abs(segment.centerX - centerX);
    if (segmentDistance < bestDistance - 0.05) return segment;
    if (bestDistance < segmentDistance - 0.05) return best;
    return segment.width > best.width ? segment : best;
  });

  return round1(Math.max(centerX - bodySegment.leftX, bodySegment.rightX - centerX));
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

function computeHalfWidthRoughness(values: number[]): number {
  if (values.length < 3) return Number.POSITIVE_INFINITY;
  const deltas: number[] = [];
  const curvature: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    deltas.push(Math.abs(values[index]! - values[index - 1]!));
  }
  for (let index = 1; index < deltas.length; index += 1) {
    curvature.push(Math.abs(deltas[index]! - deltas[index - 1]!));
  }

  return percentile(deltas, 0.9) + (percentile(curvature, 0.9) * 1.5);
}

function estimateBodyCenterX(contour: EditableBodyOutlineContourPoint[]): number {
  const bounds = getBounds(contour);
  if (!bounds) return 0;

  const sampleRanges: Array<[number, number]> = [
    [0.04, 0.22],
    [0.74, 0.98],
  ];
  const sampleCount = Math.max(18, Math.min(64, Math.round(bounds.height * 0.18)));
  const centers: number[] = [];

  for (const [startRatio, endRatio] of sampleRanges) {
    const minSampleY = bounds.minY + (bounds.height * startRatio);
    const maxSampleY = bounds.minY + (bounds.height * endRatio);

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

function selectCenteredContourSegment(
  segments: ContourSegment[],
  centerX: number,
): ContourSegment {
  return segments.reduce((best, segment) => {
    const bestDistance = Math.abs(best.centerX - centerX);
    const segmentDistance = Math.abs(segment.centerX - centerX);
    if (segmentDistance < bestDistance - 0.25) return segment;
    if (bestDistance < segmentDistance - 0.25) return best;
    if (segment.width < best.width - 0.25) return segment;
    if (best.width < segment.width - 0.25) return best;
    return segment;
  });
}

function smoothNumericSeries(values: number[], radius: number): number[] {
  if (values.length <= 2 || radius <= 0) {
    return values.map((value) => round1(value));
  }
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    let total = 0;
    let count = 0;
    for (let cursor = start; cursor <= end; cursor += 1) {
      total += values[cursor] ?? 0;
      count += 1;
    }
    return round1(total / Math.max(1, count));
  });
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
  const leftRoughness = computeHalfWidthRoughness(leftBand);
  const rightRoughness = computeHalfWidthRoughness(rightBand);
  const sourceSide = Number.isFinite(leftRoughness) && Number.isFinite(rightRoughness)
    ? (
      leftRoughness < rightRoughness * 0.92
        ? "left"
        : rightRoughness < leftRoughness * 0.92
          ? "right"
          : rightSpread > leftSpread * 1.06
            ? "left"
            : leftSpread > rightSpread * 1.06
              ? "right"
              : leftRoughness <= rightRoughness
                ? "left"
                : "right"
    )
    : (rightSpread > leftSpread * 1.06 ? "left" : leftSpread > rightSpread * 1.06 ? "right" : "left");

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

function interpolateContourPointAtY(
  start: EditableBodyOutlineContourPoint,
  end: EditableBodyOutlineContourPoint,
  targetY: number,
): EditableBodyOutlineContourPoint {
  if (Math.abs(end.y - start.y) < 0.001) {
    return {
      x: round1((start.x + end.x) / 2),
      y: round1(targetY),
    };
  }
  const t = clamp((targetY - start.y) / (end.y - start.y), 0, 1);
  return {
    x: round1(start.x + ((end.x - start.x) * t)),
    y: round1(targetY),
  };
}

function dedupeContourPoints(
  points: EditableBodyOutlineContourPoint[],
): EditableBodyOutlineContourPoint[] {
  return points.filter((point, index, array) => (
    index === 0 ||
    point.x !== array[index - 1]?.x ||
    point.y !== array[index - 1]?.y
  ));
}

function clipPolylineToMinimumY(
  points: EditableBodyOutlineContourPoint[],
  minY: number,
): EditableBodyOutlineContourPoint[] {
  if (points.length < 2) return points;
  const clipped: EditableBodyOutlineContourPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const startInside = start.y >= minY;
    const endInside = end.y >= minY;
    if (startInside && clipped.length === 0) {
      clipped.push({ x: round1(start.x), y: round1(start.y) });
    }
    if (startInside !== endInside) {
      clipped.push(interpolateContourPointAtY(start, end, minY));
    }
    if (endInside) {
      clipped.push({ x: round1(end.x), y: round1(end.y) });
    }
  }
  return dedupeContourPoints(clipped);
}

function clipPolylineToMaximumY(
  points: EditableBodyOutlineContourPoint[],
  maxY: number,
): EditableBodyOutlineContourPoint[] {
  if (points.length < 2) return points;
  const clipped: EditableBodyOutlineContourPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const startInside = start.y <= maxY;
    const endInside = end.y <= maxY;
    if (startInside && clipped.length === 0) {
      clipped.push({ x: round1(start.x), y: round1(start.y) });
    }
    if (startInside !== endInside) {
      clipped.push(interpolateContourPointAtY(start, end, maxY));
    }
    if (endInside) {
      clipped.push({ x: round1(end.x), y: round1(end.y) });
    }
  }
  return dedupeContourPoints(clipped);
}

function clipPolylineToYRange(
  points: EditableBodyOutlineContourPoint[],
  minY: number,
  maxY: number,
): EditableBodyOutlineContourPoint[] {
  return clipPolylineToMaximumY(
    clipPolylineToMinimumY(points, minY),
    maxY,
  );
}

function splitClosedContourAtBottom(
  contour: EditableBodyOutlineContourPoint[],
): {
  leftTopDown: EditableBodyOutlineContourPoint[];
  rightTopDown: EditableBodyOutlineContourPoint[];
} | null {
  if (contour.length < 6) return null;
  const bottomY = Math.max(...contour.map((point) => point.y));
  const splitIndex = contour.findIndex((point) => Math.abs(point.y - bottomY) < 0.5);
  if (splitIndex <= 0 || splitIndex >= contour.length - 1) {
    return null;
  }
  return {
    leftTopDown: contour.slice(0, splitIndex + 1),
    rightTopDown: [...contour.slice(splitIndex + 1)].reverse(),
  };
}

function findClosedContourStableTopY(
  contour: EditableBodyOutlineContourPoint[],
): number | null {
  const bounds = getBounds(contour);
  if (!bounds) return null;
  const centerX = estimateBodyCenterX(contour);
  const sampleCount = Math.max(48, Math.min(160, Math.round(bounds.height * 0.35)));
  const rows: Array<{ y: number; width: number; centerX: number }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(bounds.minY + (bounds.height * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const segment = selectCenteredContourSegment(segments, centerX);
    rows.push({
      y,
      width: round1(segment.width),
      centerX: round1(segment.centerX),
    });
  }

  if (rows.length < 6) return null;
  const runLength = 4;
  for (let index = 0; index <= rows.length - runLength; index += 1) {
    const window = rows.slice(index, index + runLength);
    const widths = window.map((row) => row.width).filter((value) => value > 0.1);
    if (widths.length < runLength) continue;
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    const widthMedian = median(widths) ?? 0;
    if (widthMedian < bounds.width * 0.45) continue;
    if ((maxWidth - minWidth) > Math.max(2, widthMedian * 0.04)) continue;
    const centerXs = window.map((row) => row.centerX);
    const minCenter = Math.min(...centerXs);
    const maxCenter = Math.max(...centerXs);
    if ((maxCenter - minCenter) > 2) continue;
    return window[0]?.y ?? null;
  }

  return null;
}

function buildExactBodyBandSourceContour(args: {
  contour: EditableBodyOutlineContourPoint[];
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
}): EditableBodyOutlineContourPoint[] | null {
  const bounds = getBounds(args.contour);
  if (!bounds) return null;
  const bodyHeightMm = Math.max(1, args.bodyBottomFromOverallMm - args.bodyTopFromOverallMm);
  const overallHeightMm = Math.max(bodyHeightMm, args.overallHeightMm);
  const sourceBodyBottomY = bounds.minY + (bounds.height * clamp(args.bodyBottomFromOverallMm / overallHeightMm, 0, 1));
  const ratioDerivedBodyTopY = bounds.minY + (bounds.height * clamp(args.bodyTopFromOverallMm / overallHeightMm, 0, 1));
  const shouldInferStableBodyTop =
    args.bodyTopFromOverallMm <= 0.5 &&
    Math.abs(args.bodyBottomFromOverallMm - overallHeightMm) <= 1.5;
  const stableBodyTopY = shouldInferStableBodyTop
    ? findClosedContourStableTopY(args.contour)
    : null;
  const sourceBodyTopY = clamp(
    Math.max(ratioDerivedBodyTopY, stableBodyTopY ?? ratioDerivedBodyTopY),
    bounds.minY,
    Math.max(bounds.minY, sourceBodyBottomY - 12),
  );
  const croppedHeight = sourceBodyBottomY - sourceBodyTopY;
  if (croppedHeight < Math.max(12, bounds.height * 0.22)) {
    return null;
  }

  const split = splitClosedContourAtBottom(args.contour);
  if (!split) {
    return null;
  }

  const clippedLeft = clipPolylineToYRange(split.leftTopDown, sourceBodyTopY, sourceBodyBottomY);
  const clippedRightTopDown = clipPolylineToYRange(split.rightTopDown, sourceBodyTopY, sourceBodyBottomY);
  if (clippedLeft.length < 2 || clippedRightTopDown.length < 2) {
    return null;
  }

  return dedupeContourPoints([
    ...clippedLeft,
    ...[...clippedRightTopDown].reverse(),
  ]);
}

function estimateBodyCenterXInRange(
  contour: EditableBodyOutlineContourPoint[],
  minY: number,
  maxY: number,
): number {
  if (maxY <= minY) {
    return estimateBodyCenterX(contour);
  }
  const sampleCount = Math.max(18, Math.min(84, Math.round((maxY - minY) * 0.22)));
  const centers: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(minY + ((maxY - minY) * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const widestSegment = segments.reduce((best, segment) => (
      segment.width > best.width ? segment : best
    ));
    centers.push(widestSegment.centerX);
  }
  if (centers.length === 0) {
    return estimateBodyCenterX(contour);
  }
  return round1(median(centers));
}

function buildMirroredHalfProfileFromBandContour(args: {
  contour: EditableBodyOutlineContourPoint[];
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  matchedProfileId?: string | null;
  topOuterDiameterMm?: number | null;
  baseDiameterMm?: number | null;
  shoulderDiameterMm?: number | null;
  taperUpperDiameterMm?: number | null;
  taperLowerDiameterMm?: number | null;
  bevelDiameterMm?: number | null;
}): Pick<EditableBodyOutline, "points" | "directContour" | "sourceContour" | "sourceContourBounds"> | null {
  const bounds = getBounds(args.contour);
  if (!bounds) return null;

  const bodyHeightMm = Math.max(10, args.bodyBottomFromOverallMm - args.bodyTopFromOverallMm);
  const centerX = estimateBodyCenterXInRange(args.contour, bounds.minY, bounds.maxY);
  const sampleCount = Math.max(56, Math.min(220, Math.round(bounds.height * 1.6)));
  const sampledRows: Array<{ y: number; leftX: number; halfWidthPx: number }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(bounds.minY + (bounds.height * t));
    const segments = getContourSegmentsAtY(args.contour, y);
    if (segments.length === 0) continue;
    const segment = selectCenteredContourSegment(segments, centerX);
    const leftHalfWidthPx = Math.max(0.1, centerX - segment.leftX);
    sampledRows.push({
      y,
      leftX: segment.leftX,
      halfWidthPx: round1(leftHalfWidthPx),
    });
  }

  if (sampledRows.length < 8) return null;

  const preset = resolveKnownTumblerOutlinePreset(args.matchedProfileId);
  const stableBodyRows = sampledRows.filter((row) => {
    const ratio = (row.y - bounds.minY) / Math.max(1, bounds.height);
    return ratio >= 0.14 && ratio <= 0.62;
  });
  const stableBodyHalfWidthPx = median(
    (stableBodyRows.length > 0 ? stableBodyRows : sampledRows)
      .map((row) => row.halfWidthPx)
      .filter((value) => value > 0.1),
  );
  const upperHalfWidthClampPx = Math.max(0.1, stableBodyHalfWidthPx * (preset?.upperTraceWidthClampRatio ?? 1.02));
  const shoulderHalfWidthClampPx = Math.max(upperHalfWidthClampPx, stableBodyHalfWidthPx * (preset?.shoulderTraceWidthClampRatio ?? 1.06));
  const constrainedRows = sampledRows.map((row) => {
    const ratio = (row.y - bounds.minY) / Math.max(1, bounds.height);
    const maxAllowedHalfWidthPx =
      ratio <= 0.18
        ? upperHalfWidthClampPx
        : ratio <= 0.38
          ? shoulderHalfWidthClampPx
          : Number.POSITIVE_INFINITY;
    const halfWidthPx = round1(Math.min(row.halfWidthPx, maxAllowedHalfWidthPx));
    return {
      y: row.y,
      halfWidthPx,
    };
  });
  const smoothingRadius = preset?.rowSmoothingRadius ?? 1;
  const smoothedHalfWidths = smoothNumericSeries(constrainedRows.map((row) => row.halfWidthPx), smoothingRadius);
  const mirroredRows = constrainedRows.map((row, index) => {
    const halfWidthPx = round1(Math.max(0.1, smoothedHalfWidths[index] ?? row.halfWidthPx));
    const leftX = round1(centerX - halfWidthPx);
    return {
      y: row.y,
      leftX,
      rightX: round1(centerX + halfWidthPx),
      halfWidthPx,
    };
  });

  const sourceContour = dedupeContourPoints([
    ...mirroredRows.map((row) => ({ x: row.leftX, y: row.y })),
    ...[...mirroredRows].reverse().map((row) => ({ x: row.rightX, y: row.y })),
  ]);
  const sourceContourBounds = getBounds(sourceContour) ?? bounds;
  const sourceTopHalfWidthPx = median(
    mirroredRows
      .slice(0, Math.max(3, Math.min(8, mirroredRows.length)))
      .map((row) => row.halfWidthPx)
      .filter((value) => value > 0.1),
  );
  const scaleX = (args.diameterMm / 2) / Math.max(0.1, sourceTopHalfWidthPx);
  const sourceHeightPx = Math.max(1, (mirroredRows[mirroredRows.length - 1]?.y ?? bounds.maxY) - (mirroredRows[0]?.y ?? bounds.minY));
  const scaleY = bodyHeightMm / sourceHeightPx;

  const rightMmContour = mirroredRows.map((row) => ({
    x: round1(row.halfWidthPx * scaleX),
    y: round1(args.bodyTopFromOverallMm + ((row.y - sourceContourBounds.minY) * scaleY)),
  }));
  const mmContour = dedupeContourPoints([
    ...rightMmContour,
    ...[...rightMmContour].reverse().map((point) => ({ x: round1(-point.x), y: point.y })),
  ]);
  const points = buildProfilePointsFromContour({
    contour: mmContour,
    bodyTopFromOverallMm: round1(args.bodyTopFromOverallMm),
    bodyBottomFromOverallMm: round1(args.bodyBottomFromOverallMm),
    diameterMm: args.diameterMm,
    matchedProfileId: args.matchedProfileId,
    topOuterHalfWidthMm: round1(args.diameterMm / 2),
    baseDiameterMm: args.baseDiameterMm ?? null,
    shoulderDiameterMm: args.shoulderDiameterMm ?? null,
    taperUpperDiameterMm: args.taperUpperDiameterMm ?? null,
    taperLowerDiameterMm: args.taperLowerDiameterMm ?? null,
    bevelDiameterMm: args.bevelDiameterMm ?? null,
  });

  return {
    points,
    directContour: buildSmoothedContourFromProfile(points),
    sourceContour: sourceContour.map((point) => ({ ...point })),
    sourceContourBounds,
  };
}

function buildBodyOnlySourceContour(args: {
  contour: EditableBodyOutlineContourPoint[];
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  matchedProfileId?: string | null;
}): EditableBodyOutlineContourPoint[] | null {
  const bounds = getBounds(args.contour);
  if (!bounds) return null;

  const bodyHeightMm = Math.max(1, args.bodyBottomFromOverallMm - args.bodyTopFromOverallMm);
  const overallHeightMm = Math.max(bodyHeightMm, args.overallHeightMm);
  const sourceBodyTopY = bounds.minY + (bounds.height * clamp(args.bodyTopFromOverallMm / overallHeightMm, 0, 1));
  const sourceBodyBottomY = bounds.minY + (bounds.height * clamp(args.bodyBottomFromOverallMm / overallHeightMm, 0, 1));
  const croppedHeight = sourceBodyBottomY - sourceBodyTopY;
  if (croppedHeight < Math.max(12, bounds.height * 0.22)) {
    return null;
  }

  const centerX = estimateBodyCenterX(args.contour);
  const sampleCount = Math.max(48, Math.min(240, Math.round(croppedHeight * 1.6)));
  const rows: Array<{ y: number; leftX: number; rightX: number }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(sourceBodyTopY + (croppedHeight * t));
    const segments = getContourSegmentsAtY(args.contour, y);
    if (segments.length === 0) continue;
    const bodySegment = selectCenteredContourSegment(segments, centerX);
    rows.push({
      y,
      leftX: bodySegment.leftX,
      rightX: bodySegment.rightX,
    });
  }

  if (rows.length < 8) return null;

  const preset = resolveKnownTumblerOutlinePreset(args.matchedProfileId);
  const stableBodyRows = rows.filter((row) => {
    const ratio = (row.y - sourceBodyTopY) / Math.max(1, croppedHeight);
    return ratio >= 0.22 && ratio <= 0.62;
  });
  const stableWidths = (stableBodyRows.length > 0 ? stableBodyRows : rows)
    .map((row) => Math.max(0.1, row.rightX - row.leftX));
  const stableWidth = Math.max(1, median(stableWidths));
  const upperWidthClampPx = stableWidth * (preset?.upperTraceWidthClampRatio ?? 1.14);
  const shoulderWidthClampPx = stableWidth * (preset?.shoulderTraceWidthClampRatio ?? 1.08);
  const constrainedRows = rows.map((row) => {
    const ratio = (row.y - sourceBodyTopY) / Math.max(1, croppedHeight);
    const rowWidth = row.rightX - row.leftX;
    const maxAllowedWidth =
      ratio <= 0.18
        ? upperWidthClampPx
        : ratio <= 0.4
          ? shoulderWidthClampPx
          : Number.POSITIVE_INFINITY;
    if (!(maxAllowedWidth > 0) || rowWidth <= maxAllowedWidth) {
      return row;
    }
    return {
      y: row.y,
      leftX: round1(centerX - (maxAllowedWidth / 2)),
      rightX: round1(centerX + (maxAllowedWidth / 2)),
    };
  });
  const smoothingRadius = preset?.rowSmoothingRadius ?? 1;
  const smoothedLeft = smoothNumericSeries(constrainedRows.map((row) => row.leftX), smoothingRadius);
  const smoothedRight = smoothNumericSeries(constrainedRows.map((row) => row.rightX), smoothingRadius);

  const left = constrainedRows.map((row, index) => ({ x: smoothedLeft[index]!, y: row.y }));
  const right = [...constrainedRows]
    .reverse()
    .map((row, reverseIndex) => ({ x: smoothedRight[constrainedRows.length - 1 - reverseIndex]!, y: row.y }));
  return [...left, ...right];
}

function buildImportedBodySeedContour(
  contour: EditableBodyOutlineContourPoint[],
  matchedProfileId?: string | null,
): EditableBodyOutlineContourPoint[] | null {
  const bounds = getBounds(contour);
  if (!bounds) return null;

  const preset = resolveKnownTumblerOutlinePreset(matchedProfileId);
  const centerX = estimateBodyCenterX(contour);
  const sampleCount = Math.max(56, Math.min(260, Math.round(bounds.height * 1.4)));
  const rows: Array<{ y: number; leftX: number; rightX: number; width: number }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(bounds.minY + (bounds.height * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const bodySegment = selectCenteredContourSegment(segments, centerX);
    rows.push({
      y,
      leftX: bodySegment.leftX,
      rightX: bodySegment.rightX,
      width: bodySegment.width,
    });
  }

  if (rows.length < 10) return null;

  const stableBodyRows = rows.filter((row) =>
    row.y >= bounds.minY + (bounds.height * 0.28)
    && row.y <= bounds.minY + (bounds.height * 0.64)
    && row.width > bounds.width * 0.2,
  );
  const stableBodyWidths = stableBodyRows.map((row) => row.width);
  const stableBodyWidth = stableBodyWidths.length > 0
    ? median(stableBodyWidths)
    : percentile(rows.map((row) => row.width), 0.72);
  const minimumBodyWidth = Math.max(bounds.width * 0.26, stableBodyWidth * (preset?.bodySeedStartMinWidthRatio ?? 0.84));
  const maximumBodyWidth = Math.max(minimumBodyWidth + 2, stableBodyWidth * (preset?.bodySeedStartMaxWidthRatio ?? 1.08));
  const confirmationWindow = Math.max(4, Math.min(10, Math.round(rows.length * 0.035)));
  const minimumStartY = bounds.minY + (bounds.height * (preset?.bodySeedMinStartRatio ?? 0.08));
  const startIndexFloor = Math.max(0, rows.findIndex((row) => row.y >= minimumStartY));
  let topIndex = 0;
  let foundStableStart = false;

  for (let index = startIndexFloor; index < rows.length; index += 1) {
    const window = rows.slice(index, Math.min(rows.length, index + confirmationWindow));
    const qualifyingRows = window.filter((row) =>
      row.width >= minimumBodyWidth && row.width <= maximumBodyWidth,
    ).length;
    if (qualifyingRows >= Math.max(3, Math.ceil(window.length * 0.65))) {
      topIndex = index;
      foundStableStart = true;
      break;
    }
  }

  if (!foundStableStart) {
    for (let index = startIndexFloor; index < rows.length; index += 1) {
      const window = rows.slice(index, Math.min(rows.length, index + confirmationWindow));
      const qualifyingRows = window.filter((row) => row.width >= minimumBodyWidth).length;
      if (qualifyingRows >= Math.max(3, Math.ceil(window.length * 0.65))) {
        topIndex = index;
        break;
      }
    }
  }

  const trimmedRows = rows.slice(topIndex);
  if (trimmedRows.length < 8) return null;

  const lastTrimmedRow = trimmedRows[trimmedRows.length - 1] ?? null;
  const bottomGap = lastTrimmedRow ? Math.max(0, bounds.maxY - lastTrimmedRow.y) : 0;
  const shouldExtendBottom = bottomGap >= 2 && bottomGap <= Math.max(28, bounds.height * 0.08);
  const extendedRows = [...trimmedRows];
  if (lastTrimmedRow && shouldExtendBottom) {
    const bottomWindow = trimmedRows.slice(Math.max(0, trimmedRows.length - 5));
    const stableBottomLeft = round1(median(bottomWindow.map((row) => row.leftX)));
    const stableBottomRight = round1(median(bottomWindow.map((row) => row.rightX)));
    const stepCount = Math.max(1, Math.round(bottomGap / 3));
    for (let step = 1; step <= stepCount; step += 1) {
      const t = step / stepCount;
      extendedRows.push({
        y: round1(lastTrimmedRow.y + (bottomGap * t)),
        leftX: stableBottomLeft,
        rightX: stableBottomRight,
        width: stableBottomRight - stableBottomLeft,
      });
    }
  }

  const seedHeight = Math.max(1, (extendedRows[extendedRows.length - 1]?.y ?? bounds.maxY) - (extendedRows[0]?.y ?? bounds.minY));
  const upperWidthClamp = stableBodyWidth * (preset?.shoulderTraceWidthClampRatio ?? 1.06);
  const constrainedRows = extendedRows.map((row) => {
    const ratio = (row.y - (extendedRows[0]?.y ?? bounds.minY)) / seedHeight;
    if (ratio > 0.18 || row.width <= upperWidthClamp) {
      return row;
    }
    return {
      y: row.y,
      leftX: round1(centerX - (upperWidthClamp / 2)),
      rightX: round1(centerX + (upperWidthClamp / 2)),
      width: upperWidthClamp,
    };
  });
  const smoothingRadius = preset?.rowSmoothingRadius ?? 1;
  const smoothedLeft = smoothNumericSeries(constrainedRows.map((row) => row.leftX), smoothingRadius);
  const smoothedRight = smoothNumericSeries(constrainedRows.map((row) => row.rightX), smoothingRadius);

  const left = constrainedRows.map((row, index) => ({ x: smoothedLeft[index]!, y: row.y }));
  const right = [...constrainedRows]
    .reverse()
    .map((row, reverseIndex) => ({ x: smoothedRight[constrainedRows.length - 1 - reverseIndex]!, y: row.y }));
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

function scoreImportedOutlineBounds(
  bbox: { x: number; y: number; width: number; height: number },
  viewport: { minX: number; minY: number; width: number; height: number } | null,
): number {
  const area = bbox.width * bbox.height;
  if (!viewport) return area;

  const viewportMaxX = viewport.minX + viewport.width;
  const viewportMaxY = viewport.minY + viewport.height;
  const bboxMaxX = bbox.x + bbox.width;
  const bboxMaxY = bbox.y + bbox.height;
  const widthFill = bbox.width / Math.max(1, viewport.width);
  const heightFill = bbox.height / Math.max(1, viewport.height);
  const marginX = Math.max(4, viewport.width * 0.03);
  const marginY = Math.max(4, viewport.height * 0.03);
  const hugsViewport =
    widthFill >= 0.92 &&
    heightFill >= 0.92 &&
    Math.abs(bbox.x - viewport.minX) <= marginX &&
    Math.abs(bboxMaxX - viewportMaxX) <= marginX &&
    Math.abs(bbox.y - viewport.minY) <= marginY &&
    Math.abs(bboxMaxY - viewportMaxY) <= marginY;

  if (hugsViewport) {
    return area * 0.001;
  }

  return area;
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
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of geometryCandidates) {
      const bbox = candidate.getBBox();
      const score = scoreImportedOutlineBounds(bbox, viewportFromViewBox ?? viewportFromDimensions);
      if (score > bestScore && bbox.width > 0 && bbox.height > 0) {
        bestScore = score;
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
        let bestSubpathScore = Number.NEGATIVE_INFINITY;
        const tempPaths: SVGGeometryElement[] = [];

        for (const subpath of subpaths) {
          const candidate = document.createElementNS("http://www.w3.org/2000/svg", "path");
          candidate.setAttribute("d", subpath);
          liveSvg.appendChild(candidate);
          tempPaths.push(candidate);
          const bbox = candidate.getBBox();
          const score = scoreImportedOutlineBounds(bbox, viewportFromViewBox ?? viewportFromDimensions);
          if (bbox.width > 0 && bbox.height > 0 && score > bestSubpathScore) {
            bestSubpathScore = score;
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
    sourceContourMode: outline.sourceContourMode,
    sourceContourViewport: outline.sourceContourViewport ? { ...outline.sourceContourViewport } : undefined,
  };
}

export function normalizeMeasurementContour(args: {
  outline: EditableBodyOutline | null | undefined;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
}): NormalizedMeasurementContour | null {
  const resolvedDirectContour = resolveEditableBodyOutlineDirectContour(args.outline);
  const baseContour =
    args.outline?.sourceContour && args.outline.sourceContour.length >= 3
      ? args.outline.sourceContour
      : resolvedDirectContour;
  if (!baseContour || baseContour.length < 3) return null;

  const usesBodyOnlyContour = args.outline?.sourceContourMode === "body-only";
  const mirroredContour = usesBodyOnlyContour
    ? baseContour
    : (buildMirroredSourceContour(baseContour) ?? baseContour);
  const croppedBodyContour = buildBodyOnlySourceContour({
    contour: mirroredContour,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
  });
  const mirroredBounds = getBounds(mirroredContour);
  const croppedBounds = croppedBodyContour ? getBounds(croppedBodyContour) : null;
  const shouldUseCroppedContour =
    croppedBodyContour != null &&
    croppedBodyContour.length >= 8 &&
    (
      !usesBodyOnlyContour ||
      (
        mirroredBounds != null &&
        croppedBounds != null &&
        croppedBounds.height <= mirroredBounds.height * 0.97
      )
    );
  const bodyOnlyContour = shouldUseCroppedContour
    ? croppedBodyContour!
    : mirroredContour;
  const bounds = getBounds(bodyOnlyContour) ?? getBounds(mirroredContour) ?? getBounds(baseContour);
  if (!bounds) return null;

  return {
    contour: bodyOnlyContour,
    bounds,
    mirrored: mirroredContour !== baseContour,
    bodyOnly: bodyOnlyContour !== mirroredContour,
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
  const anchors = buildOutlineAnchorDefinitions({
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    diameterMm: args.diameterMm,
    matchedProfileId: args.matchedProfileId,
    topOuterDiameterMm: args.topOuterDiameterMm,
    baseDiameterMm: args.baseDiameterMm,
    shoulderDiameterMm: args.shoulderDiameterMm,
    taperUpperDiameterMm: args.taperUpperDiameterMm,
    taperLowerDiameterMm: args.taperLowerDiameterMm,
    bevelDiameterMm: args.bevelDiameterMm,
  });

  const fitProfilePoints = args.fitDebug?.profilePoints ?? null;
  if (fitProfilePoints && fitProfilePoints.length > 1) {
    const points = anchors.map(({ role, y, pointType, seedHalfWidthMm }) => {
      const measuredRadiusMm = interpolateFitDebugRadius(fitProfilePoints, y);
      const blendedRadiusMm = Math.max(0.1, resolveFitDebugAnchorRadius({
        role,
        measuredRadiusMm,
        seedRadiusMm: seedHalfWidthMm,
      }));
      return {
        id: makeId(role ?? "point"),
        x: args.matchedProfileId
          ? constrainKnownProfileHalfWidth({
              matchedProfileId: args.matchedProfileId,
              role,
              measuredHalfWidthMm: blendedRadiusMm,
              seedHalfWidthMm,
            })
          : Math.max(0.1, resolveFitDebugAnchorRadius({
          role,
          measuredRadiusMm,
          seedRadiusMm: seedHalfWidthMm,
        })),
        y,
        inHandle: null,
        outHandle: null,
        pointType,
        role,
      };
    });
    const fitDebug = args.fitDebug!;
    const sourceContour = [
      ...fitProfilePoints.map((point) => ({
        x: round1((fitDebug.centerXPx ?? 0) + point.radiusPx),
        y: round1(point.yPx),
      })),
      ...[...fitProfilePoints].reverse().map((point) => ({
        x: round1((fitDebug.centerXPx ?? 0) - point.radiusPx),
        y: round1(point.yPx),
      })),
    ];
    const sourceContourBounds = getBounds(sourceContour) ?? {
      minX: fitDebug.silhouetteBoundsPx.minX,
      minY: fitDebug.bodyTopPx,
      maxX: fitDebug.silhouetteBoundsPx.maxX,
      maxY: fitDebug.bodyBottomPx,
      width: Math.max(1, fitDebug.silhouetteBoundsPx.maxX - fitDebug.silhouetteBoundsPx.minX),
      height: Math.max(1, fitDebug.bodyBottomPx - fitDebug.bodyTopPx),
    };

    return {
      closed: true,
      version: 1,
      points,
      directContour: buildSmoothedContourFromProfile(points),
      sourceContour,
      sourceContourBounds,
      sourceContourMode: "body-only",
      sourceContourViewport: {
        minX: 0,
        minY: 0,
        width: Math.max(1, fitDebug.imageWidthPx),
        height: Math.max(1, fitDebug.imageHeightPx),
      },
    };
  }

  const points = anchors.map((anchor) => ({
    id: makeId(anchor.role ?? "point"),
    x: anchor.seedHalfWidthMm,
    y: anchor.y,
    inHandle: null,
    outHandle: null,
    pointType: anchor.pointType,
    role: anchor.role,
  }));

  return {
    closed: true,
    version: 1,
    points,
    directContour: buildSmoothedContourFromProfile(points),
    sourceContourMode: "body-only",
  };
}

export function createEditableBodyOutlineFromTraceDebug(args: TraceImportArgs): EditableBodyOutline {
  const {
    traceDebug,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    topOuterDiameterMm,
  } = args;
  const rawSourceContour = traceDebug.outlinePointsPx.map((point) => ({
    x: round1(point.xPx),
    y: round1(point.yPx),
  }));
  const rawBounds = getBounds(rawSourceContour) ?? {
    minX: traceDebug.silhouetteBoundsPx.minX,
    minY: traceDebug.silhouetteBoundsPx.minY,
    maxX: traceDebug.silhouetteBoundsPx.maxX,
    maxY: traceDebug.silhouetteBoundsPx.maxY,
    width: Math.max(1, traceDebug.silhouetteBoundsPx.maxX - traceDebug.silhouetteBoundsPx.minX),
    height: Math.max(1, traceDebug.silhouetteBoundsPx.maxY - traceDebug.silhouetteBoundsPx.minY),
  };
  const bandSourceContour = buildExactBodyBandSourceContour({
    contour: rawSourceContour,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
  }) ?? rawSourceContour;
  const seamAnchoredOutline = buildMirroredHalfProfileFromBandContour({
    contour: bandSourceContour,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    matchedProfileId: args.matchedProfileId,
    topOuterDiameterMm: diameterMm,
  });
  if (seamAnchoredOutline) {
    return {
      closed: true,
      version: 1,
      points: seamAnchoredOutline.points,
      directContour: seamAnchoredOutline.directContour,
      sourceContour: seamAnchoredOutline.sourceContour,
      sourceContourBounds: seamAnchoredOutline.sourceContourBounds,
      sourceContourMode: "body-only",
      sourceContourViewport: {
        minX: 0,
        minY: 0,
        width: Math.max(1, traceDebug.imageWidthPx),
        height: Math.max(1, traceDebug.imageHeightPx),
      },
    };
  }

  const mirroredContour = buildMirroredSourceContour(rawSourceContour) ?? rawSourceContour;
  const bodySourceContour = buildBodyOnlySourceContour({
    contour: mirroredContour,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    matchedProfileId: args.matchedProfileId,
  }) ?? mirroredContour;
  const previewSourceContour = buildExactBodyBandSourceContour({
    contour: mirroredContour,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
  }) ?? bodySourceContour;
  const bounds = getBounds(bodySourceContour) ?? rawBounds;
  const previewBounds = getBounds(previewSourceContour) ?? bounds;
  const bodyHeightMm = Math.max(10, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const centerX = estimateBodyCenterX(bodySourceContour);
  const scaleY = Math.max(0.001, bodyHeightMm / Math.max(1, bounds.height));
  const resolveSourceY = (yMm: number) =>
    bounds.minY + (clamp((yMm - bodyTopFromOverallMm) / Math.max(1, bodyHeightMm), 0, 1) * bounds.height);
  const sourceBodyY = bodyTopFromOverallMm + (bodyHeightMm * 0.14);
  const sourceSampleY = resolveSourceY(sourceBodyY);
  const sourceHalfWidth = Math.max(0.1, sampleHalfWidthFromContour(bodySourceContour, centerX, sourceSampleY));
  const scaleX = Math.max(0.001, diameterMm / Math.max(0.2, sourceHalfWidth * 2));
  const points = buildProfilePointsFromContour({
    contour: bodySourceContour.map((point) => ({
      x: round1((point.x - centerX) * scaleX),
      y: round1(bodyTopFromOverallMm + ((point.y - bounds.minY) * scaleY)),
    })),
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    matchedProfileId: args.matchedProfileId,
    topOuterHalfWidthMm: round1(diameterMm / 2),
  });

  return {
    closed: true,
    version: 1,
    points,
    directContour: buildSmoothedContourFromProfile(points),
    sourceContour: previewSourceContour.map((point) => ({ ...point })),
    sourceContourBounds: previewBounds,
    sourceContourMode: "body-only",
    sourceContourViewport: {
      minX: 0,
      minY: 0,
      width: Math.max(1, traceDebug.imageWidthPx),
      height: Math.max(1, traceDebug.imageHeightPx),
    },
  };
}

export function createEditableBodyOutlineFromImportedSvg(args: ImportOutlineArgs): EditableBodyOutline {
  const {
    source,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    topOuterDiameterMm,
    scalePct = 100,
    widthScalePct = 100,
    heightScalePct = 100,
    offsetYMm = 0,
    side = "right",
    sourceMode = "auto",
  } = args;
  const sourceContour = source.contour;
  const normalizedSourceContour = sourceMode === "body-only"
    ? sourceContour
    : (buildMirroredSourceContour(sourceContour) ?? sourceContour);
  const seamAnchoredSourceContour = sourceMode === "body-only"
    ? (
        buildExactBodyBandSourceContour({
          contour: normalizedSourceContour,
          overallHeightMm,
          bodyTopFromOverallMm,
          bodyBottomFromOverallMm,
        }) ?? normalizedSourceContour
      )
    : normalizedSourceContour;
  const seamAnchoredBodyOnlyOutline = sourceMode === "body-only"
    ? buildMirroredHalfProfileFromBandContour({
        contour: seamAnchoredSourceContour,
        bodyTopFromOverallMm,
        bodyBottomFromOverallMm,
        diameterMm,
        matchedProfileId: args.matchedProfileId,
        topOuterDiameterMm: diameterMm,
        baseDiameterMm: args.baseDiameterMm ?? null,
        shoulderDiameterMm: args.shoulderDiameterMm ?? null,
        taperUpperDiameterMm: args.taperUpperDiameterMm ?? null,
        taperLowerDiameterMm: args.taperLowerDiameterMm ?? null,
        bevelDiameterMm: args.bevelDiameterMm ?? null,
      })
    : null;
  const bodyOnlySourceContour = sourceMode === "body-only"
    ? (seamAnchoredBodyOnlyOutline?.sourceContour ?? seamAnchoredSourceContour)
    : (
      buildBodyOnlySourceContour({
        contour: normalizedSourceContour,
        overallHeightMm,
        bodyTopFromOverallMm,
        bodyBottomFromOverallMm,
        matchedProfileId: args.matchedProfileId,
      }) ?? normalizedSourceContour
    );
  const previewSourceContour = sourceMode === "body-only"
    ? bodyOnlySourceContour.map((point) => ({ ...point }))
    : (
      buildExactBodyBandSourceContour({
        contour: normalizedSourceContour,
        overallHeightMm,
        bodyTopFromOverallMm,
        bodyBottomFromOverallMm,
      }) ?? normalizedSourceContour
    );
  const bounds =
    getBounds(bodyOnlySourceContour)
    ?? getBounds(normalizedSourceContour)
    ?? getBounds(sourceContour)
    ?? source.bounds;
  const previewBounds =
    getBounds(previewSourceContour)
    ?? bounds;
  const referenceDiameterMm = round1(topOuterDiameterMm && topOuterDiameterMm > 0 ? topOuterDiameterMm : diameterMm);
  const targetBodyHeightMm = Math.max(10, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const scaleFactor = scalePct / 100;
  const referenceSourceWidth = estimateReferenceWidth(bodyOnlySourceContour);
  const scaleX = (referenceDiameterMm / Math.max(0.1, referenceSourceWidth)) * (widthScalePct / 100) * scaleFactor;
  const scaleY = (targetBodyHeightMm / Math.max(1, bounds.height)) * (heightScalePct / 100) * scaleFactor;
  const centerX = estimateBodyCenterX(bodyOnlySourceContour);
  const minY = bounds.minY;
  const sign = side === "left" ? -1 : 1;

  const rawContour = bodyOnlySourceContour.map((point) => ({
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
    diameterMm,
    matchedProfileId: args.matchedProfileId,
    topOuterHalfWidthMm: referenceDiameterMm / 2,
    baseDiameterMm: args.baseDiameterMm ?? null,
    shoulderDiameterMm: args.shoulderDiameterMm ?? null,
    taperUpperDiameterMm: args.taperUpperDiameterMm ?? null,
    taperLowerDiameterMm: args.taperLowerDiameterMm ?? null,
    bevelDiameterMm: args.bevelDiameterMm ?? null,
  });

  return {
    closed: true,
    version: 1,
    points: seamAnchoredBodyOnlyOutline?.points ?? points,
    directContour:
      seamAnchoredBodyOnlyOutline?.directContour
      ?? (
        sourceMode === "body-only" && contour.length >= 8
          ? contour.map((point) => ({ ...point }))
          : buildSmoothedContourFromProfile(points)
      ),
    sourceContour: previewSourceContour.map((point) => ({ ...point })),
    sourceContourBounds: previewBounds,
    sourceContourMode: "body-only",
    sourceContourViewport: source.viewport,
  };
}

export function createEditableBodyOutlineFromSeedSvgText(args: {
  svgText: string;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  matchedProfileId?: string | null;
  topOuterDiameterMm?: number | null;
  side?: "left" | "right";
  sourceMode?: "auto" | "body-only";
}): { source: ImportedEditableBodyOutlineSource; outline: EditableBodyOutline } {
  const source = parseImportedSvg(args.svgText);
  const outline = createEditableBodyOutlineFromImportedSvg({
    source,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    diameterMm: args.diameterMm,
    matchedProfileId: args.matchedProfileId,
    topOuterDiameterMm: args.topOuterDiameterMm,
    side: args.side,
    sourceMode: args.sourceMode,
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
  opts?: {
    preserveBodyBottomFromOverallMm?: number | null;
  },
): DerivedOutlineDimensions {
  if (!outline || outline.points.length === 0) return {};
  const sorted = sortEditableOutlinePoints(outline.points);
  const bodyTopFromOverallMm = round1(sorted[0]?.y ?? 0);
  const preserveBodyBottomFromOverallMm =
    outline.sourceContourMode === "body-only" &&
    Number.isFinite(opts?.preserveBodyBottomFromOverallMm)
      ? round1(Math.max(bodyTopFromOverallMm, opts?.preserveBodyBottomFromOverallMm ?? bodyTopFromOverallMm))
      : null;
  const bodyBottomFromOverallMm = preserveBodyBottomFromOverallMm ?? round1(sorted[sorted.length - 1]?.y ?? bodyTopFromOverallMm);

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

export function rebuildEditableBodyOutline(
  outline: EditableBodyOutline,
): EditableBodyOutline {
  const points = sortEditableOutlinePoints(outline.points);
  return {
    ...outline,
    points,
    directContour: points.length >= 2 ? buildSmoothedContourFromProfile(points) : outline.directContour,
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
  return rebuildEditableBodyOutline({
    ...outline,
    points: sortEditableOutlinePoints([...outline.points, inserted]),
  });
}

export function removeEditableOutlinePoint(
  outline: EditableBodyOutline,
  pointId: string,
): EditableBodyOutline {
  if (outline.points.length <= 4) return outline;
  const nextPoints = outline.points.filter((point) => point.id !== pointId);
  if (nextPoints.length === outline.points.length) return outline;
  return rebuildEditableBodyOutline({
    ...outline,
    points: sortEditableOutlinePoints(nextPoints),
  });
}

export function convertEditableOutlinePointType(
  outline: EditableBodyOutline,
  pointId: string,
  pointType: EditableOutlinePointType,
): EditableBodyOutline {
  return rebuildEditableBodyOutline({
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
  });
}
