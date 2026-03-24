"use client";

/**
 * LaserBedWorkspace — Konva-powered canvas
 *
 * Replaces the SVG-based workspace with a Konva Stage for:
 *   • Mouse-wheel zoom (centred on cursor)
 *   • Middle-button / Space+drag pan
 *   • Konva Transformer selection handles (drag, resize, rotate)
 *   • Hardware-accelerated canvas rendering
 *
 * All state still flows from AdminLayoutShell — the Props interface is unchanged.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Rect, Line, Image as KonvaImage, Group, Text, Transformer, Arrow, Circle } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { BedConfig, PlacedItem, PlacedItemPatch, SvgAsset, WorkspaceMode } from "@/types/admin";
import { calcBedScale, clamp } from "@/utils/geometry";
import {
  getGrooveGuideOverlayMetrics,
  shouldRenderTumblerGuideBand,
  getActiveTumblerGuideBand,
} from "@/utils/tumblerGuides";
import { svgToDataUrl } from "@/utils/svg";
import { hasDarkBackground, removeBlackBackground } from "@/lib/removeBlackBg";
import { generateOverlayCanvas } from "@/lib/overlayGenerator";
import { generateTumblerSchematic } from "@/lib/generateTumblerSchematic";
import styles from "./LaserBedWorkspace.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const BED_VERTICAL_LIFT_PX = 14;
const CENTER_TARGET_OUTER_PX = 5.5;
const CENTER_TARGET_INNER_PX = 1.8;
const ORIGIN_ARROW_PX = 16;
const ORIGIN_GUIDE_INSET_PX = 8;
const BOTTOM_LABEL_OFFSET_PX = 16;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function formatMm(value: number): string {
  return Number.isInteger(value)
    ? `${value}`
    : value.toFixed(2).replace(/\.?0+$/, "");
}

// ─── Material palette ─────────────────────────────────────────────────────────

function getMaterialPalette(material: string): { fill: string; stroke: string; sheen: string } {
  const m: Record<string, { fill: string; stroke: string; sheen: string }> = {
    "stainless-steel":   { fill: "#7a8a90", stroke: "#9ab0b8", sheen: "#c8d8e0" },
    "powder-coat":       { fill: "#3a5a6a", stroke: "#5a8a9a", sheen: "#7aaaba" },
    "anodized-aluminum": { fill: "#5a6a78", stroke: "#7a9aaa", sheen: "#aac0cc" },
    "brass":             { fill: "#8a7040", stroke: "#b89850", sheen: "#d4b870" },
    "ceramic":           { fill: "#c8c0b0", stroke: "#e0d8c8", sheen: "#f0eae0" },
    "slate":             { fill: "#2e3238", stroke: "#4a5058", sheen: "#6a7278" },
    "wood-hard":         { fill: "#8a6040", stroke: "#a88060", sheen: "#c0a080" },
    "mdf":               { fill: "#a09070", stroke: "#c0b090", sheen: "#d0c0a0" },
    "acrylic-cast":      { fill: "#1a3a5a", stroke: "#2a5a8a", sheen: "#4a8ab0" },
    "leather-natural":   { fill: "#7a5030", stroke: "#9a7050", sheen: "#b09070" },
    "leather-synthetic": { fill: "#3a3030", stroke: "#5a5050", sheen: "#706868" },
    "plastic-abs":       { fill: "#2a2a30", stroke: "#4a4a58", sheen: "#606070" },
    "glass":             { fill: "#304858", stroke: "#5080a0", sheen: "#80b0c8" },
    "rubber":            { fill: "#1a1a1a", stroke: "#383838", sheen: "#505050" },
    "paper":             { fill: "#d8d0c0", stroke: "#e8e0d0", sheen: "#f0ece4" },
    "fabric":            { fill: "#4a5848", stroke: "#6a7868", sheen: "#8a9888" },
  };
  return m[material] ?? { fill: "#3a4a52", stroke: "#5a7080", sheen: "#8aacba" };
}

// ─── SVG path helpers (reused by string builder) ─────────────────────────────

function rrPath(x: number, y: number, w: number, h: number, rx: number): string {
  const r = Math.min(rx, w / 2, h / 2);
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
}

function openerSlotPath(cx: number, slotTop: number, sw: number, sh: number): string {
  const arcRy = sh * 0.55;
  const straightStart = slotTop + arcRy;
  return [
    `M ${cx - sw} ${slotTop + sh}`,
    `L ${cx - sw} ${straightStart}`,
    `A ${sw} ${arcRy} 0 0 1 ${cx + sw} ${straightStart}`,
    `L ${cx + sw} ${slotTop + sh}`,
    "Z",
  ].join(" ");
}

// ─── Exported types (same interface as before) ────────────────────────────────

export interface FramePreviewProp {
  originXmm: number;
  originYmm: number;
  widthMm: number;
  heightMm: number;
}

export interface BedMockupConfig {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  printTopPct: number;
  printBottomPct: number;
  opacity: number;
}

export interface FlatBedItemOverlay {
  itemId?: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  label: string;
  category: string;
  material?: string;
  imageSrc?: string;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
}

interface Props {
  bedConfig: BedConfig;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  placementAsset: SvgAsset | null;
  isPlacementArmed: boolean;
  framePreview?: FramePreviewProp | null;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  tumblerViewMode?: "grid" | "3d-placement";
  onTumblerViewModeChange?: (mode: "grid" | "3d-placement") => void;
  showTwoSidedCrosshairs?: boolean;
  mockupConfig?: BedMockupConfig | null;
  flatBedItemOverlay?: FlatBedItemOverlay | null;
  handleArcDeg?: number;
  /** Product name for the status bar (e.g. "YETI Rambler 40oz") */
  productName?: string;
  /** Product template photo data URL — shown as semi-transparent background on the bed */
  templateOverlayUrl?: string | null;
  /** Back face photo data URL — shown at the seam edges of the bed */
  backOverlayUrl?: string | null;
  /** Overlay display mode: geometric schematic, full photo, or off */
  overlayMode?: "schematic" | "photo" | "off";
  /** Overlay opacity as a percentage 0–100 (applied as 0–1) */
  overlayOpacityPct?: number;
  /** Overlay blending: "normal" or "multiply" (multiply blends into bed) */
  overlayBlend?: "normal" | "multiply";
  /** Show split front/back overlay with zone labels */
  twoSidedMode?: boolean;
  /** Callback for screenshot export — receives the Konva stage ref */
  onScreenshotRequest?: () => void;
  /** Expose stage ref for external screenshot capture */
  stageRefCallback?: (stage: Konva.Stage | null) => void;
  onPlaceAsset: (xMm: number, yMm: number) => void;
  onSelectItem: (id: string | null) => void;
  onUpdateItem: (id: string, patch: PlacedItemPatch) => void;
  onNudgeSelected: (dxMm: number, dyMm: number) => void;
  onDeleteItem?: (id: string) => void;
  onClearWorkspace: () => void;
}

