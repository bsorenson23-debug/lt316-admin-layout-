/**
 * svgToLbrnShapes.ts
 *
 * Converts SVG artwork into LightBurn .lbrn2 shape XML strings so artwork can
 * be embedded directly in a LightBurn project file alongside the RotarySetup.
 *
 * No DOM APIs are used — all parsing is done with regex/string operations so
 * this module is safe for SSR environments.
 */

// ---------------------------------------------------------------------------
// 2D transform matrix
// [a, b, c, d, e, f] where:
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f
// ---------------------------------------------------------------------------
type Mat2D = [number, number, number, number, number, number];

const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];

function matMul(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMat(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

/** Apply only the linear part of the matrix (no translation) — used for direction vectors / offsets */
function applyMatLinear(m: Mat2D, dx: number, dy: number): { x: number; y: number } {
  return {
    x: m[0] * dx + m[2] * dy,
    y: m[1] * dx + m[3] * dy,
  };
}

// ---------------------------------------------------------------------------
// Transform attribute parser
// ---------------------------------------------------------------------------

/** Parse a comma/space separated number list from inside parens */
function parseArgs(s: string): number[] {
  const nums = s.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
  return nums ? nums.map(Number) : [];
}

function parseTransform(attr: string): Mat2D {
  let result: Mat2D = [...IDENTITY] as Mat2D;

  // Match each transform function in order
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attr)) !== null) {
    const fn = m[1].toLowerCase();
    const args = parseArgs(m[2]);
    let t: Mat2D = [...IDENTITY] as Mat2D;

    if (fn === 'matrix' && args.length >= 6) {
      t = [args[0], args[1], args[2], args[3], args[4], args[5]];
    } else if (fn === 'translate') {
      const tx = args[0] ?? 0;
      const ty = args[1] ?? 0;
      t = [1, 0, 0, 1, tx, ty];
    } else if (fn === 'scale') {
      const scx = args[0] ?? 1;
      const scy = args[1] ?? scx;
      t = [scx, 0, 0, scy, 0, 0];
    } else if (fn === 'rotate') {
      const angleDeg = args[0] ?? 0;
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      const rad = (angleDeg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      // rotate around (cx, cy): translate back, rotate, translate forward
      if (cx !== 0 || cy !== 0) {
        const pre: Mat2D = [1, 0, 0, 1, -cx, -cy];
        const rot: Mat2D = [cosA, sinA, -sinA, cosA, 0, 0];
        const post: Mat2D = [1, 0, 0, 1, cx, cy];
        t = matMul(post, matMul(rot, pre));
      } else {
        t = [cosA, sinA, -sinA, cosA, 0, 0];
      }
    } else if (fn === 'skewx') {
      const rad = ((args[0] ?? 0) * Math.PI) / 180;
      t = [1, 0, Math.tan(rad), 1, 0, 0];
    } else if (fn === 'skewy') {
      const rad = ((args[0] ?? 0) * Math.PI) / 180;
      t = [1, Math.tan(rad), 0, 1, 0, 0];
    }

    result = matMul(result, t);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Vertex type used internally and for output
// ---------------------------------------------------------------------------
interface LbrnVertex {
  x: number;
  y: number;
  c0x: number; // incoming handle offset (relative to vertex)
  c0y: number;
  c1x: number; // outgoing handle offset (relative to vertex)
  c1y: number;
}

interface PathIdState {
  nextVertId: number;
  nextPrimId: number;
}

function straightVertex(x: number, y: number): LbrnVertex {
  return { x, y, c0x: 0, c0y: 0, c1x: 0, c1y: 0 };
}

// ---------------------------------------------------------------------------
// LightBurn XML builder
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toFixed(4);
}

function isCurvedSegment(start: LbrnVertex, end: LbrnVertex): boolean {
  const eps = 1e-9;
  return (
    Math.abs(start.c1x) > eps ||
    Math.abs(start.c1y) > eps ||
    Math.abs(end.c0x) > eps ||
    Math.abs(end.c0y) > eps
  );
}

function buildVertToken(v: LbrnVertex): string {
  const token = `V${fmt(v.x)} ${fmt(v.y)}`;

  // Only emit control handles when the vertex has actual bezier curves.
  // Straight-line vertices (c0/c1 offsets ≈ 0) omit handles entirely —
  // LightBurn treats a bare "Vx y" as a straight corner.
  const hasCurve =
    Math.abs(v.c0x) > 1e-9 ||
    Math.abs(v.c0y) > 1e-9 ||
    Math.abs(v.c1x) > 1e-9 ||
    Math.abs(v.c1y) > 1e-9;
  if (!hasCurve) return token;

  // Our internal vertex model follows the SVG convention:
  // - c0 = incoming handle offset
  // - c1 = outgoing handle offset
  //
  // LightBurn's VertList uses the opposite labels on disk:
  // - c0 = outgoing handle for the segment leaving this vertex
  // - c1 = incoming handle for the segment entering this vertex
  //
  // Swap them here so the serialized .lbrn2 matches native LightBurn files
  // without forcing the rest of the SVG parser to use LightBurn-specific
  // naming semantics internally.
  const c0x = v.x + v.c1x;
  const c0y = v.y + v.c1y;
  const c1x = v.x + v.c0x;
  const c1y = v.y + v.c0y;
  return `${token}c0x${fmt(c0x)}c0y${fmt(c0y)}c1x${fmt(c1x)}c1y${fmt(c1y)}`;
}

function cubicPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t * t2;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function segmentSampleCount(start: LbrnVertex, end: LbrnVertex): number {
  if (!isCurvedSegment(start, end)) return 1;

  const p0 = { x: start.x, y: start.y };
  const p1 = { x: start.x + start.c1x, y: start.y + start.c1y };
  const p2 = { x: end.x + end.c0x, y: end.y + end.c0y };
  const p3 = { x: end.x, y: end.y };

  const netLength =
    Math.hypot(p1.x - p0.x, p1.y - p0.y) +
    Math.hypot(p2.x - p1.x, p2.y - p1.y) +
    Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const chordLength = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const curvature = Math.max(0, netLength - chordLength);
  const score = Math.max(netLength, chordLength + curvature * 2);

  return Math.max(6, Math.min(48, Math.ceil(score / 3)));
}

function flattenVertices(vertices: LbrnVertex[], closed: boolean): LbrnVertex[] {
  if (vertices.length < 2) return vertices.map((v) => straightVertex(v.x, v.y));

  const flat: LbrnVertex[] = [straightVertex(vertices[0].x, vertices[0].y)];

  function appendSegment(start: LbrnVertex, end: LbrnVertex, includeEnd: boolean) {
    if (!isCurvedSegment(start, end)) {
      if (includeEnd) flat.push(straightVertex(end.x, end.y));
      return;
    }

    const p0 = { x: start.x, y: start.y };
    const p1 = { x: start.x + start.c1x, y: start.y + start.c1y };
    const p2 = { x: end.x + end.c0x, y: end.y + end.c0y };
    const p3 = { x: end.x, y: end.y };
    const steps = segmentSampleCount(start, end);
    const maxStep = includeEnd ? steps : steps - 1;

    for (let step = 1; step <= maxStep; step++) {
      const pt = cubicPoint(p0, p1, p2, p3, step / steps);
      flat.push(straightVertex(pt.x, pt.y));
    }
  }

  for (let i = 0; i < vertices.length - 1; i++) {
    appendSegment(vertices[i], vertices[i + 1], true);
  }

  if (closed) {
    appendSegment(vertices[vertices.length - 1], vertices[0], false);
  }

  return flat;
}

/**
 * Build a LightBurn <Shape Type="Path"> using native bezier curves.
 *
 * Uses B (Bezier) primitives for curved segments and L (Line) for straight
 * segments.  Closed paths get an explicit closing segment instead of the
 * LineClosed shorthand.  PrimID = actual primitive count.
 */
function buildPathXml(
  vertices: LbrnVertex[],
  closed: boolean,
  cutIndex: number,
  ids: PathIdState
): string[] {
  if (vertices.length < 2) return [];

  const vertList = vertices.map(buildVertToken).join("");

  // Build primitives — B for bezier, L for straight
  const prims: string[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    if (isCurvedSegment(vertices[i], vertices[i + 1])) {
      prims.push(`B${i} ${i + 1}`);
    } else {
      prims.push(`L${i} ${i + 1}`);
    }
  }
  // Explicit closing segment for closed paths
  if (closed && vertices.length > 1) {
    const last = vertices.length - 1;
    if (isCurvedSegment(vertices[last], vertices[0])) {
      prims.push(`B${last} 0`);
    } else {
      prims.push(`L${last} 0`);
    }
  }

  if (prims.length === 0) return [];

  const vertId = ids.nextVertId;
  const primId = ids.nextPrimId;
  ids.nextVertId += vertices.length;
  ids.nextPrimId += prims.length;

  const xml = [
    `<Shape Type="Path" VertID="${vertId}" PrimID="${primId}">`,
    `  <XForm>1 0 0 1 0 0</XForm>`,
    `  <CutIndex Value="${cutIndex}" />`,
    `  <VertList>${vertList}</VertList>`,
    `  <PrimList>${prims.join("")}</PrimList>`,
    `</Shape>`,
  ].join("\n");

  return [xml];
}

// ---------------------------------------------------------------------------
// Arc → cubic bezier conversion
// Implements the SVG spec endpoint-to-center parameterization, then splits
// into ≤90° segments and converts each to a cubic bezier.
// ---------------------------------------------------------------------------

interface CubicSegment {
  x1: number; y1: number; // start
  cx1: number; cy1: number; // control 1
  cx2: number; cy2: number; // control 2
  x2: number; y2: number; // end
}

function arcToCubics(
  x1: number, y1: number,
  rx: number, ry: number,
  xAxisRotationDeg: number,
  largeArcFlag: boolean,
  sweepFlag: boolean,
  x2: number, y2: number
): CubicSegment[] {
  // Degenerate: endpoints coincide
  if (Math.abs(x1 - x2) < 1e-10 && Math.abs(y1 - y2) < 1e-10) return [];
  // Degenerate radii
  if (rx === 0 || ry === 0) {
    return [{ x1, y1, cx1: x1, cy1: y1, cx2: x2, cy2: y2, x2, y2 }];
  }

  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: compute (x1', y1') — midpoint in rotated frame
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Step 2: ensure radii are large enough (scale up if needed)
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }

  // Step 3: compute center in rotated frame (cx', cy')
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  let sq = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2);
  if (sq < 0) sq = 0; // numerical noise
  const sqSigned = (largeArcFlag !== sweepFlag ? 1 : -1) * Math.sqrt(sq);

  const cxp = sqSigned * (rx * y1p) / ry;
  const cyp = sqSigned * -(ry * x1p) / rx;

  // Step 4: transform back to original frame
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 5: compute start angle and sweep angle
  function vecAngle(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
  }

  const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = vecAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry
  );

  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  // Step 6: split into N segments ≤ 90° and convert each to cubic bezier
  const nSegs = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const segAngle = dTheta / nSegs;
  const segments: CubicSegment[] = [];

  for (let i = 0; i < nSegs; i++) {
    const a1 = theta1 + i * segAngle;
    const a2 = theta1 + (i + 1) * segAngle;
    const da = a2 - a1;

    // k = 4/3 * tan(da/4) — the cubic handle length factor
    const k = (4 / 3) * Math.tan(da / 4);

    // Endpoints on the unit ellipse in the rotated frame
    const cosA1 = Math.cos(a1), sinA1 = Math.sin(a1);
    const cosA2 = Math.cos(a2), sinA2 = Math.sin(a2);

    // Start and end on the ellipse (rotated frame → world frame)
    const sx = cosPhi * (rx * cosA1) - sinPhi * (ry * sinA1) + cx;
    const sy = sinPhi * (rx * cosA1) + cosPhi * (ry * sinA1) + cy;
    const ex = cosPhi * (rx * cosA2) - sinPhi * (ry * sinA2) + cx;
    const ey = sinPhi * (rx * cosA2) + cosPhi * (ry * sinA2) + cy;

    // Tangent directions (derivative of the ellipse point wrt angle)
    // dP/da = (-rx*sin(a), ry*cos(a)) in the rotated frame
    const dx1 = cosPhi * (-rx * sinA1) - sinPhi * (ry * cosA1);
    const dy1 = sinPhi * (-rx * sinA1) + cosPhi * (ry * cosA1);
    const dx2 = cosPhi * (-rx * sinA2) - sinPhi * (ry * cosA2);
    const dy2 = sinPhi * (-rx * sinA2) + cosPhi * (ry * cosA2);

    segments.push({
      x1: sx, y1: sy,
      cx1: sx + k * dx1,
      cy1: sy + k * dy1,
      cx2: ex - k * dx2,
      cy2: ey - k * dy2,
      x2: ex, y2: ey,
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// SVG path d-attribute parser
// ---------------------------------------------------------------------------

/** Tokenize the d string into command chars and numeric args */
function tokenizePath(d: string): Array<{ cmd: string; args: number[] }> {
  // Split on command letters, keeping the letter
  const tokens: Array<{ cmd: string; args: number[] }> = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1];
    const argStr = m[2].trim();
    const nums = argStr.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
    tokens.push({ cmd, args: nums ? nums.map(Number) : [] });
  }
  return tokens;
}

/** Number of arguments consumed per implicit repetition of each command */
const CMD_ARG_COUNT: Record<string, number> = {
  M: 2, m: 2,
  L: 2, l: 2,
  H: 1, h: 1,
  V: 1, v: 1,
  C: 6, c: 6,
  S: 4, s: 4,
  Q: 4, q: 4,
  T: 2, t: 2,
  A: 7, a: 7,
  Z: 0, z: 0,
};

interface SubPath {
  vertices: LbrnVertex[];
  closed: boolean;
}

/**
 * Parse SVG path d attribute into a list of subpaths, each with LbrnVertices.
 * All coordinates are in SVG space — the caller applies toWorld afterwards.
 */
function parseSvgPath(d: string): SubPath[] {
  const tokens = tokenizePath(d);
  if (tokens.length === 0) return [];

  const subPaths: SubPath[] = [];
  let verts: LbrnVertex[] = [];
  let closed = false;

  // Current pen position
  let px = 0, py = 0;
  // Subpath start position (for Z command)
  let sx = 0, sy = 0;
  // Last bezier control point for S/s and T/t smooth commands
  let lastC1x = 0, lastC1y = 0; // absolute, for cubic smooth
  let lastQx = 0, lastQy = 0;   // absolute, for quadratic smooth
  let lastCmd = '';

  function finishSubPath() {
    if (verts.length > 0) {
      // For closed paths: if the last vertex coincides with the first (common
      // in potrace output where the final curve ends exactly at the start),
      // merge them.  This eliminates a zero-length closing segment that can
      // cause rendering artifacts in LightBurn.
      if (closed && verts.length > 2) {
        const first = verts[0];
        const last = verts[verts.length - 1];
        const dist = Math.hypot(last.x - first.x, last.y - first.y);
        if (dist < 0.01) {
          // Transfer the incoming handle from the duplicate end vertex
          // to the first vertex so the closing curve arrives correctly.
          first.c0x = last.c0x;
          first.c0y = last.c0y;
          verts.pop();
        }
      }
      subPaths.push({ vertices: verts, closed });
      verts = [];
      closed = false;
    }
  }

  /**
   * Add a cubic bezier segment from current point (px,py) to (ex,ey)
   * with SVG absolute control points (c1x,c1y) and (c2x,c2y).
   */
  function addCubic(
    c1x: number, c1y: number,
    c2x: number, c2y: number,
    ex: number, ey: number
  ) {
    // Outgoing handle on the current (last) vertex
    const outDx = c1x - px;
    const outDy = c1y - py;
    if (verts.length > 0) {
      verts[verts.length - 1].c1x = outDx;
      verts[verts.length - 1].c1y = outDy;
    }
    // Incoming handle on the new end vertex
    const inDx = c2x - ex;
    const inDy = c2y - ey;
    verts.push({ x: ex, y: ey, c0x: inDx, c0y: inDy, c1x: 0, c1y: 0 });
    lastC1x = c2x;
    lastC1y = c2y;
    px = ex;
    py = ey;
  }

  /**
   * Convert quadratic bezier (px,py → qcx,qcy → ex,ey) to cubic and add.
   */
  function addQuadratic(qcx: number, qcy: number, ex: number, ey: number) {
    // Elevate to cubic: ctrl1 = start + 2/3*(quad_ctrl - start)
    //                   ctrl2 = end   + 2/3*(quad_ctrl - end)
    const c1x = px + (2 / 3) * (qcx - px);
    const c1y = py + (2 / 3) * (qcy - py);
    const c2x = ex + (2 / 3) * (qcx - ex);
    const c2y = ey + (2 / 3) * (qcy - ey);
    addCubic(c1x, c1y, c2x, c2y, ex, ey);
    lastQx = qcx;
    lastQy = qcy;
  }

  function addLine(ex: number, ey: number) {
    verts.push(straightVertex(ex, ey));
    px = ex;
    py = ey;
    lastC1x = px; lastC1y = py;
    lastQx = px; lastQy = py;
  }

  function addArcSegments(segs: CubicSegment[]) {
    for (const seg of segs) {
      addCubic(seg.cx1, seg.cy1, seg.cx2, seg.cy2, seg.x2, seg.y2);
    }
  }

  for (const token of tokens) {
    const { cmd, args } = token;
    const lower = cmd.toLowerCase();
    const isRel = cmd === lower && cmd !== 'z';
    const argCount = CMD_ARG_COUNT[cmd] ?? 0;

    if (cmd === 'Z' || cmd === 'z') {
      closed = true;
      finishSubPath();
      px = sx;
      py = sy;
      lastCmd = cmd;
      continue;
    }

    // Process repeated argument groups
    let i = 0;
    let isFirstM = true;
    do {
      const slice = args.slice(i, i + argCount);
      if (cmd !== 'Z' && cmd !== 'z' && slice.length < argCount) break;

      const rel = (dx: number, dy: number) => ({
        x: isRel ? px + dx : dx,
        y: isRel ? py + dy : dy,
      });
      const relX = (v: number) => isRel ? px + v : v;
      const relY = (v: number) => isRel ? py + v : v;

      if (cmd === 'M' || cmd === 'm') {
        if (!isFirstM) {
          // Implicit L/l after initial move point
          const p = rel(slice[0], slice[1]);
          if (verts.length === 0) verts.push(straightVertex(px, py));
          addLine(p.x, p.y);
        } else {
          // Start new subpath
          finishSubPath();
          const p = rel(slice[0], slice[1]);
          px = p.x; py = p.y;
          sx = px; sy = py;
          verts.push(straightVertex(px, py));
          lastC1x = px; lastC1y = py;
          lastQx = px; lastQy = py;
          isFirstM = false;
        }
      } else if (cmd === 'L' || cmd === 'l') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        const p = rel(slice[0], slice[1]);
        addLine(p.x, p.y);
      } else if (cmd === 'H' || cmd === 'h') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        const nx = relX(slice[0]);
        addLine(nx, py);
      } else if (cmd === 'V' || cmd === 'v') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        const ny = relY(slice[0]);
        addLine(px, ny);
      } else if (cmd === 'C' || cmd === 'c') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        const p1 = rel(slice[0], slice[1]);
        const p2 = rel(slice[2], slice[3]);
        const ep = rel(slice[4], slice[5]);
        addCubic(p1.x, p1.y, p2.x, p2.y, ep.x, ep.y);
      } else if (cmd === 'S' || cmd === 's') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        // Smooth cubic: implicit first control point = reflection of previous c2 through current point
        const reflX = 2 * px - lastC1x;
        const reflY = 2 * py - lastC1y;
        const p2 = rel(slice[0], slice[1]);
        const ep = rel(slice[2], slice[3]);
        addCubic(reflX, reflY, p2.x, p2.y, ep.x, ep.y);
      } else if (cmd === 'Q' || cmd === 'q') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        const qc = rel(slice[0], slice[1]);
        const ep = rel(slice[2], slice[3]);
        addQuadratic(qc.x, qc.y, ep.x, ep.y);
      } else if (cmd === 'T' || cmd === 't') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        // Smooth quadratic: implicit control = reflection of previous quad control through current point
        const prevIsQ = lower === 't' || lastCmd.toLowerCase() === 'q' || lastCmd.toLowerCase() === 't';
        const qcx = prevIsQ ? 2 * px - lastQx : px;
        const qcy = prevIsQ ? 2 * py - lastQy : py;
        const ep = rel(slice[0], slice[1]);
        addQuadratic(qcx, qcy, ep.x, ep.y);
      } else if (cmd === 'A' || cmd === 'a') {
        if (verts.length === 0) verts.push(straightVertex(px, py));
        const arcRx = slice[0];
        const arcRy = slice[1];
        const xRot = slice[2];
        const largeArc = slice[3] !== 0;
        const sweep = slice[4] !== 0;
        const ep = rel(slice[5], slice[6]);
        const segs = arcToCubics(px, py, arcRx, arcRy, xRot, largeArc, sweep, ep.x, ep.y);
        if (segs.length > 0) {
          addArcSegments(segs);
        } else {
          // Degenerate arc — treat as lineto
          addLine(ep.x, ep.y);
        }
      }

      lastCmd = cmd;
      i += Math.max(argCount, 1);
    } while (i < args.length && argCount > 0);
  }

  finishSubPath();
  return subPaths;
}

