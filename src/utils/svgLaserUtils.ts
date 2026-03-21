/**
 * svgLaserUtils.ts
 *
 * Laser-specific SVG utilities powered by SVG.js and Paper.js.
 *
 * ─ analyzeSvgForLaser   : Inspect an SVG for laser readiness (fills, text, paths)
 * ─ makeSvgLaserReady    : Strip fills, ensure stroke-only output
 * ─ estimateLaserTime    : Estimate engraving/cutting time from path length
 * ─ applyBooleanOp       : Union / subtract two SVG path sets (Paper.js)
 */

"use client";

// ─── Laser Analysis ───────────────────────────────────────────────────────────

export interface LaserAnalysis {
  pathCount: number;
  hasFills: boolean;
  hasText: boolean;
  hasStrokes: boolean;
  totalPathLengthMm: number;  // approximate
  warnings: string[];
  isLaserReady: boolean;
}

const SHAPE_TAGS = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];

export function analyzeSvgForLaser(svgContent: string): LaserAnalysis {
  const empty: LaserAnalysis = {
    pathCount: 0, hasFills: false, hasText: false,
    hasStrokes: false, totalPathLengthMm: 0,
    warnings: ["Empty or unparseable SVG"], isLaserReady: false,
  };
  if (typeof window === "undefined") return empty;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) return { ...empty, warnings: ["SVG parse error"] };

  const svgEl = doc.querySelector("svg");
  if (!svgEl) return empty;

  const shapes = SHAPE_TAGS.flatMap(t => Array.from(svgEl.querySelectorAll(t)));
  const pathCount = shapes.length;

  // Check fills — attribute OR inline style
  let hasFills = false;
  for (const el of shapes) {
    const fillAttr  = el.getAttribute("fill");
    const styleAttr = el.getAttribute("style") ?? "";
    const fillMatch = styleAttr.match(/fill\s*:\s*([^;]+)/);
    const fillVal   = fillMatch ? fillMatch[1].trim() : fillAttr ?? "black"; // SVG default fill is black
    if (fillVal && fillVal !== "none" && fillVal !== "transparent" && fillVal !== "") {
      hasFills = true;
      break;
    }
  }

  // Check text
  const hasText = svgEl.querySelectorAll("text, tspan").length > 0;

  // Check strokes
  let hasStrokes = false;
  for (const el of shapes) {
    const strokeAttr = el.getAttribute("stroke");
    const styleAttr  = el.getAttribute("style") ?? "";
    const sm = styleAttr.match(/stroke\s*:\s*([^;]+)/);
    const strokeVal = sm ? sm[1].trim() : strokeAttr;
    if (strokeVal && strokeVal !== "none" && strokeVal !== "") { hasStrokes = true; break; }
  }

  // Estimate total path length in mm (rough: 1 SVG unit ≈ 0.2646mm at 96dpi)
  let totalPathLengthMm = 0;
  const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  tempSvg.style.cssText = "position:absolute;left:-9999px;top:-9999px";
  tempSvg.innerHTML = svgContent.replace(/<\?xml[^?]*\?>/g, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
  document.body.appendChild(tempSvg);
  try {
    tempSvg.querySelectorAll("path, polyline, polygon, line, rect, circle, ellipse").forEach(el => {
      if (el instanceof SVGGeometryElement) {
        totalPathLengthMm += el.getTotalLength() * 0.2646;
      }
    });
  } finally {
    document.body.removeChild(tempSvg);
  }

  const warnings: string[] = [];
  if (hasFills)       warnings.push("Has filled shapes — switch to stroke-only for cutting");
  if (hasText)        warnings.push("Contains text — convert to paths in vector editor first");
  if (!hasStrokes && pathCount > 0) warnings.push("No visible strokes detected");
  if (pathCount === 0) warnings.push("No shape elements found");

  const isLaserReady = !hasFills && !hasText && hasStrokes && pathCount > 0;

  return { pathCount, hasFills, hasText, hasStrokes, totalPathLengthMm, warnings, isLaserReady };
}

