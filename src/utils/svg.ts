/**
 * SVG parsing and measurement helpers.
 *
 * These utilities extract metadata from uploaded SVGs and compute
 * document-vs-artwork bounds for placement/alignment workflows.
 */

import { SvgAsset, SvgBounds } from "@/types/admin";

const SVG_FALLBACK_SIZE = 100;

function parseDimension(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function sanitizeBounds(bounds: SvgBounds, fallback: SvgBounds): SvgBounds {
  const width = Number.isFinite(bounds.width) && bounds.width > 0 ? bounds.width : fallback.width;
  const height =
    Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height : fallback.height;
  const x = Number.isFinite(bounds.x) ? bounds.x : fallback.x;
  const y = Number.isFinite(bounds.y) ? bounds.y : fallback.y;
  return { x, y, width, height };
}

function parseViewBox(viewBox: string | undefined): SvgBounds | undefined {
  if (!viewBox) return undefined;
  const parts = viewBox
    .trim()
    .split(/[\s,]+/)
    .map((part) => parseFloat(part));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return undefined;
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function parseSvgDocument(content: string): SVGSVGElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "image/svg+xml");
  const parseErrors = doc.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    throw new Error("Invalid SVG markup");
  }

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    throw new Error("Missing <svg> root element");
  }

  return root as unknown as SVGSVGElement;
}

export function getSvgDocumentBounds(svgElement: Element): SvgBounds {
  const fallback: SvgBounds = {
    x: 0,
    y: 0,
    width: SVG_FALLBACK_SIZE,
    height: SVG_FALLBACK_SIZE,
  };

  const viewBoxBounds = parseViewBox(svgElement.getAttribute("viewBox") ?? undefined);
  if (viewBoxBounds) return sanitizeBounds(viewBoxBounds, fallback);

  const width = parseDimension(svgElement.getAttribute("width") ?? undefined);
  const height = parseDimension(svgElement.getAttribute("height") ?? undefined);

  return sanitizeBounds(
    {
      x: 0,
      y: 0,
      width: width ?? SVG_FALLBACK_SIZE,
      height: height ?? SVG_FALLBACK_SIZE,
    },
    fallback
  );
}

export function measureSvgArtworkBounds(
  svgContent: string,
  documentBounds: SvgBounds
): SvgBounds {
  if (typeof document === "undefined") {
    return sanitizeBounds(documentBounds, documentBounds);
  }

  const root = parseSvgDocument(svgContent);
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-100000px";
  host.style.top = "-100000px";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "hidden";
  host.style.opacity = "0";
  host.style.pointerEvents = "none";

  const renderedSvg = document.importNode(root, true) as unknown as SVGSVGElement;
  if (!renderedSvg.getAttribute("viewBox")) {
    renderedSvg.setAttribute(
      "viewBox",
      `${documentBounds.x} ${documentBounds.y} ${documentBounds.width} ${documentBounds.height}`
    );
  }
  if (!renderedSvg.getAttribute("width")) {
    renderedSvg.setAttribute("width", `${documentBounds.width}`);
  }
  if (!renderedSvg.getAttribute("height")) {
    renderedSvg.setAttribute("height", `${documentBounds.height}`);
  }

  host.appendChild(renderedSvg);
  document.body.appendChild(host);

  try {
    const bbox = (renderedSvg as unknown as SVGGraphicsElement).getBBox();
    return sanitizeBounds(
      {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      },
      documentBounds
    );
  } catch {
    return sanitizeBounds(documentBounds, documentBounds);
  } finally {
    host.remove();
  }
}

export function measureSvgBounds(svgContent: string): {
  documentBounds: SvgBounds;
  artworkBounds: SvgBounds;
} {
  const root = parseSvgDocument(svgContent);
  const documentBounds = getSvgDocumentBounds(root);
  const artworkBounds = measureSvgArtworkBounds(svgContent, documentBounds);
  return {
    documentBounds,
    artworkBounds,
  };
}

export function parseSvgAsset(
  id: string,
  name: string,
  content: string
): SvgAsset {
  const root = parseSvgDocument(content);
  const documentBounds = getSvgDocumentBounds(root);
  const artworkBounds = measureSvgArtworkBounds(content, documentBounds);
  const viewBox = root.getAttribute("viewBox") ?? undefined;

  return {
    id,
    name,
    content,
    viewBox,
    naturalWidth: documentBounds.width,
    naturalHeight: documentBounds.height,
    documentBounds,
    artworkBounds,
    uploadedAt: new Date(),
  };
}

export function normalizeSvgToArtworkBounds(
  svgContent: string,
  artworkBounds: SvgBounds
): {
  svgText: string;
  documentBounds: SvgBounds;
  artworkBounds: SvgBounds;
} {
  const root = parseSvgDocument(svgContent);
  const safeArtwork = sanitizeBounds(artworkBounds, {
    x: 0,
    y: 0,
    width: SVG_FALLBACK_SIZE,
    height: SVG_FALLBACK_SIZE,
  });

  root.setAttribute(
    "viewBox",
    `${safeArtwork.x} ${safeArtwork.y} ${safeArtwork.width} ${safeArtwork.height}`
  );
  root.setAttribute("width", `${safeArtwork.width}`);
  root.setAttribute("height", `${safeArtwork.height}`);

  const svgText = new XMLSerializer().serializeToString(root);
  const measured = measureSvgBounds(svgText);

  return {
    svgText,
    documentBounds: measured.documentBounds,
    artworkBounds: measured.artworkBounds,
  };
}

export function svgToDataUrl(svgContent: string): string {
  const encoded = encodeURIComponent(svgContent);
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

export function resolveViewBox(asset: SvgAsset): string {
  if (asset.viewBox) return asset.viewBox;
  const w = asset.naturalWidth ?? SVG_FALLBACK_SIZE;
  const h = asset.naturalHeight ?? SVG_FALLBACK_SIZE;
  return `0 0 ${w} ${h}`;
}

export function defaultPlacedSize(
  asset: SvgAsset,
  maxSizeMm: number = 80
): { width: number; height: number } {
  const w = asset.artworkBounds.width || asset.naturalWidth || SVG_FALLBACK_SIZE;
  const h = asset.artworkBounds.height || asset.naturalHeight || SVG_FALLBACK_SIZE;

  if (h === 0 || w === 0) {
    return { width: maxSizeMm, height: maxSizeMm };
  }

  const ratio = w / h;
  if (w >= h) {
    return { width: maxSizeMm, height: maxSizeMm / ratio };
  }
  return { width: maxSizeMm * ratio, height: maxSizeMm };
}