// ---------------------------------------------------------------------------
// Ellipse / circle → 4-segment cubic bezier approximation
// k = 4/3 * tan(π/8) ≈ 0.5522847498
// ---------------------------------------------------------------------------
const K_ELLIPSE = (4 / 3) * Math.tan(Math.PI / 8); // ≈ 0.5522847498

/**
 * Build vertices for an ellipse centered at (cx,cy) with semi-axes (rx,ry).
 * Returns 4 vertices (top, right, bottom, left order starting from top).
 */
function ellipseVertices(cx: number, cy: number, rx: number, ry: number): LbrnVertex[] {
  // The 4 cardinal points: top, right, bottom, left
  // Each vertex has both incoming and outgoing handles.
  // For a counterclockwise parametrisation starting at right:
  //   P0 = (cx+rx, cy)   handles: c0=(0, -K*ry), c1=(0, +K*ry)  — but we want CW to match SVG
  // SVG ellipses go clockwise. We'll use:
  //   start at top = (cx, cy-ry), go right → bottom → left → top

  const kr = K_ELLIPSE * rx;
  const ku = K_ELLIPSE * ry;

  // top = (cx, cy-ry), outgoing tangent: (+kr, 0), incoming tangent from left: (-kr, 0)
  // right= (cx+rx, cy), outgoing: (0, +ku), incoming: (0, -ku)
  // bottom=(cx, cy+ry), outgoing: (-kr, 0), incoming: (+kr, 0)
  // left= (cx-rx, cy), outgoing: (0, -ku), incoming: (0, +ku)

  return [
    { x: cx,      y: cy - ry, c0x: -kr, c0y: 0,   c1x: kr, c1y: 0   },
    { x: cx + rx, y: cy,      c0x: 0,   c0y: -ku,  c1x: 0,  c1y: ku  },
    { x: cx,      y: cy + ry, c0x: kr,  c0y: 0,    c1x: -kr, c1y: 0  },
    { x: cx - rx, y: cy,      c0x: 0,   c0y: ku,   c1x: 0,  c1y: -ku },
  ];
}