// ─── FlatBedItem SVG string builder ──────────────────────────────────────────
// Generates the full item overlay as an SVG string → load as KonvaImage.
// This reuses all the existing mask/gradient/filter logic.

function buildFlatBedItemSvg(
  overlay: FlatBedItemOverlay,
  bedPxW: number,
  bedPxH: number,
  pxPerMm: number,
): string {
  const { widthMm, heightMm, thicknessMm, label, category, material, itemId } = overlay;
  const zw = widthMm * pxPerMm;
  const zh = heightMm * pxPerMm;
  const zx = (bedPxW - zw) / 2;
  const zy = (bedPxH - zh) / 2;
  const cx = zx + zw / 2;
  const p = getMaterialPalette(material ?? "");

  const isDogTag = category === "patch-tag" && !!itemId?.includes("dog");
  const isRound  = category === "coaster-tile" &&
    (itemId?.includes("round") || (itemId?.includes("coaster") && !itemId?.includes("square")));
  const isOval   = category === "drinkware";

  const bodyRx = isRound ? Math.min(zw, zh) / 2
               : isOval  ? zw * 0.45
               : category === "patch-tag"   ? Math.min(zw, zh) * 0.25
               : category === "sign-plaque" ? 3 : 2;

  // Keychain hole
  const holeR  = Math.max(1.5, zw * 0.07);
  const holeCy = zy + holeR + Math.max(1.5, zh * 0.04);
  const holeCx = zx + zw / 2;

  // Bottle opener slot
  const slotHW  = zw * 0.26;
  const slotH   = zh * 0.155;
  const slotTop = zy + zh * 0.625;

  const bodyPath = rrPath(zx, zy, zw, zh, bodyRx);

  const holePath = isDogTag ? [
    `M ${holeCx + holeR} ${holeCy}`,
    `A ${holeR} ${holeR} 0 1 0 ${holeCx - holeR} ${holeCy}`,
    `A ${holeR} ${holeR} 0 1 0 ${holeCx + holeR} ${holeCy}`,
    "Z",
  ].join(" ") : "";
  const slotPath = isDogTag ? openerSlotPath(zx + zw / 2, slotTop, slotHW, slotH) : "";
  const maskCutouts = [holePath, slotPath].filter(Boolean).join(" ");

  // Engraving zone corner brackets
  const tick = Math.max(4, Math.min(10, zw * 0.08));
  const corners: [number, number, number, number][] = [
    [zx,      zy,       1, 1],
    [zx + zw, zy,      -1, 1],
    [zx,      zy + zh,  1,-1],
    [zx + zw, zy + zh, -1,-1],
  ];
  const bracketsSvg = corners.map(([bx, by, sx, sy]) =>
    `<line x1="${bx}" y1="${by}" x2="${bx + sx * tick}" y2="${by}" stroke="${p.sheen}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<line x1="${bx}" y1="${by}" x2="${bx}" y2="${by + sy * tick}" stroke="${p.sheen}" stroke-width="1.5" stroke-linecap="round"/>`
  ).join("");

  const labelSize = Math.max(8, Math.min(13, zw * 0.18));
  const dimSize   = Math.max(7, Math.min(10, zw * 0.13));
  const shortLabel = label.length > 30 ? label.slice(0, 29) + "\u2026" : label;
  const dimText = `${widthMm}\u00d7${heightMm} mm${thicknessMm ? ` \u00b7 ${thicknessMm}mm` : ""}`;

  const svgH = bedPxH + labelSize * 1.4 + dimSize * 1.5 + 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bedPxW}" height="${svgH}">
  <defs>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${Math.max(1.5, zw * 0.04)}" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <linearGradient id="gr" x1="0" y1="0" x2="0.35" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="${p.sheen}" stop-opacity="0.95"/>
      <stop offset="38%"  stop-color="${p.fill}"  stop-opacity="1"/>
      <stop offset="100%" stop-color="${p.fill}"  stop-opacity="0.82"/>
    </linearGradient>
    <mask id="mk">
      <path d="${bodyPath}" fill="white"/>
      ${maskCutouts ? `<path d="${maskCutouts}" fill="black"/>` : ""}
    </mask>
  </defs>
  <path d="${bodyPath}" fill="#000" opacity="0.5" transform="translate(2,3)" filter="url(#sh)"/>
  <rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="url(#gr)" mask="url(#mk)"/>
  <path d="${bodyPath}" fill="none" stroke="${p.stroke}" stroke-width="1" mask="url(#mk)"/>
  ${isDogTag ? `<circle cx="${holeCx}" cy="${holeCy}" r="${holeR}" fill="none" stroke="${p.sheen}" stroke-width="0.7" opacity="0.6"/>` : ""}
  ${isDogTag ? `<path d="${openerSlotPath(zx + zw / 2, slotTop, slotHW, slotH)}" fill="none" stroke="${p.sheen}" stroke-width="0.7" opacity="0.55"/>` : ""}
  <rect x="${zx + 3}" y="${zy + 2}" width="${zw * 0.5}" height="${Math.max(1, zh * 0.025)}" rx="0.5" fill="${p.sheen}" opacity="0.5" mask="url(#mk)"/>
  ${material?.startsWith("leather") ? `<rect x="${zx + 4}" y="${zy + 4}" width="${zw - 8}" height="${zh - 8}" rx="${Math.max(1, bodyRx - 2)}" fill="none" stroke="${p.sheen}" stroke-width="0.7" stroke-dasharray="2 2" opacity="0.45" mask="url(#mk)"/>` : ""}
  <rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="none" stroke="${p.sheen}55" stroke-width="0.8" stroke-dasharray="3 2" rx="1"/>
  ${bracketsSvg}
  <text x="${cx}" y="${zy + zh + labelSize * 1.4}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${labelSize}" font-weight="600" fill="${p.sheen}ee">${shortLabel}</text>
  <text x="${cx}" y="${zy + zh + labelSize * 1.4 + dimSize * 1.5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${dimSize}" fill="${p.sheen}88">${dimText}</text>
