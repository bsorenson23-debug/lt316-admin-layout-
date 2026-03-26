/**
 * curvedItemsRenderer.ts — Curved perspective preview for placed SVG items.
 *
 * Rasterizes placed items, then applies cylindrical projection + lighting
 * to make the artwork look like it's physically wrapping around the tumbler.
 *
 * Visual approach:
 *   1. Rasterize all placed items to a flat canvas
 *   2. Apply cylindrical projection (cos compression + sin repositioning)
 *   3. Apply cylindrical lighting gradient (highlight at center, shadow at edges)
 *   4. Fade artwork edges so there's no visible rectangular boundary —
 *      the design melts into the tumbler surface
 *
 * This is purely a visual preview — does NOT affect export coordinates.
 */

import type { PlacedItem } from "@/types/admin";
import { getWrapFrontCenter } from "@/utils/tumblerWrapLayout";

// ── Tuning constants ─────────────────────────────────────────────────────────

/** Vertical strips for smooth distortion (higher = smoother for fine SVG lines) */
const SLICES = 120;

/** Visible arc each side of front center.
 *  120° = 240° total — generous view, artwork fades before it cuts off */
const VISIBLE_ARC_DEG = 120;
const VISIBLE_ARC_RAD = (VISIBLE_ARC_DEG * Math.PI) / 180;

/** Edge fade begins this many degrees before the cutoff */
const FADE_ZONE_DEG = 35;
const FADE_ZONE_RAD = (FADE_ZONE_DEG * Math.PI) / 180;
const FADE_START_RAD = VISIBLE_ARC_RAD - FADE_ZONE_RAD;

/** Minimum brightness for proofing readability */
const MIN_BRIGHTNESS = 0.30;

/** Vertical foreshortening at extreme edges */
const VERTICAL_FORESHORTEN = 0.04;

/** Cylindrical specular highlight intensity (0–1) */
const HIGHLIGHT_INTENSITY = 0.12;
/** Highlight width as fraction of bed width */
const HIGHLIGHT_WIDTH = 0.06;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rasterize placed items to a flat canvas at bed pixel dimensions.
 */
export function rasterizePlacedItems(
  placedItems: PlacedItem[],
  imageCache: Map<string, HTMLImageElement>,
  bedPxW: number,
  bedPxH: number,
  pxPerMm: number,
): HTMLCanvasElement | null {
  if (!placedItems.length || bedPxW <= 0 || bedPxH <= 0) return null;
  if (typeof document === "undefined") return null;

  const c = document.createElement("canvas");
  c.width = Math.round(bedPxW);
  c.height = Math.round(bedPxH);
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  let hasContent = false;

  for (const item of placedItems) {
    if (item.visible === false) continue;
    const img = imageCache.get(item.id);
    if (!img) continue;

    hasContent = true;
    const ix = item.x * pxPerMm;
    const iy = item.y * pxPerMm;
    const iw = item.width * pxPerMm;
    const ih = item.height * pxPerMm;

    if (item.rotation) {
      ctx.save();
      ctx.translate(ix + iw / 2, iy + ih / 2);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    } else {
      ctx.drawImage(img, ix, iy, iw, ih);
    }
  }

  return hasContent ? c : null;
}

/**
 * Apply cylindrical projection with lighting.
 *
 * - Geometric distortion centered on front face (w * 3/4)
 * - Smooth brightness curve with readable floor
 * - Smoothstep edge fade — no hard cutoff
 * - Subtle specular highlight at front face center
 * - Slight vertical foreshortening for depth
 */
export function applyCylindricalProjection(
  flatCanvas: HTMLCanvasElement,
  frontCenterPx?: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const w = flatCanvas.width;
  const h = flatCanvas.height;
  if (w <= 0 || h <= 0) return null;

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const fcx = frontCenterPx ?? (w * 3 / 4);
  const radiusPx = w / (2 * Math.PI);
  const sliceW = w / SLICES;

  for (let i = 0; i < SLICES; i++) {
    const srcCenterX = (i + 0.5) * sliceW;
    const arcDist = srcCenterX - fcx;
    const theta = arcDist / radiusPx;
    const absTheta = Math.abs(theta);

    if (absTheta > VISIBLE_ARC_RAD) continue;

    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    // ── Projected position ──
    const projectedX = fcx + sinTheta * radiusPx;
    const scaleX = cosTheta;

    // ── Brightness: gentle curve with floor ──
    const brightness = MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * cosTheta;

    // ── Specular highlight at front center ──
    const distFromCenter = Math.abs(theta) / (Math.PI / 2);
    const highlightFactor = Math.exp(-distFromCenter * distFromCenter / (2 * HIGHLIGHT_WIDTH * HIGHLIGHT_WIDTH));
    const specular = 1 + HIGHLIGHT_INTENSITY * highlightFactor;

    // ── Smooth edge fade ──
    let edgeAlpha = 1;
    if (absTheta > FADE_START_RAD) {
      const t = (absTheta - FADE_START_RAD) / FADE_ZONE_RAD;
      edgeAlpha = 1 - t * t * (3 - 2 * t);
    }

    // ── Vertical foreshortening ──
    const scaleY = 1 - VERTICAL_FORESHORTEN * (1 - cosTheta);

    const srcX = i * sliceW;
    const destW = sliceW * scaleX;
    const destX = projectedX - destW / 2;
    const destH = h * scaleY;
    const destY = (h - destH) / 2;

    ctx.save();
    ctx.globalAlpha = Math.min(1, brightness * specular) * edgeAlpha;
    ctx.drawImage(
      flatCanvas,
      srcX, 0, sliceW, h,
      destX, destY, destW, destH,
    );
    ctx.restore();
  }

  // ── Cylindrical highlight band — subtle white strip at front center ──
  const hlWidth = w * 0.02;
  const hlGrad = ctx.createLinearGradient(fcx - hlWidth, 0, fcx + hlWidth, 0);
  hlGrad.addColorStop(0, "rgba(255,255,255,0)");
  hlGrad.addColorStop(0.5, `rgba(255,255,255,${HIGHLIGHT_INTENSITY * 0.5})`);
  hlGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = hlGrad;
  ctx.fillRect(fcx - hlWidth, 0, hlWidth * 2, h);
  ctx.restore();

  return c;
}

/**
 * Full pipeline: rasterize placed items → apply cylindrical projection.
 */
export function renderCurvedItems(
  placedItems: PlacedItem[],
  imageCache: Map<string, HTMLImageElement>,
  bedPxW: number,
  bedPxH: number,
  pxPerMm: number,
  handleArcDeg?: number,
): HTMLCanvasElement | null {
  const flat = rasterizePlacedItems(placedItems, imageCache, bedPxW, bedPxH, pxPerMm);
  if (!flat) return null;
  return applyCylindricalProjection(flat, getWrapFrontCenter(bedPxW, handleArcDeg));
}