// ---------------------------------------------------------------------------
// Rounded rect helpers
// ---------------------------------------------------------------------------

function roundedRectVertices(
  rx: number, ry: number, x: number, y: number, w: number, h: number
): LbrnVertex[] {
  // Clamp radii
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  const kr = K_ELLIPSE * rx;
  const ku = K_ELLIPSE * ry;

  // 8 vertices: top-left-arc-end, top-right-arc-start, top-right-arc-end, ...
  // Going CW: start at top-left corner arc end (right of top-left arc)
  const verts: LbrnVertex[] = [
    // top edge start (right of top-left rounded corner)
    { x: x + rx,     y: y,         c0x: -kr, c0y: 0,   c1x: 0,  c1y: 0   },
    // top edge end (left of top-right rounded corner)
    { x: x + w - rx, y: y,         c0x: 0,   c0y: 0,   c1x: kr, c1y: 0   },
    // top-right arc end (below top-right arc)
    { x: x + w,      y: y + ry,    c0x: 0,   c0y: -ku, c1x: 0,  c1y: 0   },
    // right edge end (above bottom-right arc)
    { x: x + w,      y: y + h - ry,c0x: 0,   c0y: 0,   c1x: 0,  c1y: ku  },
    // bottom-right arc end
    { x: x + w - rx, y: y + h,     c0x: kr,  c0y: 0,   c1x: 0,  c1y: 0   },
    // bottom edge end
    { x: x + rx,     y: y + h,     c0x: 0,   c0y: 0,   c1x: -kr, c1y: 0  },
    // bottom-left arc end
    { x: x,          y: y + h - ry,c0x: 0,   c0y: ku,  c1x: 0,  c1y: 0   },
    // left edge end
    { x: x,          y: y + ry,    c0x: 0,   c0y: 0,   c1x: 0,  c1y: -ku },
  ];
  return verts;
}

