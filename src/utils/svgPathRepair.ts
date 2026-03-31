"use client";

/**
 * svgPathRepair.ts
 *
 * Detects and repairs broken/problematic nodes in SVG path data.
 *
 * ─ analyzesvgPaths  : Scan every <path> in an SVG for issues
 * ─ repairSvgPaths   : Auto-fix all fixable issues, return cleaned SVG
 */

// ─── Path command tokenizer ────────────────────────────────────────────────

/**
 * Number of coordinate arguments each SVG path command consumes per repetition.
 */
const PARAM_COUNTS: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1,
  C: 6, S: 4, Q: 4, T: 2,
  A: 7, Z: 0,
};

interface RawCmd { op: string; args: number[]; rel: boolean; }

/** Tokenize a path `d` attribute string into an array of commands. */
function tokenizePath(d: string): RawCmd[] {
  const cmds: RawCmd[] = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];
    if (!/^[MmLlHhVvCcSsQqTtAaZz]$/.test(t)) { i++; continue; }

    const rel = t !== "Z" && t !== "z" && t === t.toLowerCase();
    const op  = t.toUpperCase();
    const n   = PARAM_COUNTS[op] ?? 0;
    i++;

    if (n === 0) { cmds.push({ op, args: [], rel }); continue; }

    let isFirstGroup = true;
    while (i < tokens.length && !/^[MmLlHhVvCcSsQqTtAaZz]$/.test(tokens[i])) {
      const args: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i >= tokens.length || /^[MmLlHhVvCcSsQqTtAaZz]$/.test(tokens[i])) break;
        args.push(parseFloat(tokens[i++]));
      }
      if (args.length < n) break;

      // After the first M pair, implicit repeats become L
      const effectiveOp = (!isFirstGroup && op === "M") ? "L" : op;
      cmds.push({ op: effectiveOp, args, rel });
      isFirstGroup = false;
    }
  }
  return cmds;
}

// ─── Position tracking ────────────────────────────────────────────────────

interface Point { x: number; y: number; }

/** Resolve a command's endpoint given the current cursor. */
function cmdEndpoint(cmd: RawCmd, cx: number, cy: number): Point {
  const a = cmd.args;
  const dx = cmd.rel ? cx : 0;
  const dy = cmd.rel ? cy : 0;

  switch (cmd.op) {
    case "M": case "L": case "T": return { x: a[0] + dx, y: a[1] + dy };
    case "H": return { x: a[0] + (cmd.rel ? cx : 0), y: cy };
    case "V": return { x: cx, y: a[0] + (cmd.rel ? cy : 0) };
    case "C": return { x: a[4] + dx, y: a[5] + dy };
    case "S": case "Q": return { x: a[2] + dx, y: a[3] + dy };
    case "A": return { x: a[5] + dx, y: a[6] + dy };
    case "Z": return { x: cx, y: cy };
    default:  return { x: cx, y: cy };
  }
}

// ─── Subpath analysis ─────────────────────────────────────────────────────

interface Subpath {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  drawCmdCount: number; // L/C/Q/A/S/T/H/V commands (not M or Z)
  isClosed: boolean;
  cmdStartIdx: number;  // index in parent cmds array where this subpath begins
  cmdEndIdx: number;    // inclusive
}

function splitSubpaths(cmds: RawCmd[]): Subpath[] {
  const subpaths: Subpath[] = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  let subStart = -1;
  let drawCount = 0;
  let closed = false;

  const flush = (endIdx: number) => {
    if (subStart < 0) return;
    subpaths.push({
      startX, startY,
      endX: cx, endY: cy,
      drawCmdCount: drawCount,
      isClosed: closed,
      cmdStartIdx: subStart,
      cmdEndIdx: endIdx,
    });
  };

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    if (cmd.op === "M") {
      flush(i - 1);
      const pt = cmdEndpoint(cmd, cx, cy);
      cx = pt.x; cy = pt.y;
      startX = cx; startY = cy;
      subStart = i;
      drawCount = 0;
      closed = false;
    } else if (cmd.op === "Z") {
      closed = true;
      cx = startX; cy = startY;
      flush(i);
      subStart = -1;
    } else {
      const pt = cmdEndpoint(cmd, cx, cy);
      cx = pt.x; cy = pt.y;
      drawCount++;
    }
  }
  flush(cmds.length - 1);
  return subpaths;
}

// ─── Issue types ──────────────────────────────────────────────────────────