// ─── Make Laser Ready ─────────────────────────────────────────────────────────

/**
 * Strip all fills from shapes and ensure every shape has a visible stroke.
 * Returns the modified SVG string.
 */
export function makeSvgLaserReady(svgContent: string, strokeColor = "#000000"): string {
  if (typeof window === "undefined") return svgContent;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return svgContent;

  // Walk ALL elements (handles nested groups, defs, etc.)
  svgEl.querySelectorAll("*").forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (!SHAPE_TAGS.includes(tag)) return;

    // Force fill = none
    el.setAttribute("fill", "none");

    // Clean any fill from inline style
    const style = el.getAttribute("style");
    if (style) {
      const cleaned = style
        .replace(/\bfill\s*:\s*[^;]+;?/g, "fill:none;")
        .replace(/\bfill-opacity\s*:\s*[^;]+;?/g, "");
      el.setAttribute("style", cleaned);
    }

    // Ensure there's a stroke if none exists
    const existingStroke = el.getAttribute("stroke");
    if (!existingStroke || existingStroke === "none") {
      el.setAttribute("stroke", strokeColor);
      if (!el.getAttribute("stroke-width")) {
        el.setAttribute("stroke-width", "0.5");
      }
    }
  });

  return new XMLSerializer().serializeToString(doc);
}

// ─── Time Estimate ────────────────────────────────────────────────────────────

export interface LaserTimeEstimate {
  totalPathMm: number;
  estimatedSeconds: number;
  estimatedMinutes: number;
  passCount: number;
  totalWithPasses: number;
}

export function estimateLaserTime(
  svgContent: string,
  speedMmPerSec: number,
  passes = 1,
): LaserTimeEstimate {
  const analysis = analyzeSvgForLaser(svgContent);
  const totalPathMm = analysis.totalPathLengthMm;
  const totalWithPasses = totalPathMm * passes;
  const effectiveSpeed = Math.max(1, speedMmPerSec);
  const estimatedSeconds = totalWithPasses / effectiveSpeed;
  return {
    totalPathMm,
    estimatedSeconds,
    estimatedMinutes: estimatedSeconds / 60,
    passCount: passes,
    totalWithPasses,
  };
}

// ─── Paper.js Boolean Operations ─────────────────────────────────────────────

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";

/**
 * Perform a boolean operation between two SVG path strings using Paper.js.
 * Both paths are expected to be `<path d="..."/>` strings or full SVG strings.
 * Returns the resulting SVG path `d` attribute string.
 *
 * NOTE: This is a client-side only operation (requires window + canvas).
 */
export async function applyBooleanOp(
  svgA: string,
  svgB: string,
  op: BooleanOp,
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    // Dynamically import paper to avoid SSR issues
    const paper = (await import("paper")).default ?? (await import("paper"));

    // Setup offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = 2000; canvas.height = 2000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (paper as any).setup(canvas);

    const extractPath = (svgString: string): string => {
      const m = svgString.match(/\bd="([^"]*)"/);
      return m ? m[1] : svgString; // return raw d= if found, else treat whole string as d
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const P = paper as any;
    const pathA = new P.Path(extractPath(svgA));
    const pathB = new P.Path(extractPath(svgB));

    pathA.fillColor = "black";
    pathB.fillColor = "black";

    let result;
    switch (op) {
      case "union":     result = pathA.unite(pathB);     break;
      case "subtract":  result = pathA.subtract(pathB);  break;
      case "intersect": result = pathA.intersect(pathB); break;
      case "exclude":   result = pathA.exclude(pathB);   break;
      default:          result = pathA.unite(pathB);
    }

    const d = result?.pathData ?? null;
    pathA.remove(); pathB.remove(); result?.remove();
    P.project.clear();

    return d;
  } catch (err) {
    console.error("[svgLaserUtils] boolean op failed:", err);
    return null;
  }
}