// ---------------------------------------------------------------------------
// Points string parser (for polyline/polygon)
// ---------------------------------------------------------------------------

function parsePoints(s: string): Array<{ x: number; y: number }> {
  const nums = s.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
  if (!nums || nums.length < 2) return [];
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: parseFloat(nums[i]), y: parseFloat(nums[i + 1]) });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Attribute extraction helpers (no DOM — pure regex)
// ---------------------------------------------------------------------------

function getAttr(tag: string, name: string): string | undefined {
  // Match name="value" or name='value'
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = re.exec(tag);
  if (!m) return undefined;
  return m[1] !== undefined ? m[1] : m[2];
}

function getAttrNum(tag: string, name: string, fallback = 0): number {
  const v = getAttr(tag, name);
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function getStyleProp(tag: string, propName: string): string | undefined {
  const style = getAttr(tag, "style");
  if (!style) return undefined;
  const parts = style.split(";");
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    if (key !== propName.toLowerCase()) continue;
    return part.slice(idx + 1).trim();
  }
  return undefined;
}

function getPresentationAttr(tag: string, name: string): string | undefined {
  return getAttr(tag, name) ?? getStyleProp(tag, name);
}

function hasVisibleFill(tag: string): boolean {
  const fill = getPresentationAttr(tag, "fill");
  if (fill == null) {
    // SVG defaults fill to black when unspecified.
    return true;
  }
  return fill.trim().toLowerCase() !== "none";
}