export type PathIssueType =
  | "OPEN_PATH"           // subpath has draw commands but no Z
  | "NEAR_CLOSED_PATH"    // start & end are within 0.5 units — almost certainly should be closed
  | "DEGENERATE_SUBPATH"  // M immediately followed by Z (or M…M) with zero draw commands
  | "DUPLICATE_PATH"      // identical `d` string as another path in the file
  | "DUPLICATE_NODES"     // consecutive commands that end at the same point
  | "TINY_SEGMENT";       // segment shorter than 0.01 user units (likely noise)

export interface PathIssue {
  type: PathIssueType;
  severity: "error" | "warn" | "info";
  pathIndex: number;   // which <path> element (0-based)
  elementId?: string;  // `id` attribute if present
  message: string;
  fixable: boolean;
}

export interface PathRepairReport {
  pathCount: number;
  nodeCount: number;     // total coordinate pairs across all paths
  subpathCount: number;
  issues: PathIssue[];
  fixableCount: number;
}

// ─── Distance helper ──────────────────────────────────────────────────────

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

// ─── Analyse ──────────────────────────────────────────────────────────────

export function analyzesvgPaths(svgContent: string): PathRepairReport {
  const empty: PathRepairReport = {
    pathCount: 0, nodeCount: 0, subpathCount: 0,
    issues: [], fixableCount: 0,
  };
  if (typeof window === "undefined") return empty;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  if (doc.querySelector("parsererror")) return empty;

  const pathEls = Array.from(doc.querySelectorAll("path"));
  if (pathEls.length === 0) return empty;

  const issues: PathIssue[] = [];
  let nodeCount = 0;
  let subpathCount = 0;

  // Collect all d= values to find duplicates
  const dValues: string[] = pathEls.map(el => (el.getAttribute("d") ?? "").trim());
  const dSeen = new Map<string, number>(); // d string → first index

  dValues.forEach((d, idx) => {
    const elementId = pathEls[idx].getAttribute("id") ?? undefined;
    const cmds = tokenizePath(d);

    // Count nodes (each coordinate pair is a node)
    nodeCount += cmds.reduce((acc, c) => acc + Math.floor(c.args.length / 2), 0);

    const subpaths = splitSubpaths(cmds);
    subpathCount += subpaths.length;

    // ── Degenerate subpaths ──
    for (const sp of subpaths) {
      if (sp.drawCmdCount === 0 && !sp.isClosed) {
        issues.push({
          type: "DEGENERATE_SUBPATH",
          severity: "warn",
          pathIndex: idx, elementId,
          message: `Path ${idx + 1}: contains a subpath with no drawing commands (orphaned moveto).`,
          fixable: true,
        });
      }
    }

    // ── Open / near-closed paths ──
    for (const sp of subpaths) {
      if (sp.drawCmdCount === 0) continue; // already flagged above or intentional point

      if (!sp.isClosed) {
        const gap = dist(sp.startX, sp.startY, sp.endX, sp.endY);
        if (gap < 0.5) {
          issues.push({
            type: "NEAR_CLOSED_PATH",
            severity: "warn",
            pathIndex: idx, elementId,
            message: `Path ${idx + 1}: start and end are ${gap.toFixed(3)} units apart — almost closed. Add Z to close.`,
            fixable: true,
          });
        } else {
          issues.push({
            type: "OPEN_PATH",
            severity: "info",
            pathIndex: idx, elementId,
            message: `Path ${idx + 1}: open path (no Z). OK for line engraving; close if this is a filled shape or cut.`,
            fixable: true,
          });
        }
      }
    }

    // ── Duplicate consecutive nodes ──
    {
      let cx = 0, cy = 0;
      let prevEndX = NaN, prevEndY = NaN;
      let dupCount = 0;
      for (const cmd of cmds) {
        if (cmd.op === "Z") { cx = 0; cy = 0; prevEndX = NaN; prevEndY = NaN; continue; }
        const pt = cmdEndpoint(cmd, cx, cy);
        if (!isNaN(prevEndX) && dist(pt.x, pt.y, prevEndX, prevEndY) < 0.001) {
          dupCount++;
        }
        prevEndX = pt.x; prevEndY = pt.y;
        cx = pt.x; cy = pt.y;
      }
      if (dupCount > 0) {
        issues.push({
          type: "DUPLICATE_NODES",
          severity: "warn",
          pathIndex: idx, elementId,
          message: `Path ${idx + 1}: ${dupCount} consecutive duplicate node${dupCount !== 1 ? "s" : ""} — redundant anchor points cause double-burn.`,
          fixable: true,
        });
      }
    }

    // ── Tiny segments ──
    {
      let cx = 0, cy = 0;
      let tinyCount = 0;
      for (const cmd of cmds) {
        if (cmd.op === "M" || cmd.op === "Z") {
          const pt = cmdEndpoint(cmd, cx, cy);
          cx = pt.x; cy = pt.y; continue;
        }
        const pt = cmdEndpoint(cmd, cx, cy);
        if (dist(cx, cy, pt.x, pt.y) < 0.01 && dist(cx, cy, pt.x, pt.y) > 0) tinyCount++;
        cx = pt.x; cy = pt.y;
      }
      if (tinyCount > 0) {
        issues.push({
          type: "TINY_SEGMENT",
          severity: "warn",
          pathIndex: idx, elementId,
          message: `Path ${idx + 1}: ${tinyCount} tiny segment${tinyCount !== 1 ? "s" : ""} (<0.01 units) — may cause laser stutter or burnt spots.`,
          fixable: true,
        });
      }
    }

    // ── Duplicate paths ──
    if (d.length > 0) {
      const firstSeen = dSeen.get(d);
      if (firstSeen !== undefined) {
        issues.push({
          type: "DUPLICATE_PATH",
          severity: "warn",
          pathIndex: idx, elementId,
          message: `Path ${idx + 1}: identical to path ${firstSeen + 1} — double-burn risk.`,
          fixable: true,
        });
      } else {
        dSeen.set(d, idx);
      }
    }
  });

  const fixableCount = issues.filter(i => i.fixable).length;

  return {
    pathCount: pathEls.length,
    nodeCount,
    subpathCount,
    issues,
    fixableCount,
  };
}

