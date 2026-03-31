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
const MONO_SHAPE_TAGS = [...SHAPE_TAGS, "text", "tspan", "use"];

interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SmartMonochromeOptions {
  darkColor?: string;
  lightColor?: string;
}

let colorParseContext: CanvasRenderingContext2D | null = null;

function getColorParseContext() {
  if (typeof document === "undefined") return null;
  if (colorParseContext) return colorParseContext;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  colorParseContext = canvas.getContext("2d");
  return colorParseContext;
}

function isPaintNone(value: string | null | undefined) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "none" || normalized === "transparent";
}

function isPaintServer(value: string | null | undefined) {
  return !!value && /^url\(/i.test(value.trim());
}

function parseCssColor(value: string | null | undefined): ParsedColor | null {
  if (!value || isPaintNone(value) || isPaintServer(value)) return null;

  const ctx = getColorParseContext();
  if (!ctx) return null;

  try {
    ctx.fillStyle = "#000000";
    ctx.fillStyle = value;
    const normalized = `${ctx.fillStyle}`.trim();

    if (normalized.startsWith("#")) {
      const hex = normalized.slice(1);
      if (hex.length === 3) {
        return {
          r: Number.parseInt(hex[0] + hex[0], 16),
          g: Number.parseInt(hex[1] + hex[1], 16),
          b: Number.parseInt(hex[2] + hex[2], 16),
          a: 1,
        };
      }
      if (hex.length === 6) {
        return {
          r: Number.parseInt(hex.slice(0, 2), 16),
          g: Number.parseInt(hex.slice(2, 4), 16),
          b: Number.parseInt(hex.slice(4, 6), 16),
          a: 1,
        };
      }
    }

    const rgbaMatch = normalized.match(/rgba?\(([^)]+)\)/i);
    if (!rgbaMatch) return null;

    const parts = rgbaMatch[1]
      .split(",")
      .map((part) => Number.parseFloat(part.trim()))
      .filter((part) => Number.isFinite(part));

    if (parts.length < 3) return null;

    return {
      r: parts[0] ?? 0,
      g: parts[1] ?? 0,
      b: parts[2] ?? 0,
      a: parts[3] ?? 1,
    };
  } catch {
    return null;
  }
}

function srgbToLinear(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function computeRelativeLuminance(color: ParsedColor) {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  );
}

function stripPaintDeclarations(styleValue: string | null) {
  if (!styleValue) return null;

  const cleaned = styleValue
    .replace(/\bfill\s*:\s*[^;]+;?/gi, "")
    .replace(/\bfill-opacity\s*:\s*[^;]+;?/gi, "")
    .replace(/\bstroke\s*:\s*[^;]+;?/gi, "")
    .replace(/\bstroke-opacity\s*:\s*[^;]+;?/gi, "")
    .replace(/\bstop-color\s*:\s*[^;]+;?/gi, "")
    .replace(/\bstop-opacity\s*:\s*[^;]+;?/gi, "")
    .replace(/\bcolor\s*:\s*[^;]+;?/gi, "")
    .replace(/;;+/g, ";")
    .trim()
    .replace(/^;/, "")
    .replace(/;$/, "");

  return cleaned.length > 0 ? cleaned : null;
}

function readOpacity(
  style: CSSStyleDeclaration,
  explicitValue: string | null,
  fallbackProperty: "opacity" | "fill-opacity" | "stroke-opacity" | "stop-opacity",
) {
  const parsedExplicit = explicitValue == null ? Number.NaN : Number.parseFloat(explicitValue);
  if (Number.isFinite(parsedExplicit)) {
    return Math.min(1, Math.max(0, parsedExplicit));
  }

  const computed = Number.parseFloat(style.getPropertyValue(fallbackProperty));
  return Number.isFinite(computed) ? Math.min(1, Math.max(0, computed)) : 1;
}