// ---------------------------------------------------------------------------
// SVG element extractor
// Walks the SVG source string, extracts top-level shape element tags and <g>
// blocks (recursively), applies transforms, and returns SubPath[] in SVG space.
// ---------------------------------------------------------------------------

type ToWorldFn = (x: number, y: number) => { x: number; y: number };

/**
 * Remove non-rendered container content that should never become output paths.
 *
 * We intentionally strip common definition blocks (<defs>, <clipPath>, <mask>,
 * etc.) before shape extraction so helper geometry does not get exported as
 * burnable artwork.
 */
function stripNonRenderableContainers(svgSource: string): string {
  return svgSource.replace(
    /<(defs|clippath|mask|pattern|marker|symbol|filter)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ''
  );
}

function buildDefsLeafMap(svgSource: string): Map<string, string> {
  const map = new Map<string, string>();
  const defsRe = /<defs\b[^>]*>([\s\S]*?)<\/defs>/gi;
  let defsMatch: RegExpExecArray | null;

  while ((defsMatch = defsRe.exec(svgSource)) !== null) {
    const defsInner = defsMatch[1];
    const leafRe = /<(path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*>/gi;
    let leafMatch: RegExpExecArray | null;
    while ((leafMatch = leafRe.exec(defsInner)) !== null) {
      const leafTag = leafMatch[0];
      const id = getAttr(leafTag, "id");
      if (!id) continue;
      map.set(id, leafTag);
    }
  }

  return map;
}

function removeAttribute(tag: string, attrName: string): string {
  const re = new RegExp(`\\s+${attrName}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "gi");
  return tag.replace(re, "");
}

function canonicalizeSvgForLbrn(svgSource: string): string {
  const defsLeafMap = buildDefsLeafMap(svgSource);
  if (defsLeafMap.size === 0) return svgSource;

  return svgSource.replace(/<use\b[^>]*\/?\s*>/gi, (useTag) => {
    const href = getAttr(useTag, "href") ?? getAttr(useTag, "xlink:href");
    if (!href || !href.startsWith("#")) return "";

    const target = defsLeafMap.get(href.slice(1));
    if (!target) return "";

    const tx = getAttrNum(useTag, "x", 0);
    const ty = getAttrNum(useTag, "y", 0);
    const useTransform = getAttr(useTag, "transform") ?? "";
    const transformParts: string[] = [];
    if (Math.abs(tx) > 1e-12 || Math.abs(ty) > 1e-12) {
      transformParts.push(`translate(${tx} ${ty})`);
    }
    if (useTransform.trim()) {
      transformParts.push(useTransform.trim());
    }

    const style = getAttr(useTag, "style");
    const className = getAttr(useTag, "class");
    const display = getAttr(useTag, "display");
    const visibility = getAttr(useTag, "visibility");

    const targetNoId = removeAttribute(target, "id");
    const wrapperAttrs: string[] = [];
    if (transformParts.length > 0) {
      wrapperAttrs.push(`transform=\"${transformParts.join(" ")}\"`);
    }
    if (style) wrapperAttrs.push(`style=\"${style}\"`);
    if (className) wrapperAttrs.push(`class=\"${className}\"`);
    if (display) wrapperAttrs.push(`display=\"${display}\"`);
    if (visibility) wrapperAttrs.push(`visibility=\"${visibility}\"`);

    const attrsText = wrapperAttrs.length > 0 ? ` ${wrapperAttrs.join(" ")}` : "";
    return `<g${attrsText}>${targetNoId}</g>`;
  });
}

/**
 * Apply a Mat2D transform (SVG group transform) and then toWorld mapping
 * to a point in SVG space.
 */
function transformPt(
  svgX: number,
  svgY: number,
  mat: Mat2D,
  toWorld: ToWorldFn
): { x: number; y: number } {
  const p = applyMat(mat, svgX, svgY);
  return toWorld(p.x, p.y);
}

/** Transform an offset (handle vector) through the linear part of mat then toWorld linear part */
function transformOffset(
  dx: number,
  dy: number,
  mat: Mat2D,
  sx: number,
  sy: number
): { x: number; y: number } {
  // Apply only the linear (non-translation) part of mat, then scale by sx,sy
  const lp = applyMatLinear(mat, dx, dy);
  return { x: lp.x * sx, y: lp.y * sy };
}

interface WorldTransform {
  mat: Mat2D;
  sx: number; // mm per SVG unit in X
  sy: number; // mm per SVG unit in Y
  toWorld: ToWorldFn;
}

function applyWorldTransform(
  verts: LbrnVertex[],
  wt: WorldTransform
): LbrnVertex[] {
  return verts.map((v) => {
    const wp = transformPt(v.x, v.y, wt.mat, wt.toWorld);
    const wo0 = transformOffset(v.c0x, v.c0y, wt.mat, wt.sx, wt.sy);
    const wo1 = transformOffset(v.c1x, v.c1y, wt.mat, wt.sx, wt.sy);
    return {
      x: wp.x, y: wp.y,
      c0x: wo0.x, c0y: wo0.y,
      c1x: wo1.x, c1y: wo1.y,
    };
  });
}

/**
 * Extract all shape sub-paths from an SVG source string.
 * Returns array of { vertices, closed } in WORLD mm space.
 */