// ─── Repair ───────────────────────────────────────────────────────────────

export interface RepairResult {
  fixed: string;
  report: PathRepairReport;
  closedCount: number;
  removedDegenerateCount: number;
  removedDuplicatePathCount: number;
  removedDuplicateNodeCount: number;
  removedTinySegmentCount: number;
}

export interface DespeckleResult {
  cleaned: string;
  removedPathCount: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function accumulateBounds(bounds: Bounds | null, x: number, y: number): Bounds {
  if (!bounds) {
    return { minX: x, minY: y, maxX: x, maxY: y };
  }

  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  };
}

function computePathBounds(cmds: RawCmd[]): Bounds | null {
  let bounds: Bounds | null = null;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of cmds) {
    const dx = cmd.rel ? cx : 0;
    const dy = cmd.rel ? cy : 0;

    switch (cmd.op) {
      case "M":
      case "L":
      case "T": {
        bounds = accumulateBounds(bounds, cmd.args[0] + dx, cmd.args[1] + dy);
        const pt = cmdEndpoint(cmd, cx, cy);
        cx = pt.x;
        cy = pt.y;
        if (cmd.op === "M") {
          startX = cx;
          startY = cy;
        }
        break;
      }
      case "H": {
        bounds = accumulateBounds(bounds, cmd.args[0] + dx, cy);
        const pt = cmdEndpoint(cmd, cx, cy);
        cx = pt.x;
        cy = pt.y;
        break;
      }
      case "V": {
        bounds = accumulateBounds(bounds, cx, cmd.args[0] + dy);
        const pt = cmdEndpoint(cmd, cx, cy);
        cx = pt.x;
        cy = pt.y;
        break;
      }
      case "C": {
        bounds = accumulateBounds(bounds, cmd.args[0] + dx, cmd.args[1] + dy);
        bounds = accumulateBounds(bounds, cmd.args[2] + dx, cmd.args[3] + dy);
        bounds = accumulateBounds(bounds, cmd.args[4] + dx, cmd.args[5] + dy);
        const pt = cmdEndpoint(cmd, cx, cy);
        cx = pt.x;
        cy = pt.y;
        break;
      }
      case "S":
      case "Q": {
        bounds = accumulateBounds(bounds, cmd.args[0] + dx, cmd.args[1] + dy);
        bounds = accumulateBounds(bounds, cmd.args[2] + dx, cmd.args[3] + dy);
        const pt = cmdEndpoint(cmd, cx, cy);
        cx = pt.x;
        cy = pt.y;
        break;
      }
      case "A": {
        bounds = accumulateBounds(bounds, cx, cy);
        bounds = accumulateBounds(bounds, cmd.args[5] + dx, cmd.args[6] + dy);
        const pt = cmdEndpoint(cmd, cx, cy);
        cx = pt.x;
        cy = pt.y;
        break;
      }
      case "Z": {
        bounds = accumulateBounds(bounds, startX, startY);
        cx = startX;
        cy = startY;
        break;
      }
      default:
        break;
    }
  }

  return bounds;
}

