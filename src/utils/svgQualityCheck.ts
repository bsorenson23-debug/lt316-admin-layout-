/**
 * svgQualityCheck.ts
 *
 * Analyses an uploaded SVG string for common engraving-quality issues.
 */

export type IssueSeverity = "error" | "warn" | "info";

export interface SvgQualityIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  fix?: string;
}

export interface SvgQualityResult {
  issues: SvgQualityIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

/** Run all quality checks against an SVG string. */
export function checkSvgQuality(svgText: string): SvgQualityResult {
  const issues: SvgQualityIssue[] = [];

  // 1. Embedded raster images
  if (/<image\b/i.test(svgText)) {
    issues.push({
      code: "EMBEDDED_BITMAP",
      severity: "error",
      message: "Contains embedded raster image — lasers need vector paths, not pixels.",
      fix: "Remove or trace the bitmap to paths in Inkscape (Path → Trace Bitmap).",
    });
  }

  // 2. Text elements not converted to paths
  if (/<text\b/i.test(svgText)) {
    issues.push({
      code: "UNCONVERTED_TEXT",
      severity: "error",
      message: "Contains <text> elements — fonts may not render if not installed on the laser PC.",
      fix: "Convert text to paths: Inkscape → Object → Object to Path, or Path → Object to Path.",
    });
  }

  // 3. Font references (embedded font declarations)
  if (/<font\b/i.test(svgText) || /font-face/i.test(svgText)) {
    issues.push({
      code: "EMBEDDED_FONT",
      severity: "warn",
      message: "Contains embedded font — text still needs converting to paths.",
      fix: "Convert all text to paths before uploading.",
    });
  }

  // 4. Very high path complexity (likely a fine-detail raster trace)
  const pathCount = (svgText.match(/<path\b/gi) ?? []).length;
  const isPotraceTrace = /Created by potrace/i.test(svgText);
  if (isPotraceTrace) {
    issues.push({
      code: "POTRACE_TRACE",
      severity: "warn",
      message: "Appears to be a raster-traced SVG (Potrace) — tiny lettering and fine detail may already be degraded before export.",
      fix: "Use the original vector artwork, or retrace from a higher-resolution raster if you need clean small text.",
    });
  }
  if (pathCount > 500) {
    issues.push({
      code: "HIGH_PATH_COUNT",
      severity: "warn",
      message: `Contains ${pathCount} paths — may be an over-traced bitmap or very complex design.`,
      fix: "Simplify paths in Inkscape (Path → Simplify) to reduce engraving time.",
    });
  }

  // 5. Open paths — heuristic: path 'd' attribute that doesn't end with 'z' or 'Z'
  const pathDMatches = svgText.match(/\bd="([^"]+)"/gi) ?? [];
  const openPathCount = pathDMatches.filter((m) => !/[zZ]\s*"$/.test(m)).length;
  if (openPathCount > 0 && openPathCount <= pathCount) {
    issues.push({
      code: "OPEN_PATHS",
      severity: "warn",
      message: `${openPathCount} open path${openPathCount !== 1 ? "s" : ""} detected — may produce stray lines when engraved.`,
      fix: "Close paths in Inkscape: Extensions → Generate from Path → Interpolate.",
    });
  }

  // 6. Stroke-only artwork (no fill) — common cause of faint engravings
  const hasFill = /fill\s*[:=]\s*(?!none|transparent)[a-z#0-9]/i.test(svgText);
  const hasStroke = /stroke\s*[:=]\s*(?!none|transparent)[a-z#0-9]/i.test(svgText);
  if (hasStroke && !hasFill && pathCount > 0) {
    issues.push({
      code: "STROKE_ONLY",
      severity: "info",
      message: "Design uses strokes only (no fill) — verify this is intentional for line engraving.",
      fix: "For filled engrave areas, add a fill colour in Inkscape.",
    });
  }

  // 7. Duplicate overlapping paths — check for identical 'd' attributes
  const dValues = pathDMatches.map((m) => m.replace(/\bd="/, "").replace(/"$/, "").trim());
  const dSet = new Set(dValues);
  if (dSet.size < dValues.length && dValues.length > 1) {
    issues.push({
      code: "DUPLICATE_PATHS",
      severity: "warn",
      message: "Duplicate overlapping paths detected — may cause double-burn.",
      fix: "Use Edit → Select Same → Fill and Stroke in Inkscape, then delete duplicates.",
    });
  }

  return {
    issues,
    hasErrors: issues.some((i) => i.severity === "error"),
    hasWarnings: issues.some((i) => i.severity === "warn"),
  };
}