function extractShapesFromSvg(
  svgSource: string,
  wt: WorldTransform,
  groupMat: Mat2D
): Array<SubPath & { worldVerts: LbrnVertex[] }> {
  const results: Array<SubPath & { worldVerts: LbrnVertex[] }> = [];
  const combinedMat = matMul(groupMat, IDENTITY); // identity relative — groupMat is the accumulated mat

  /**
   * Process a block of SVG source with a given accumulated transform matrix.
   */
  function processBlock(source: string, mat: Mat2D): void {
    // We iterate over the source finding element tags.
    // Strategy: find opening tags (<tagName ...) and match to their content.

    const tagRe = /<(\/?)(\w+)([^>]*)(\/?)?>/g;
    let m: RegExpExecArray | null;

    // Build a simple stack-based parser to handle nested <g>
    let pos = 0;
    const gStack: Array<{ mat: Mat2D; endIdx: number }> = [];

    // We need to handle <g ...>...</g> blocks specially.
    // First, find all <g> open/close pairs in this source.

    // Simpler approach: find each element occurrence with a regex walk.
    // For <g>: extract content between <g ...> and </g> (supporting nesting via counting)
    // For leaf elements: just parse the opening tag.

    // Reset regex
    tagRe.lastIndex = 0;
    pos = 0;

    // We'll collect a list of elements: either { type: 'leaf', tag: string, name: string }
    // or { type: 'group', tag: string, content: string, mat: Mat2D }
    // by scanning the source.

    let i = 0;
    while (i < source.length) {
      const openG = source.indexOf('<g', i);
      const openShape = findNextLeafTag(source, i);

      // Determine which comes first
      const gPos = openG >= 0 ? openG : Infinity;
      const shapePos = openShape ? openShape.start : Infinity;

      if (gPos === Infinity && shapePos === Infinity) break;

      if (gPos < shapePos) {
        // Process <g> group — verify the char after '<g' is whitespace, '>' or '/'
        const charAfterG = source[openG + 2];
        if (charAfterG !== ' ' && charAfterG !== '\t' && charAfterG !== '\n' && charAfterG !== '\r' && charAfterG !== '>' && charAfterG !== '/') {
          i = openG + 3;
          continue;
        }
        const gTagEnd = source.indexOf('>', openG);
        if (gTagEnd < 0) break;
        const gTag = source.slice(openG, gTagEnd + 1);
        const isSelfClose = gTag.endsWith('/>') || gTag[gTag.length - 2] === '/';

        if (!isSelfClose) {
          // Find matching </g>
          const content = extractGroupContent(source, gTagEnd + 1);
          if (content !== null) {
            // Skip hidden groups
            const gDisplay = getAttr(gTag, 'display');
            if (gDisplay === 'none') {
              i = content.after;
            } else {
              const transformAttr = getAttr(gTag, 'transform') ?? '';
              const localMat = transformAttr ? parseTransform(transformAttr) : IDENTITY;
              const newMat = matMul(mat, localMat);
              processBlock(content.inner, newMat);
              i = content.after;
            }
          } else {
            i = gTagEnd + 1;
          }
        } else {
          i = gTagEnd + 1;
        }
      } else if (openShape) {
        // Process leaf shape element
        processLeafElement(openShape.name, openShape.tag, mat);
        i = openShape.end;
      } else {
        break;
      }
    }

    // -----------------------------------------------------------------------
    // Inner helpers
    // -----------------------------------------------------------------------

    function processLeafElement(name: string, tag: string, localMat: Mat2D) {
      // Skip hidden elements
      const display = getAttr(tag, 'display');
      if (display === 'none') return;
      const visibility = getAttr(tag, 'visibility');
      if (visibility === 'hidden') return;

      const effectiveMat = matMul(mat, localMat); // mat is the outer, localMat from element
      // For leaf elements we don't have their own transform to add (handled at call site for <g>)
      // But some elements may have transform attr directly — handle that:
      const ownTransform = getAttr(tag, 'transform');
      const elemMat = ownTransform ? matMul(mat, parseTransform(ownTransform)) : mat;

      const wtElem: WorldTransform = { ...wt, mat: IDENTITY };
      // We'll manually apply elemMat + toWorld below per element

      const effectiveToWorld = (svgX: number, svgY: number) => {
        const p = applyMat(elemMat, svgX, svgY);
        return wt.toWorld(p.x, p.y);
      };
      const effectiveOffsetTransform = (dx: number, dy: number) => {
        const lp = applyMatLinear(elemMat, dx, dy);
        return { x: lp.x * wt.sx, y: lp.y * wt.sy };
      };

      function toWorldVert(v: LbrnVertex): LbrnVertex {
        const wp = effectiveToWorld(v.x, v.y);
        const wo0 = effectiveOffsetTransform(v.c0x, v.c0y);
        const wo1 = effectiveOffsetTransform(v.c1x, v.c1y);
        return { x: wp.x, y: wp.y, c0x: wo0.x, c0y: wo0.y, c1x: wo1.x, c1y: wo1.y };
      }

      if (name === 'path') {
        const d = getAttr(tag, 'd') ?? '';
        if (!d) return;
        const subpaths = parseSvgPath(d);
        const forceClosed = hasVisibleFill(tag);
        for (const sp of subpaths) {
          if (sp.vertices.length < 2) continue;
          results.push({
            vertices: sp.vertices,
            closed: sp.closed || forceClosed,
            worldVerts: sp.vertices.map(toWorldVert),
          });
        }
      } else if (name === 'circle') {
        const cx = getAttrNum(tag, 'cx');
        const cy = getAttrNum(tag, 'cy');
        const r = getAttrNum(tag, 'r');
        if (r <= 0) return;
        const verts = ellipseVertices(cx, cy, r, r);
        results.push({ vertices: verts, closed: true, worldVerts: verts.map(toWorldVert) });
      } else if (name === 'ellipse') {
        const cx = getAttrNum(tag, 'cx');
        const cy = getAttrNum(tag, 'cy');
        const rx2 = getAttrNum(tag, 'rx');
        const ry2 = getAttrNum(tag, 'ry');
        if (rx2 <= 0 || ry2 <= 0) return;
        const verts = ellipseVertices(cx, cy, rx2, ry2);
        results.push({ vertices: verts, closed: true, worldVerts: verts.map(toWorldVert) });
      } else if (name === 'rect') {
        const rx2 = getAttrNum(tag, 'rx', -1);
        const ry2 = getAttrNum(tag, 'ry', -1);
        const rx3 = getAttrNum(tag, 'x');
        const ry3 = getAttrNum(tag, 'y');
        const rw = getAttrNum(tag, 'width');
        const rh = getAttrNum(tag, 'height');
        if (rw <= 0 || rh <= 0) return;

        const effectiveRx = rx2 >= 0 ? rx2 : (ry2 >= 0 ? ry2 : 0);
        const effectiveRy = ry2 >= 0 ? ry2 : (rx2 >= 0 ? rx2 : 0);

        if (effectiveRx > 0 || effectiveRy > 0) {
          const verts = roundedRectVertices(effectiveRx, effectiveRy, rx3, ry3, rw, rh);
          results.push({ vertices: verts, closed: true, worldVerts: verts.map(toWorldVert) });
        } else {
          const verts: LbrnVertex[] = [
            straightVertex(rx3, ry3),
            straightVertex(rx3 + rw, ry3),
            straightVertex(rx3 + rw, ry3 + rh),
            straightVertex(rx3, ry3 + rh),
          ];
          results.push({ vertices: verts, closed: true, worldVerts: verts.map(toWorldVert) });
        }
      } else if (name === 'line') {
        const lx1 = getAttrNum(tag, 'x1');
        const ly1 = getAttrNum(tag, 'y1');
        const lx2 = getAttrNum(tag, 'x2');
        const ly2 = getAttrNum(tag, 'y2');
        const verts: LbrnVertex[] = [straightVertex(lx1, ly1), straightVertex(lx2, ly2)];
        results.push({ vertices: verts, closed: false, worldVerts: verts.map(toWorldVert) });
      } else if (name === 'polyline' || name === 'polygon') {
        const pointsStr = getAttr(tag, 'points') ?? '';
        const pts = parsePoints(pointsStr);
        if (pts.length < 2) return;
        const verts: LbrnVertex[] = pts.map((p) => straightVertex(p.x, p.y));
        results.push({
          vertices: verts,
          closed: name === 'polygon',
          worldVerts: verts.map(toWorldVert),
        });
      }
    }
  }

  processBlock(svgSource, combinedMat);
  return results;
}