</svg>`;
}

// ─── useLoadImage hook ────────────────────────────────────────────────────────

function useLoadImage(src: string | null | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    let cancelled = false;
    const el = new window.Image();
    el.onload = () => { if (!cancelled) setImg(el); };
    el.onerror = () => { if (!cancelled) setImg(null); };
    el.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return img;
}

/** Load an image and auto-strip dark backgrounds (instant threshold-based). */
function useLoadOverlayImage(src: string | null | undefined): HTMLImageElement | null {
  const raw = useLoadImage(src);
  const [processed, setProcessed] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!raw) { setProcessed(null); return; }
    // Check if the image has a dark background
    if (hasDarkBackground(raw)) {
      const cleanUrl = removeBlackBackground(raw);
      if (cleanUrl) {
        let cancelled = false;
        const el = new window.Image();
        el.onload = () => { if (!cancelled) setProcessed(el); };
        el.onerror = () => { if (!cancelled) setProcessed(raw); }; // fallback to original
        el.src = cleanUrl;
        return () => { cancelled = true; };
      }
    }
    // No dark background or removal failed — use as-is
    setProcessed(raw);
  }, [raw]);

  return processed;
}


// ─── Main component ───────────────────────────────────────────────────────────

export function LaserBedWorkspace({
  bedConfig,
  placedItems,
  selectedItemId,
  placementAsset,
  isPlacementArmed,
  framePreview,
  onWorkspaceModeChange,
  tumblerViewMode = "grid",
  onTumblerViewModeChange,
  showTwoSidedCrosshairs = false,
  mockupConfig,
  flatBedItemOverlay,
  handleArcDeg = 0,
  productName,
  templateOverlayUrl,
  backOverlayUrl,
  overlayMode = "off",
  overlayOpacityPct = 12,
  overlayBlend = "normal",
  twoSidedMode = false,
  stageRefCallback,
  onPlaceAsset,
  onSelectItem,
  onUpdateItem,
  onNudgeSelected,
  onDeleteItem,
  onClearWorkspace,
}: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const stageRef       = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // Expose stage ref for external screenshot capture
  useEffect(() => {
    stageRefCallback?.(stageRef.current);
    return () => stageRefCallback?.(null);
  }, [stageRefCallback]);

  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [basePxPerMm, setBasePxPerMm]     = useState(1);
  const [zoom, setZoom]                   = useState(1);
  const [pan, setPan]                     = useState({ x: 0, y: 0 });
  const [clearConfirm, setClearConfirm]   = useState(false);

  // Image caches
  const [imageCache, setImageCache] = useState<Map<string, HTMLImageElement>>(new Map());
  const mockupImg = useLoadImage(mockupConfig?.src ?? null);

  // Template product overlay — auto-strips dark backgrounds (photo mode only)
  const templatePhotoImg = useLoadOverlayImage(overlayMode === "photo" ? (templateOverlayUrl ?? null) : null);
  const backPhotoImg = useLoadOverlayImage(overlayMode === "photo" ? (backOverlayUrl ?? null) : null);

  // Generate overlay canvas — schematic (dimension-based) or photo
  const overlayCanvas = useMemo(() => {
    if (overlayMode === "off") return null;
    const diameterMm = bedConfig.tumblerDiameterMm ?? (bedConfig.width / Math.PI);

    if (overlayMode === "schematic") {
      return generateTumblerSchematic({
        wrapWidthMm: bedConfig.width,
        printHeightMm: bedConfig.height,
        diameterMm,
        handleArcDeg,
        twoSided: twoSidedMode,
      }, basePxPerMm);
    }

    // Photo mode — needs loaded images
    if (!templatePhotoImg) return null;
    return generateOverlayCanvas({
      bedPxW: bedConfig.width * basePxPerMm,
      bedPxH: bedConfig.height * basePxPerMm,
      pxPerMm: basePxPerMm,
      diameterMm,
      frontImg: templatePhotoImg,
      backImg: backPhotoImg,
      handleArcDeg,
      twoSided: twoSidedMode,
    });
  }, [overlayMode, templatePhotoImg, backPhotoImg, bedConfig.width, bedConfig.height, bedConfig.tumblerDiameterMm, basePxPerMm, handleArcDeg, twoSidedMode]);

  // Pan state refs
  const isPanningRef    = useRef(false);
  const lastPanRef      = useRef({ x: 0, y: 0 });
  const spaceDownRef    = useRef(false);

  // ── Derived bed pixel dimensions ──────────────────────────────────────────
  const bedPxW = bedConfig.width  * basePxPerMm;
  const bedPxH = bedConfig.height * basePxPerMm;
  const bedOffsetX = (containerSize.w - bedPxW) / 2;
  const bedOffsetY = Math.max(8, (containerSize.h - bedPxH) / 2) - BED_VERTICAL_LIFT_PX;

  // ── FlatBedItem SVG → image ───────────────────────────────────────────────
  const flatBedSvgSrc = useMemo(() => {
    if (!flatBedItemOverlay || bedPxW <= 0 || bedPxH <= 0) return null;
    return svgToDataUrl(buildFlatBedItemSvg(flatBedItemOverlay, bedPxW, bedPxH, basePxPerMm));
  }, [flatBedItemOverlay, bedPxW, bedPxH, basePxPerMm]);
  const flatBedImg = useLoadImage(flatBedSvgSrc);

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const recalc = () => {
      const { offsetWidth, offsetHeight } = el;
      setContainerSize({ w: offsetWidth, h: offsetHeight });
      setBasePxPerMm(calcBedScale(bedConfig.width, bedConfig.height, offsetWidth, offsetHeight, 40));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bedConfig.width, bedConfig.height]);

  // ── Reset view when bed changes ───────────────────────────────────────────
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [bedConfig.width, bedConfig.height]);

  // ── Load placed item images ───────────────────────────────────────────────
  useEffect(() => {
    const ids = new Set(placedItems.map(i => i.id));
    placedItems.forEach(item => {
      if (imageCache.has(item.id)) return;
      const img = new window.Image();
      img.onload = () => setImageCache(prev => new Map(prev).set(item.id, img));
      img.src = svgToDataUrl(item.svgText);
    });
    // Prune removed items
    setImageCache(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const k of next.keys()) { if (!ids.has(k)) { next.delete(k); changed = true; } }
      return changed ? next : prev;
    });
  }, [placedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync Transformer to selection ────────────────────────────────────────
  useEffect(() => {
    const tr    = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (!selectedItemId) { tr.nodes([]); tr.getLayer()?.batchDraw(); return; }
    const node = stage.findOne(`#ki_${selectedItemId}`);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedItemId, placedItems, zoom, pan]);

  // ── Keyboard: Delete ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedItemId || !onDeleteItem) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDeleteItem(selectedItemId); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedItemId, onDeleteItem]);

  // ── Keyboard: Space for pan mode ──────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !["INPUT","TEXTAREA","SELECT"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); spaceDownRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") spaceDownRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ── Zoom via mouse wheel ──────────────────────────────────────────────────
  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer  = stage.getPointerPosition()!;
    const scaleBy  = 1.1;
    const rawScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawScale));
    const pointTo  = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    setZoom(newScale);
    setPan({ x: pointer.x - pointTo.x * newScale, y: pointer.y - pointTo.y * newScale });
  }, []);

  // ── Pan via middle button or Space+drag ───────────────────────────────────
  const handleStageMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 || spaceDownRef.current) {
      isPanningRef.current  = true;
      lastPanRef.current    = { x: e.evt.clientX, y: e.evt.clientY };
      e.evt.preventDefault();
    }
  }, []);

  const handleStageMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (!isPanningRef.current) return;
    const dx = e.evt.clientX - lastPanRef.current.x;
    const dy = e.evt.clientY - lastPanRef.current.y;
    lastPanRef.current = { x: e.evt.clientX, y: e.evt.clientY };
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleStageMouseUp = useCallback(() => { isPanningRef.current = false; }, []);

  // ── Convert stage pointer → bed mm coords ────────────────────────────────
  const pointerToBedMm = useCallback((pointer: { x: number; y: number }) => {
    const stageX = (pointer.x - pan.x) / zoom;
    const stageY = (pointer.y - pan.y) / zoom;
    return {
      x: (stageX - bedOffsetX) / basePxPerMm,
      y: (stageY - bedOffsetY) / basePxPerMm,
    };
  }, [pan, zoom, bedOffsetX, bedOffsetY, basePxPerMm]);

  // ── Click on bed ──────────────────────────────────────────────────────────
  const handleBedClick = useCallback((_e: KonvaEventObject<MouseEvent>) => {
    if (isPanningRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition()!;
    if (!isPlacementArmed || !placementAsset) { onSelectItem(null); return; }
    let { x: xMm, y: yMm } = pointerToBedMm(pointer);
    if (showTwoSidedCrosshairs) {
      // Snap to FRONT (center) if click is within 20% of bed width
      const frontX = bedConfig.width / 2;
      const centerY = bedConfig.height / 2;
      const snapR = bedConfig.width * 0.20;
      if (Math.hypot(xMm - frontX, yMm - centerY) <= snapR) {
        xMm = frontX;
        yMm = centerY;
      }
    }
    onPlaceAsset(xMm, yMm);
  }, [isPlacementArmed, placementAsset, pointerToBedMm, onPlaceAsset, onSelectItem, showTwoSidedCrosshairs, bedConfig]);

  // ── Grid lines ────────────────────────────────────────────────────────────
  const gridLines = useMemo(() => {
    const els: React.ReactNode[] = [];
    const gs = bedConfig.gridSpacing;
    for (let x = 0; x <= bedConfig.width; x += gs) {
      const px = x * basePxPerMm;
      els.push(<Line key={`vg${x}`} points={[px, 0, px, bedPxH]} stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} listening={false} />);
    }
    for (let y = 0; y <= bedConfig.height; y += gs) {
      const py = y * basePxPerMm;
      els.push(<Line key={`hg${y}`} points={[0, py, bedPxW, py]} stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} listening={false} />);
    }
    return els;
  }, [bedConfig.gridSpacing, bedConfig.width, bedConfig.height, basePxPerMm, bedPxW, bedPxH]);

  // ── Coordinate labels ─────────────────────────────────────────────────────
  const coordLabels = useMemo(() => {
    const els: React.ReactNode[] = [];
    const step = bedConfig.gridSpacing;
    const w = bedConfig.width;
    const h = bedConfig.height;
    const isTumbler = showTwoSidedCrosshairs;
    // Tumbler mode: absolute 0→width / 0→height (top=0 = top rim)
    // Flat-bed mode: centered -w/2→w/2 / -h/2→h/2
    if (isTumbler) {
      for (let x = 0; x <= w; x += step) {
        els.push(
          <Text key={`xl${x}`}
            x={(x * basePxPerMm) - 10} y={bedPxH + BOTTOM_LABEL_OFFSET_PX}
            text={formatMm(x)} fontSize={9} fontFamily="monospace" fill="#505050"
            width={20} align="center" listening={false} />
        );
      }
      for (let y = 0; y <= h; y += step) {
        els.push(
          <Text key={`yl${y}`}
            x={-30} y={y * basePxPerMm - 4}
            text={formatMm(y)} fontSize={9} fontFamily="monospace" fill="#505050"
            width={28} align="right" listening={false} />
        );
      }
    } else {
      for (let x = -w / 2; x <= w / 2; x += step) {
        els.push(
          <Text key={`xl${x}`}
            x={((x + w / 2) * basePxPerMm) - 10} y={bedPxH + BOTTOM_LABEL_OFFSET_PX}
            text={formatMm(x)} fontSize={9} fontFamily="monospace" fill="#505050"
            width={20} align="center" listening={false} />
        );
      }
      for (let y = -h / 2; y <= h / 2; y += step) {
        els.push(
          <Text key={`yl${y}`}
            x={-30} y={(y + h / 2) * basePxPerMm - 4}
            text={formatMm(y)} fontSize={9} fontFamily="monospace" fill="#505050"
            width={28} align="right" listening={false} />
        );
      }
    }
    return els;
  }, [bedConfig.gridSpacing, bedConfig.width, bedConfig.height, basePxPerMm, bedPxW, bedPxH, showTwoSidedCrosshairs]);

  // ── Tumbler guides ────────────────────────────────────────────────────────
  const showGuideBands = shouldRenderTumblerGuideBand(bedConfig);
  const activeGuideBand = getActiveTumblerGuideBand(bedConfig);

  const tumblerGuideNodes = useMemo(() => {
    if (!showGuideBands || !activeGuideBand) return null;
    const { widthPx, upperYpx, lowerYpx, bandHeightPx } = getGrooveGuideOverlayMetrics({
      bedWidthMm: bedConfig.width, scale: basePxPerMm, band: activeGuideBand,
    });
    const showLabels = bandHeightPx >= 22 && widthPx >= 140;
    return (
      <Group listening={false}>
        <Rect x={0} y={upperYpx} width={widthPx} height={bandHeightPx} fill="#4e6f82" opacity={0.08} />
        <Line points={[0, upperYpx, widthPx, upperYpx]} stroke="#4e6f82" strokeWidth={1.2} dash={[2,5]} opacity={0.9} />
        <Line points={[0, lowerYpx, widthPx, lowerYpx]} stroke="#4e6f82" strokeWidth={1.2} dash={[2,5]} opacity={0.9} />
        {showLabels && <>
          <Text x={6} y={upperYpx - 14} text="Upper groove" fontSize={9} fontFamily="monospace" fill="#315264" />
          <Text x={6} y={lowerYpx - 14} text="Lower groove" fontSize={9} fontFamily="monospace" fill="#315264" />
        </>}
      </Group>
    );
  }, [showGuideBands, activeGuideBand, bedConfig.width, basePxPerMm]);

  // ── Crosshair lines ───────────────────────────────────────────────────────
  const crosshairNodes = useMemo(() => {
    const cxMode = bedConfig.crosshairMode;
    const showCenter = cxMode === "center" || cxMode === "both";
    const showOrigin = cxMode === "origin" || cxMode === "both";
    const cx = bedPxW / 2;
    const cy = bedPxH / 2;
    const oy = bedConfig.originPosition === "bottom-left" ? bedPxH : 0;
    const guideY = oy + (oy === 0 ? ORIGIN_GUIDE_INSET_PX : -ORIGIN_GUIDE_INSET_PX);
    return (
      <Group listening={false}>
        {showCenter && <>
          <Line points={[cx, 0, cx, bedPxH]} stroke="#0e6984" strokeWidth={1.9} dash={[10,6]} opacity={0.92} />
          <Line points={[0, cy, bedPxW, cy]}  stroke="#0e6984" strokeWidth={1.9} dash={[10,6]} opacity={0.92} />
          <Circle x={cx} y={cy} radius={CENTER_TARGET_OUTER_PX} fill="#1c1c1c" stroke="#0a5a72" strokeWidth={1} />
          <Circle x={cx} y={cy} radius={CENTER_TARGET_INNER_PX} fill="#0e6984" />
        </>}
        {showOrigin && <>
          <Line points={[ORIGIN_GUIDE_INSET_PX, guideY, bedPxW, guideY]} stroke="#0e6984" strokeWidth={1} dash={[6,4]} opacity={0.4} />
          <Line points={[ORIGIN_GUIDE_INSET_PX, guideY, ORIGIN_GUIDE_INSET_PX, oy === 0 ? bedPxH : 0]} stroke="#0e6984" strokeWidth={1} dash={[6,4]} opacity={0.4} />
        </>}
        {/* Origin X/Y arrows */}
        <Arrow points={[ORIGIN_ARROW_PX + 4, oy === 0 ? 4 : bedPxH - 4,
                        ORIGIN_ARROW_PX + 4 + ORIGIN_ARROW_PX, oy === 0 ? 4 : bedPxH - 4]}
          stroke="#e05050" fill="#e05050" strokeWidth={1.5} pointerLength={5} pointerWidth={4} />
        <Arrow points={[oy === 0 ? 4 : 4, oy === 0 ? ORIGIN_ARROW_PX + 4 : bedPxH - ORIGIN_ARROW_PX - 4,
                        oy === 0 ? 4 : 4, oy === 0 ? 4 : bedPxH - 4]}
          stroke="#50c050" fill="#50c050" strokeWidth={1.5} pointerLength={5} pointerWidth={4} />
        <Text x={oy === 0 ? ORIGIN_ARROW_PX + 10 : ORIGIN_ARROW_PX + 10} y={oy === 0 ? 0 : bedPxH - 12}
          text={`(0, 0)`} fontSize={9} fontFamily="monospace" fill="#888" />
      </Group>
    );
  }, [bedConfig.crosshairMode, bedConfig.originPosition, bedPxW, bedPxH]);

  // ── Tumbler wrap guides ──────────────────────────────────────────────────
  // Clean reference lines: FRONT center (blue), handle center (orange),
  // seam labels, height indicators. No filled zones or hatching.
  const twoSidedCrosshairNodes = useMemo(() => {
    if (!showTwoSidedCrosshairs) return null;
    const wrapW = bedConfig.width;
    const frontXPx = (wrapW / 2) * basePxPerMm;

    return (
      <Group listening={false}>
        {/* ── FRONT line — dominant blue landmark ── */}
        <Line
          points={[frontXPx, 0, frontXPx, bedPxH]}
          stroke="rgba(40,120,200,0.7)"
          strokeWidth={2}
          dash={[8, 4]}
        />
        <Text
          x={frontXPx - 55}
          y={4}
          text={"\u2193 Front face center"}
          fontSize={10}
          fontFamily="system-ui, sans-serif"
          fill="rgba(40,120,200,0.6)"
          width={110}
          align="center"
        />
        <Text
          x={frontXPx - 22}
          y={bedPxH - 18}
          text="FRONT"
          fontSize={13}
          fontFamily="system-ui, sans-serif"
          fontStyle="bold"
          fill="rgba(40,120,200,0.85)"
          width={44}
          align="center"
        />

        {/* ── BACK / seam — subtle at left edge ── */}
        <Line
          points={[0, 0, 0, bedPxH]}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
          dash={[4, 8]}
        />
        <Text x={4} y={4} text="BACK" fontSize={9}
          fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.3)" />
        <Text x={4} y={bedPxH - 14} text="seam" fontSize={8}
          fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.2)" />

        {/* ── Handle center line — orange dashed at both wrap edges ── */}
        {handleArcDeg > 0 && (
          <>
            {/* Right edge = handle center (opposite front face) */}
            <Line
              points={[bedPxW, 0, bedPxW, bedPxH]}
              stroke="rgba(255,150,50,0.4)"
              strokeWidth={1.5}
              dash={[6, 4]}
            />
            <Text
              x={bedPxW - 90}
              y={4}
              text={"handle center \u2193"}
              fontSize={9}
              fontFamily="system-ui, sans-serif"
              fill="rgba(255,150,50,0.5)"
              width={86}
              align="right"
            />
            {/* Left edge also = handle center (wrap point) */}
            <Line
              points={[0, 0, 0, bedPxH]}
              stroke="rgba(255,150,50,0.4)"
              strokeWidth={1.5}
              dash={[6, 4]}
            />
          </>
        )}

        {/* ── Tumbler height indicators along left edge ── */}
        <Line points={[-6, 0, 12, 0]} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
        <Text x={-70} y={-2} text={"\u2190 Top rim"} fontSize={9}
          fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.35)" width={64} align="right" />
        <Line points={[-6, bedPxH, 12, bedPxH]} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
        <Text x={-70} y={bedPxH - 12} text={"\u2190 Bottom"} fontSize={9}
          fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.35)" width={64} align="right" />
      </Group>
    );
  }, [showTwoSidedCrosshairs, bedConfig.width, bedPxW, bedPxH, basePxPerMm, handleArcDeg]);

  // ── BedMockup position calc ───────────────────────────────────────────────
  const mockupImageProps = useMemo(() => {
    if (!mockupConfig || !mockupImg) return null;
    const zoneH = mockupConfig.printBottomPct - mockupConfig.printTopPct;
    if (zoneH <= 0) return null;
    const scaledH = bedPxH / zoneH;
    const aspect  = mockupConfig.naturalWidth / mockupConfig.naturalHeight;
    const scaledW = scaledH * aspect;
    return {
      x: bedPxW / 2 - scaledW / 2,
      y: -mockupConfig.printTopPct * scaledH,
      width:  scaledW,
      height: scaledH,
      opacity: mockupConfig.opacity,
    };
  }, [mockupConfig, mockupImg, bedPxW, bedPxH]);

  const selectedItem = placedItems.find(i => i.id === selectedItemId) ?? null;

  // ── Empty bed placeholder text ────────────────────────────────────────────
  const showPlaceholder = placedItems.length === 0 && !flatBedItemOverlay && !mockupConfig;

  // ── Zoom reset ────────────────────────────────────────────────────────────
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={styles.wrapper}
      ref={containerRef}
      style={{ cursor: isPlacementArmed ? "crosshair" : "default" }}
    >
      {/* ── Status bar — 3 zones: product name | mode toggle | clear ── */}
      <div className={styles.toolbar}>
        {/* LEFT: Product name */}
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarBrand}>LT316</span>
          {productName ? (
            <span className={styles.toolbarProduct}>{" \u2014 "}{productName}</span>
          ) : (
            <span className={styles.toolbarProductEmpty}>{" \u2014 Select a product"}</span>
          )}
          {zoom !== 1 && (
            <span className={styles.toolbarZoom}>
              {Math.round(zoom * 100)}%
              <button onClick={resetView} className={styles.toolbarZoomReset}>reset</button>
            </span>
          )}
          {isPlacementArmed && placementAsset && (
            <span className={styles.toolbarPlacing}>
              Click to place &quot;{placementAsset.name.replace(/\.svg$/i, "")}&quot;
            </span>
          )}
        </div>

        {/* CENTER: Mode toggles */}
        <div className={styles.toolbarCenter}>
          {onWorkspaceModeChange && (
            <>
              <button
                className={`${styles.modeBtn} ${bedConfig.workspaceMode === "flat-bed" ? styles.modeBtnActive : ""}`}
                onClick={() => onWorkspaceModeChange("flat-bed")}
              >Flat Bed</button>
              <button
                className={`${styles.modeBtn} ${bedConfig.workspaceMode === "tumbler-wrap" ? styles.modeBtnActive : ""}`}
                onClick={() => onWorkspaceModeChange("tumbler-wrap")}
              >Tumbler</button>
              {bedConfig.workspaceMode === "tumbler-wrap" && onTumblerViewModeChange && (
                <div className={styles.viewSubToggle}>
                  <button
                    className={`${styles.viewSubBtn} ${tumblerViewMode === "grid" ? styles.viewSubBtnActive : ""}`}
                    onClick={() => onTumblerViewModeChange("grid")}
                  >Grid</button>
                  <button
                    className={`${styles.viewSubBtn} ${tumblerViewMode === "3d-placement" ? styles.viewSubBtnActive : ""}`}
                    onClick={() => onTumblerViewModeChange("3d-placement")}
                  >3D</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: Clear workspace */}
        <div className={styles.toolbarRight}>
          {placedItems.length > 0 && (
            clearConfirm ? (
              <>
                <span className={styles.confirmLabel}>Clear?</span>
                <button className={styles.confirmYes} onClick={() => { onClearWorkspace(); setClearConfirm(false); }}>Yes</button>
                <button className={styles.confirmNo}  onClick={() => setClearConfirm(false)}>No</button>
              </>
            ) : (
              <button className={styles.clearLink} onClick={() => setClearConfirm(true)}>Clear Workspace</button>
            )
          )}
        </div>
      </div>

      {/* ── Konva Stage ── */}
      <Stage
        ref={stageRef}
        width={containerSize.w}
        height={containerSize.h}
        className={styles.canvas}
        scaleX={zoom}
        scaleY={zoom}
        x={pan.x}
        y={pan.y}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer>
          <Group x={bedOffsetX} y={bedOffsetY}>

            {/* Bed background — also the click target */}
            <Rect
              x={0} y={0} width={bedPxW} height={bedPxH}
              fill="#1a1e22" stroke="#2a3a45" strokeWidth={1}
              onClick={handleBedClick}
            />

            {/* ── Product overlay — schematic (full alpha, pre-tuned) or photo (user opacity) ── */}
            {overlayCanvas && (
              <KonvaImage
                image={overlayCanvas}
                x={0}
                y={0}
                width={bedPxW}
                height={bedPxH}
                opacity={overlayMode === "schematic" ? 1 : overlayOpacityPct / 100}
                globalCompositeOperation={overlayBlend === "multiply" ? "multiply" : "source-over"}
                listening={false}
              />
            )}

            {/* Mockup overlay */}
            {mockupImg && mockupImageProps && (
              <KonvaImage
                image={mockupImg}
                x={mockupImageProps.x} y={mockupImageProps.y}
                width={mockupImageProps.width} height={mockupImageProps.height}
                opacity={mockupImageProps.opacity}
                listening={false}
              />
            )}

            {/* FlatBed item overlay (SVG-rendered) */}
            {flatBedImg && (
              <KonvaImage
                image={flatBedImg}
                x={0} y={0}
                width={bedPxW}
                height={flatBedImg.naturalHeight * (bedPxW / flatBedImg.naturalWidth)}
                listening={false}
              />
            )}

            {/* Grid */}
            {gridLines}

            {/* Crosshairs */}
            {crosshairNodes}

            {/* Tumbler guides */}
            {tumblerGuideNodes}

            {/* Tumbler wrap guides (FRONT, handle zone, seam) */}
            {twoSidedCrosshairNodes}

            {/* Coordinate labels */}
            {coordLabels}

            {/* Empty placeholder */}
            {showPlaceholder && (
              <Text
                x={bedPxW * 0.1} y={bedPxH / 2 - 20}
                width={bedPxW * 0.8} align="center"
                text={"Upload an SVG in the left panel,\nthen click \u201cPlace on Bed\u201d to position it here."}
                fontSize={12} fontFamily="system-ui,sans-serif"
                fill="#303030" lineHeight={1.6} listening={false}
              />
            )}

            {/* Placed SVG items */}
            {placedItems.map(item => {
              const img = imageCache.get(item.id);
              const ix = item.x * basePxPerMm;
              const iy = item.y * basePxPerMm;
              const iw = item.width  * basePxPerMm;
              const ih = item.height * basePxPerMm;
              return (
                <KonvaImage
                  key={item.id}
                  id={`ki_${item.id}`}
                  image={img}
                  x={ix} y={iy}
                  width={iw} height={ih}
                  rotation={item.rotation ?? 0}
                  draggable
                  onClick={(e) => { e.cancelBubble = true; onSelectItem(item.id); }}
                  onDragEnd={(e) => {
                    const node = e.target;
                    let nx = node.x() / basePxPerMm;
                    let ny = node.y() / basePxPerMm;
                    if (bedConfig.snapToGrid) { nx = snapToStep(nx, bedConfig.gridSpacing); ny = snapToStep(ny, bedConfig.gridSpacing); }
                    nx = clamp(nx, 0, bedConfig.width  - item.width);
                    ny = clamp(ny, 0, bedConfig.height - item.height);
                    onUpdateItem(item.id, { x: +nx.toFixed(3), y: +ny.toFixed(3) });
                    node.x(nx * basePxPerMm);
                    node.y(ny * basePxPerMm);
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const scX = node.scaleX();
                    const scY = node.scaleY();
                    const newW = Math.max(1, (item.width  * scX));
                    const newH = Math.max(1, (item.height * scY));
                    const nx = clamp(node.x() / basePxPerMm, 0, bedConfig.width  - newW);
                    const ny = clamp(node.y() / basePxPerMm, 0, bedConfig.height - newH);
                    node.scaleX(1); node.scaleY(1);
                    node.x(nx * basePxPerMm); node.y(ny * basePxPerMm);
                    node.width(newW  * basePxPerMm);
                    node.height(newH * basePxPerMm);
                    onUpdateItem(item.id, {
                      x: +nx.toFixed(3), y: +ny.toFixed(3),
                      width: +newW.toFixed(3), height: +newH.toFixed(3),
                      rotation: node.rotation(),
                    });
                  }}
                />
              );
            })}

            {/* Frame preview */}
            {framePreview && (
              <Rect
                x={framePreview.originXmm * basePxPerMm}
                y={framePreview.originYmm * basePxPerMm}
                width={framePreview.widthMm  * basePxPerMm}
                height={framePreview.heightMm * basePxPerMm}
                fill="rgba(255,165,0,0.05)"
                stroke="#ffa500"
                strokeWidth={1}
                dash={[4, 3]}
                listening={false}
              />
            )}

            {/* Transformer (selection handles) */}
            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={false}
              borderStroke="#ff6600"
              borderStrokeWidth={1.5}
              borderDash={[4, 2]}
              anchorFill="#ff6600"
              anchorStroke="#ff3300"
              anchorCornerRadius={2}
              anchorSize={8}
            />

          </Group>
        </Layer>
      </Stage>

      {/* ── Nudge control (DOM overlay, bottom-right of canvas) ── */}
      {selectedItem && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          display: "grid", gridTemplateColumns: "24px 24px 24px", gridTemplateRows: "24px 24px 24px",
          gap: 3, zIndex: 10,
        }}>
          {([
            { col: 2, row: 1, label: "↑", dx: 0,  dy: -1 },
            { col: 1, row: 2, label: "←", dx: -1, dy:  0 },
            { col: 3, row: 2, label: "→", dx:  1, dy:  0 },
            { col: 2, row: 3, label: "↓", dx: 0,  dy:  1 },
          ] as { col: number; row: number; label: string; dx: number; dy: number }[]).map(btn => (
            <button
              key={btn.label}
              onClick={() => {
                const step = bedConfig.snapToGrid ? bedConfig.gridSpacing : 1;
                onNudgeSelected(btn.dx * step, btn.dy * step);
              }}
              style={{
                gridColumn: btn.col, gridRow: btn.row,
                background: "rgba(30,40,50,0.85)", border: "1px solid #3a5060",
                color: "#8ab0c8", borderRadius: 4, cursor: "pointer",
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