function parseRootBounds(svgTag: Element): { width: number; height: number } | null {
  const viewBox = svgTag.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value))
      .filter((value) => Number.isFinite(value));
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const width = Number.parseFloat((svgTag.getAttribute("width") ?? "").replace(/[^\d.+-]/g, ""));
  const height = Number.parseFloat((svgTag.getAttribute("height") ?? "").replace(/[^\d.+-]/g, ""));
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  return null;
}

function hasVisiblePaint(el: Element): boolean {
  const fill = (el.getAttribute("fill") ?? "").trim().toLowerCase();
  const stroke = (el.getAttribute("stroke") ?? "").trim().toLowerCase();
  const style = (el.getAttribute("style") ?? "").toLowerCase();
  const hasFill = fill !== "" && fill !== "none" && fill !== "transparent";
  const hasStroke = stroke !== "" && stroke !== "none" && stroke !== "transparent";
  const styleFillVisible = /fill\s*:\s*(?!none|transparent)/.test(style);
  const styleStrokeVisible = /stroke\s*:\s*(?!none|transparent)/.test(style);
  return hasFill || hasStroke || styleFillVisible || styleStrokeVisible;
}

export function despeckleSvgPaths(
  svgContent: string,
  options?: {
    level?: number;
  },
): DespeckleResult {
  const level = Math.max(0, Math.min(4, Math.round(options?.level ?? 0)));
  if (level <= 0 || typeof window === "undefined") {
    return { cleaned: svgContent, removedPathCount: 0 };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return { cleaned: svgContent, removedPathCount: 0 };
  }

  const svgEl = doc.querySelector("svg");
  if (!svgEl) {
    return { cleaned: svgContent, removedPathCount: 0 };
  }

  const rootBounds = parseRootBounds(svgEl);
  if (!rootBounds) {
    return { cleaned: svgContent, removedPathCount: 0 };
  }

  const minDimensionRatios = [0, 0.0008, 0.0014, 0.0022, 0.0032];
  const minAreaRatios = [0, 0.0000008, 0.0000016, 0.0000032, 0.000006];
  const maxRootDimension = Math.max(rootBounds.width, rootBounds.height);
  const minDimension = maxRootDimension * minDimensionRatios[level];
  const minArea = rootBounds.width * rootBounds.height * minAreaRatios[level];

  let removedPathCount = 0;
  for (const el of Array.from(doc.querySelectorAll("path"))) {
    if (!hasVisiblePaint(el)) continue;
    const d = (el.getAttribute("d") ?? "").trim();
    if (!d) continue;

    const bounds = computePathBounds(tokenizePath(d));
    if (!bounds) continue;

    const width = Math.max(0, bounds.maxX - bounds.minX);
    const height = Math.max(0, bounds.maxY - bounds.minY);
    const area = width * height;

    if ((width <= minDimension && height <= minDimension) || area <= minArea) {
      el.parentNode?.removeChild(el);
      removedPathCount += 1;
    }
  }

  return {
    cleaned: new XMLSerializer().serializeToString(doc),
    removedPathCount,
  };
}

/**
 * Auto-fix all fixable issues in the SVG:
 *  - Close near-closed and open paths (adds Z)
 *  - Remove degenerate subpaths (M…no-draw…M or M with nothing)
 *  - Remove duplicate path elements
 *  - Remove consecutive duplicate nodes
 *  - Remove tiny segments
 */