// ---------------------------------------------------------------------------
// Helper: find the next leaf shape tag in source starting at position start
// ---------------------------------------------------------------------------
const LEAF_TAGS = ['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'];

function findNextLeafTag(
  source: string,
  start: number
): { name: string; tag: string; start: number; end: number } | null {
  let best: { name: string; tag: string; start: number; end: number } | null = null;

  for (const tagName of LEAF_TAGS) {
    // Find <tagName (space or >) or <tagName/>
    const pattern = new RegExp(`<${tagName}[\\s>/]`, 'i');
    pattern.lastIndex = 0;
    const searchIn = source.slice(start);
    const m = pattern.exec(searchIn);
    if (!m) continue;

    const absStart = start + m.index;
    // Find closing > of this tag
    const tagEnd = source.indexOf('>', absStart);
    if (tagEnd < 0) continue;

    const tag = source.slice(absStart, tagEnd + 1);
    const pos = { name: tagName, tag, start: absStart, end: tagEnd + 1 };
    if (!best || pos.start < best.start) best = pos;
  }

  return best;
}

// ---------------------------------------------------------------------------
// Helper: extract content between <g ...> and matching </g>
// ---------------------------------------------------------------------------
function extractGroupContent(
  source: string,
  afterOpenTag: number
): { inner: string; after: number } | null {
  let depth = 1;
  let i = afterOpenTag;

  while (i < source.length && depth > 0) {
    const nextOpen = source.indexOf('<g', i);
    const nextClose = source.indexOf('</g>', i);

    if (nextClose < 0) return null; // malformed

    if (nextOpen >= 0 && nextOpen < nextClose) {
      // Check it's actually an opening <g (not <glyph etc)
      const charAfter = source[nextOpen + 2];
      if (charAfter === '>' || charAfter === ' ' || charAfter === '\t' || charAfter === '\n' || charAfter === '\r' || charAfter === '/') {
        // Check it's not self-closing
        const tagEnd = source.indexOf('>', nextOpen);
        if (tagEnd >= 0 && source[tagEnd - 1] !== '/') {
          depth++;
          i = tagEnd + 1;
          continue;
        }
      }
      i = nextOpen + 3;
    } else {
      depth--;
      if (depth === 0) {
        return {
          inner: source.slice(afterOpenTag, nextClose),
          after: nextClose + 4, // length of '</g>'
        };
      }
      i = nextClose + 4;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Parse SVG viewBox, falling back to width/height attributes on <svg>
// ---------------------------------------------------------------------------

function parseSvgViewBox(
  svgText: string
): { vbX: number; vbY: number; vbW: number; vbH: number } | null {
  // Try viewBox first
  const vbMatch = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svgText);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      return { vbX: parts[0], vbY: parts[1], vbW: parts[2], vbH: parts[3] };
    }
  }

  // Fallback: extract width/height from the root <svg> element
  const svgTagMatch = /<svg[^>]*>/i.exec(svgText);
  if (!svgTagMatch) return null;
  const svgTag = svgTagMatch[0];

  const wRaw = getAttr(svgTag, "width");
  const hRaw = getAttr(svgTag, "height");
  if (!wRaw || !hRaw) return null;

  // Strip unit suffixes (px, pt, mm, etc) — treat bare numbers as unitless
  const w = parseFloat(wRaw);
  const h = parseFloat(hRaw);
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;

  return { vbX: 0, vbY: 0, vbW: w, vbH: h };
}

// ---------------------------------------------------------------------------
// Raster <image> → LightBurn Bitmap shape
// ---------------------------------------------------------------------------

function extractImageDataUrl(svgText: string): string | null {
  // Match <image ... href="data:..." /> or xlink:href="data:..."
  const imgRe = /<image[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(svgText)) !== null) {
    const tag = m[0];
    const href =
      getAttr(tag, "href") ??
      getAttr(tag, "xlink:href") ??
      // After namespace stripping, xlink:href becomes href — try the raw source too
      (/href\s*=\s*["']([^"']+)["']/i.exec(tag))?.[1];
    if (href && href.startsWith("data:image/")) return href;
  }
  return null;
}

function parsePngDimensions(base64: string): { w: number; h: number } | null {
  try {
    // PNG header: bytes 16–19 = width, 20–23 = height (big-endian)
    const raw = atob(base64.slice(0, 44)); // 44 base64 chars ≈ 33 bytes
    if (raw.charCodeAt(0) !== 137 || raw.charCodeAt(1) !== 80) return null; // not PNG
    const w =
      (raw.charCodeAt(16) << 24) |
      (raw.charCodeAt(17) << 16) |
      (raw.charCodeAt(18) << 8) |
      raw.charCodeAt(19);
    const h =
      (raw.charCodeAt(20) << 24) |
      (raw.charCodeAt(21) << 16) |
      (raw.charCodeAt(22) << 8) |
      raw.charCodeAt(23);
    return w > 0 && h > 0 ? { w, h } : null;
  } catch {
    return null;
  }
}