function computeSmartThreshold(samples: number[]) {
  if (samples.length === 0) return 0.55;

  let dark = Math.min(...samples);
  let light = Math.max(...samples);
  if (!Number.isFinite(dark) || !Number.isFinite(light)) return 0.55;

  for (let index = 0; index < 12; index += 1) {
    const darkGroup: number[] = [];
    const lightGroup: number[] = [];

    samples.forEach((sample) => {
      if (Math.abs(sample - dark) <= Math.abs(sample - light)) {
        darkGroup.push(sample);
      } else {
        lightGroup.push(sample);
      }
    });

    const nextDark = darkGroup.length > 0 ? darkGroup.reduce((sum, sample) => sum + sample, 0) / darkGroup.length : dark;
    const nextLight = lightGroup.length > 0 ? lightGroup.reduce((sum, sample) => sum + sample, 0) / lightGroup.length : light;

    if (Math.abs(nextDark - dark) < 0.0005 && Math.abs(nextLight - light) < 0.0005) {
      dark = nextDark;
      light = nextLight;
      break;
    }

    dark = nextDark;
    light = nextLight;
  }

  const spread = Math.abs(light - dark);
  if (spread < 0.1) {
    const sorted = [...samples].sort((left, right) => left - right);
    const percentileIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.72)));
    return Math.min(0.7, Math.max(0.45, sorted[percentileIndex] ?? 0.55));
  }

  return Math.min(0.78, Math.max(0.22, (dark + light) / 2));
}

function mapSolidPaintToMonochrome(
  paintValue: string,
  threshold: number,
  darkColor: string,
  lightColor: string,
) {
  const parsed = parseCssColor(paintValue);
  if (!parsed || parsed.a <= 0.01) return null;
  return computeRelativeLuminance(parsed) <= threshold ? darkColor : lightColor;
}

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