export function repairSvgPaths(svgContent: string): RepairResult {
  const zeroResult: RepairResult = {
    fixed: svgContent, report: analyzesvgPaths(svgContent),
    closedCount: 0, removedDegenerateCount: 0,
    removedDuplicatePathCount: 0, removedDuplicateNodeCount: 0, removedTinySegmentCount: 0,
  };
  if (typeof window === "undefined") return zeroResult;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  if (doc.querySelector("parsererror")) return zeroResult;

  const pathEls = Array.from(doc.querySelectorAll("path"));
  if (pathEls.length === 0) return zeroResult;

  let closedCount = 0;
  let removedDegenerateCount = 0;
  let removedDuplicatePathCount = 0;
  let removedDuplicateNodeCount = 0;
  let removedTinySegmentCount = 0;

  // ── Pass 1: Remove duplicate path elements ──
  const seenD = new Set<string>();
  for (const el of pathEls) {
    const d = (el.getAttribute("d") ?? "").trim();
    if (d && seenD.has(d)) {
      el.parentNode?.removeChild(el);
      removedDuplicatePathCount++;
    } else {
      seenD.add(d);
    }
  }

  // ── Pass 2: Repair each remaining path ──
  const remainingPaths = Array.from(doc.querySelectorAll("path"));
  for (const el of remainingPaths) {
    const rawD = (el.getAttribute("d") ?? "").trim();
    if (!rawD) continue;

    const cmds = tokenizePath(rawD);
    const outputCmds: RawCmd[] = [];

    let cx = 0, cy = 0;
    let subpathStartX = 0, subpathStartY = 0;
    let subpathDrawCount = 0;
    let prevEndX = NaN, prevEndY = NaN;

    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];

      // Remove tiny segments (except M/Z)
      if (cmd.op !== "M" && cmd.op !== "Z") {
        const pt = cmdEndpoint(cmd, cx, cy);
        const segLen = dist(cx, cy, pt.x, pt.y);
        if (segLen < 0.01 && segLen > 0) {
          removedTinySegmentCount++;
          // Don't advance cx/cy — skip this command
          continue;
        }

        // Remove duplicate consecutive node
        if (!isNaN(prevEndX) && dist(pt.x, pt.y, prevEndX, prevEndY) < 0.001) {
          removedDuplicateNodeCount++;
          continue;
        }
      }

      if (cmd.op === "M") {
        // Before starting new subpath, close the previous one if it was degenerate
        if (outputCmds.length > 0 && subpathDrawCount === 0) {
          // Orphan moveto — remove the last M from output
          // Walk back and remove the last M
          while (outputCmds.length > 0 && outputCmds[outputCmds.length - 1].op === "M") {
            outputCmds.pop();
            removedDegenerateCount++;
          }
        }
        const pt = cmdEndpoint(cmd, cx, cy);
        cx = pt.x; cy = pt.y;
        subpathStartX = cx; subpathStartY = cy;
        subpathDrawCount = 0;
        prevEndX = NaN; prevEndY = NaN;
        outputCmds.push(cmd);
      } else if (cmd.op === "Z") {
        if (subpathDrawCount === 0) {
          // Degenerate: M…Z with no draws — remove the preceding M
          while (outputCmds.length > 0 && outputCmds[outputCmds.length - 1].op === "M") {
            outputCmds.pop();
            removedDegenerateCount++;
          }
        } else {
          outputCmds.push(cmd);
          closedCount++; // we kept a Z
        }
        cx = subpathStartX; cy = subpathStartY;
        prevEndX = NaN; prevEndY = NaN;
        subpathDrawCount = 0;
      } else {
        const pt = cmdEndpoint(cmd, cx, cy);
        prevEndX = pt.x; prevEndY = pt.y;
        cx = pt.x; cy = pt.y;
        subpathDrawCount++;
        outputCmds.push(cmd);
      }
    }

    // Close any trailing open subpath that is near-closed
    if (subpathDrawCount > 0) {
      const gap = dist(cx, cy, subpathStartX, subpathStartY);
      if (gap < 0.5) {
        outputCmds.push({ op: "Z", args: [], rel: false });
        closedCount++;
      }
    }

    // Serialise output commands back to a `d` string
    const newD = outputCmds.map(c => {
      if (c.op === "Z") return "Z";
      const letter = c.rel ? c.op.toLowerCase() : c.op;
      return `${letter}${c.args.join(" ")}`;
    }).join(" ");

    if (newD.trim()) {
      el.setAttribute("d", newD);
    } else {
      el.parentNode?.removeChild(el);
    }
  }

  const fixed = new XMLSerializer().serializeToString(doc);
  const report = analyzesvgPaths(fixed);

  return {
    fixed, report,
    closedCount, removedDegenerateCount,
    removedDuplicatePathCount, removedDuplicateNodeCount,
    removedTinySegmentCount,
  };
}