function buildBitmapShapeXml(
  base64Data: string,
  pixelW: number,
  pixelH: number,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  cutIndex: number
): string {
  const scaleX = widthMm / pixelW;
  const scaleY = heightMm / pixelH;
  const cx = xMm + widthMm / 2;
  const cy = yMm + heightMm / 2;

  // Approximate byte count for the Length attribute (decoded bytes ≈ base64 * 3/4)
  const byteLen = Math.ceil((base64Data.length * 3) / 4);

  return [
    `<Shape Type="Bitmap" CutIndex="${cutIndex}" W="${pixelW}" H="${pixelH}">`,
    `  <XForm>${scaleX.toFixed(6)} 0 0 ${scaleY.toFixed(6)} ${cx.toFixed(4)} ${cy.toFixed(4)}</XForm>`,
    `  <Data Length="${byteLen}">${base64Data}</Data>`,
    `</Shape>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Rotation helper for world-space vertices
// ---------------------------------------------------------------------------

/**
 * Rotate world-space vertices (and their bezier handle offsets) around a
 * center point.  Used to apply PlacedItem rotation that isn't baked into
 * the SVG content itself.
 */
function rotateWorldVertices(
  vertices: LbrnVertex[],
  rotationDeg: number,
  cx: number,
  cy: number,
): LbrnVertex[] {
  if (Math.abs(rotationDeg) < 0.001) return vertices;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return vertices.map((v) => {
    const dx = v.x - cx;
    const dy = v.y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
      // Handle offsets are direction vectors — rotate without translation
      c0x: v.c0x * cos - v.c0y * sin,
      c0y: v.c0x * sin + v.c0y * cos,
      c1x: v.c1x * cos - v.c1y * sin,
      c1y: v.c1x * sin + v.c1y * cos,
    };
  });
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export function extractLbrnShapesFromItem(
  item: {
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    rotationDeg?: number;
    svgText: string;
  },
  cutIndex: number,
  ids: PathIdState = { nextVertId: 0, nextPrimId: 0 }
): string[] {
  const { xMm, yMm, widthMm, heightMm, svgText } = item;

  const xmlBlocks: string[] = [];

  for (const shape of extractWorldShapesFromItem(item)) {
    const canonicalVerts = shape.worldVerts
      .filter((v) => isFinite(v.x) && isFinite(v.y));
    const xml = buildPathXml(canonicalVerts, shape.closed, cutIndex, ids);
    if (xml.length > 0) xmlBlocks.push(...xml);
  }

  // --- 5. Extract raster <image> elements as LightBurn Bitmap shapes ---
  if (xmlBlocks.length === 0) {
    const dataUrl = extractImageDataUrl(svgText);
    if (dataUrl) {
      // Strip "data:image/...;base64," prefix to get raw base64
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx >= 0) {
        const base64 = dataUrl.slice(commaIdx + 1);
        // Try to get real pixel dimensions from the image header
        const pngDims = parsePngDimensions(base64);
        // Fall back to 300 DPI estimate from mm dimensions
        const pixelW = pngDims?.w ?? Math.round(widthMm / 25.4 * 300);
        const pixelH = pngDims?.h ?? Math.round(heightMm / 25.4 * 300);

        if (pixelW > 0 && pixelH > 0) {
          xmlBlocks.push(
            buildBitmapShapeXml(base64, pixelW, pixelH, xMm, yMm, widthMm, heightMm, cutIndex)
          );
        }
      }
    }
  }

  return xmlBlocks;
}

function flipVertsForLightBurnLocalSpace(vertices: LbrnVertex[]): LbrnVertex[] {
  return vertices.map((vertex) => ({
    x: vertex.x,
    y: -vertex.y,
    c0x: vertex.c0x,
    c0y: -vertex.c0y,
    c1x: vertex.c1x,
    c1y: -vertex.c1y,
  }));
}

export function extractLbrnLocalShapesFromItem(
  item: {
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    rotationDeg?: number;
    svgText: string;
  },
  cutIndex: number,
  ids: PathIdState = { nextVertId: 0, nextPrimId: 0 }
): string[] {
  const xmlBlocks: string[] = [];

  for (const shape of extractWorldShapesFromItem(item)) {
    const localVerts = flipVertsForLightBurnLocalSpace(shape.worldVerts)
      .filter((vertex) => isFinite(vertex.x) && isFinite(vertex.y));
    const xml = buildPathXml(localVerts, shape.closed, cutIndex, ids);
    if (xml.length > 0) xmlBlocks.push(...xml);
  }

  return xmlBlocks;
}

function prepareSvgForVectorExtraction(svgText: string): string {
  return stripNonRenderableContainers(
    canonicalizeSvgForLbrn(
      svgText
        .replace(/<(\/?)[\w]+-/g, '<$1')
        .replace(/<(\/?)([\w]+):/g, '<$1')
    )
  );
}

function extractWorldShapesFromItem(item: {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg?: number;
  svgText: string;
}): Array<{ worldVerts: LbrnVertex[]; closed: boolean }> {
  const { xMm, yMm, widthMm, heightMm } = item;
  const rotationDeg = item.rotationDeg ?? 0;
  const svgText = prepareSvgForVectorExtraction(item.svgText);
  const vb = parseSvgViewBox(svgText);
  if (!vb) return [];

  const { vbX, vbY, vbW, vbH } = vb;
  const sx = widthMm / vbW;
  const sy = heightMm / vbH;
  const toWorld = (svgX: number, svgY: number): { x: number; y: number } => ({
    x: xMm + (svgX - vbX) * sx,
    y: yMm + (svgY - vbY) * sy,
  });
  const wt: WorldTransform = { mat: IDENTITY, sx, sy, toWorld };
  const rotateCx = xMm + widthMm / 2;
  const rotateCy = yMm + heightMm / 2;

  return extractShapesFromSvg(svgText, wt, IDENTITY)
    .map((shape) => {
      const worldVerts =
        Math.abs(rotationDeg) > 0.001
          ? rotateWorldVertices(shape.worldVerts, rotationDeg, rotateCx, rotateCy)
          : shape.worldVerts;
      return {
        closed: shape.closed,
        worldVerts: worldVerts.filter((vertex) => isFinite(vertex.x) && isFinite(vertex.y)),
      };
    })
    .filter((shape) => shape.worldVerts.length >= 2);
}

function buildFlattenedSvgPathData(vertices: LbrnVertex[], closed: boolean): string | null {
  const flatVerts = flattenVertices(vertices, closed)
    .filter((vertex) => isFinite(vertex.x) && isFinite(vertex.y));
  if (flatVerts.length < 2) return null;

  const commands = [
    `M${fmt(flatVerts[0].x)} ${fmt(flatVerts[0].y)}`,
    ...flatVerts.slice(1).map((vertex) => `L${fmt(vertex.x)} ${fmt(vertex.y)}`),
  ];
  if (closed) {
    commands.push("Z");
  }
  return commands.join(" ");
}

export function extractFlattenedSvgPathsFromItem(item: {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg?: number;
  svgText: string;
}): Array<{ d: string; closed: boolean }> {
  return extractWorldShapesFromItem(item)
    .map((shape) => {
      const d = buildFlattenedSvgPathData(shape.worldVerts, shape.closed);
      return d ? { d, closed: shape.closed } : null;
    })
    .filter((shape): shape is { d: string; closed: boolean } => shape !== null);
}