export function makeSvgSmartMonochrome(
  svgContent: string,
  options: SmartMonochromeOptions = {},
): string {
  if (typeof window === "undefined") return svgContent;

  const darkColor = options.darkColor ?? "#000000";
  const lightColor = options.lightColor ?? "#ffffff";

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return svgContent;

  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.left = "-9999px";
  wrapper.style.top = "-9999px";
  wrapper.style.opacity = "0";
  wrapper.style.pointerEvents = "none";
  wrapper.style.width = "0";
  wrapper.style.height = "0";
  wrapper.innerHTML = new XMLSerializer().serializeToString(doc.documentElement);
  document.body.appendChild(wrapper);

  try {
    const liveSvg = wrapper.querySelector("svg");
    if (!liveSvg) return svgContent;

    const livePaintElements = Array.from(liveSvg.querySelectorAll<SVGElement>(MONO_SHAPE_TAGS.join(",")));
    const liveStops = Array.from(liveSvg.querySelectorAll<SVGStopElement>("stop"));
    const samples: number[] = [];

    livePaintElements.forEach((element) => {
      const style = window.getComputedStyle(element);
      const tag = element.tagName.toLowerCase();
      const styleAttr = element.getAttribute("style") ?? "";
      const fillValue = style.getPropertyValue("fill");
      const strokeValue = style.getPropertyValue("stroke");
      const fillOpacity = readOpacity(style, element.getAttribute("fill-opacity"), "fill-opacity");
      const strokeOpacity = readOpacity(style, element.getAttribute("stroke-opacity"), "stroke-opacity");
      const opacity = readOpacity(style, element.getAttribute("opacity"), "opacity");
      const hasExplicitFill =
        /\bfill\s*:/i.test(styleAttr) ||
        element.hasAttribute("fill") ||
        tag === "text" ||
        tag === "tspan";

      const fillAllowed =
        tag !== "line" &&
        !(tag === "polyline" && !hasExplicitFill) &&
        !isPaintNone(fillValue) &&
        !isPaintServer(fillValue) &&
        fillOpacity * opacity > 0.04;

      if (fillAllowed) {
        const parsedFill = parseCssColor(fillValue);
        if (parsedFill) {
          samples.push(computeRelativeLuminance(parsedFill));
        }
      }

      if (!isPaintNone(strokeValue) && !isPaintServer(strokeValue) && strokeOpacity * opacity > 0.04) {
        const parsedStroke = parseCssColor(strokeValue);
        if (parsedStroke) {
          samples.push(computeRelativeLuminance(parsedStroke));
        }
      }
    });

    liveStops.forEach((stop) => {
      const style = window.getComputedStyle(stop);
      const stopColor = style.getPropertyValue("stop-color");
      const stopOpacity = readOpacity(style, stop.getAttribute("stop-opacity"), "stop-opacity");
      if (isPaintNone(stopColor) || stopOpacity <= 0.04) return;

      const parsedStop = parseCssColor(stopColor);
      if (parsedStop) {
        samples.push(computeRelativeLuminance(parsedStop));
      }
    });

    const threshold = computeSmartThreshold(samples);
    const outputElements = Array.from(svgEl.querySelectorAll<SVGElement>(MONO_SHAPE_TAGS.join(",")));

    Array.from(svgEl.querySelectorAll("style")).forEach((styleElement) => {
      styleElement.remove();
    });

    outputElements.forEach((element, index) => {
      const liveElement = livePaintElements[index];
      if (!liveElement) return;

      const style = window.getComputedStyle(liveElement);
      const tag = element.tagName.toLowerCase();
      const fillValue = style.getPropertyValue("fill");
      const strokeValue = style.getPropertyValue("stroke");
      const fillOpacity = readOpacity(style, element.getAttribute("fill-opacity"), "fill-opacity");
      const strokeOpacity = readOpacity(style, element.getAttribute("stroke-opacity"), "stroke-opacity");
      const opacity = readOpacity(style, element.getAttribute("opacity"), "opacity");
      const styleAttr = element.getAttribute("style");
      const hasExplicitFill =
        /\bfill\s*:/i.test(styleAttr ?? "") ||
        element.hasAttribute("fill") ||
        tag === "text" ||
        tag === "tspan";

      const cleanedStyle = stripPaintDeclarations(styleAttr);
      if (cleanedStyle) {
        element.setAttribute("style", cleanedStyle);
      } else {
        element.removeAttribute("style");
      }

      const fillAllowed =
        tag !== "line" &&
        !(tag === "polyline" && !hasExplicitFill) &&
        fillOpacity * opacity > 0.04;

      if (fillAllowed && !isPaintNone(fillValue)) {
        if (isPaintServer(fillValue)) {
          element.setAttribute("fill", fillValue);
        } else {
          element.setAttribute(
            "fill",
            mapSolidPaintToMonochrome(fillValue, threshold, darkColor, lightColor) ?? "none",
          );
        }
        if (fillOpacity < 0.999) {
          element.setAttribute("fill-opacity", fillOpacity.toFixed(3));
        } else {
          element.removeAttribute("fill-opacity");
        }
      } else {
        element.setAttribute("fill", "none");
        element.removeAttribute("fill-opacity");
      }

      if (!isPaintNone(strokeValue) && strokeOpacity * opacity > 0.04) {
        if (isPaintServer(strokeValue)) {
          element.setAttribute("stroke", strokeValue);
        } else {
          element.setAttribute(
            "stroke",
            mapSolidPaintToMonochrome(strokeValue, threshold, darkColor, lightColor) ?? darkColor,
          );
        }
        if (strokeOpacity < 0.999) {
          element.setAttribute("stroke-opacity", strokeOpacity.toFixed(3));
        } else {
          element.removeAttribute("stroke-opacity");
        }
      } else {
        element.setAttribute("stroke", "none");
        element.removeAttribute("stroke-opacity");
      }
    });

    Array.from(svgEl.querySelectorAll("stop")).forEach((stop, index) => {
      const liveStop = liveStops[index];
      if (!liveStop) return;

      const style = window.getComputedStyle(liveStop);
      const stopColor = style.getPropertyValue("stop-color");
      const stopOpacity = readOpacity(style, stop.getAttribute("stop-opacity"), "stop-opacity");
      const mappedColor = mapSolidPaintToMonochrome(stopColor, threshold, darkColor, lightColor);
      const cleanedStyle = stripPaintDeclarations(stop.getAttribute("style"));

      if (mappedColor) {
        stop.setAttribute("stop-color", mappedColor);
      }
      if (stopOpacity < 0.999) {
        stop.setAttribute("stop-opacity", stopOpacity.toFixed(3));
      } else {
        stop.removeAttribute("stop-opacity");
      }
      if (cleanedStyle) {
        stop.setAttribute("style", cleanedStyle);
      } else {
        stop.removeAttribute("style");
      }
    });

    return new XMLSerializer().serializeToString(doc);
  } catch (error) {
    console.error("[svgLaserUtils] smart monochrome failed:", error);
    return svgContent;
  } finally {
    document.body.removeChild(wrapper);
  }
}

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
