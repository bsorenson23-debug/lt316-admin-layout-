"use client";

/**
 * LaserBedWorkspace
 *
 * The center panel SVG canvas that renders:
 *   - A scaled laser bed outline with grid overlay
 *   - Placed SVG items (draggable, selectable)
 *   - One-shot click-to-place behavior when placement is armed
 *   - An origin indicator (top-left by default)
 *
 * Coordinate system: origin = top-left corner of the bed.
 * x increases right, y increases down (matches screen coordinates).
 * All item positions and bed dimensions are stored in mm; this component
 * converts to canvas pixels using a computed scale factor.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BedConfig, PlacedItem, PlacedItemPatch, SvgAsset, WorkspaceMode } from "@/types/admin";
import { calcBedScale, clamp, mmToPx, pxToMm } from "@/utils/geometry";
import {
  getActiveTumblerGuideBand,
  getGrooveGuideOverlayMetrics,
  shouldRenderTumblerGuideBand,
} from "@/utils/tumblerGuides";
import { svgToDataUrl } from "@/utils/svg";
import { BedNudgeControl, BED_NUDGE_PANEL_SIZE_PX } from "./BedNudgeControl";
import styles from "./LaserBedWorkspace.module.css";

/** Length of the origin axis arrows in canvas pixels (fixed, decorative). */
const ORIGIN_ARROW_PX = 16;
const ORIGIN_GUIDE_INSET_PX = 8;
const ORIGIN_WIDGET_OFFSET_PX = 12;
const CENTER_TARGET_OUTER_PX = 5.5;
const CENTER_TARGET_INNER_PX = 1.8;
const BED_VERTICAL_LIFT_PX = 14;
const BOTTOM_LABEL_OFFSET_PX = 12;


function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function formatMm(value: number): string {
  return Number.isInteger(value)
    ? `${value}`
    : value.toFixed(2).replace(/\.?0+$/, "");
}

function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

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
  printTopPct: number;    // 0–1 fraction of image height where printable zone starts
  printBottomPct: number; // 0–1 fraction of image height where printable zone ends
  opacity: number;        // 0–1
}

interface Props {
  bedConfig: BedConfig;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  placementAsset: SvgAsset | null;
  isPlacementArmed: boolean;
  framePreview?: FramePreviewProp | null;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  /** Show Front/Back crosshairs with snap-to-center (tumbler two-sided mode). */
  showTwoSidedCrosshairs?: boolean;
  mockupConfig?: BedMockupConfig | null;
  onPlaceAsset: (xMm: number, yMm: number) => void;
  onSelectItem: (id: string | null) => void;
  onUpdateItem: (id: string, patch: PlacedItemPatch) => void;
  onNudgeSelected: (dxMm: number, dyMm: number) => void;
  onDeleteItem?: (id: string) => void;
  onClearWorkspace: () => void;
}

export function LaserBedWorkspace({
  bedConfig,
  placedItems,
  selectedItemId,
  placementAsset,
  isPlacementArmed,
  framePreview,
  onWorkspaceModeChange,
  showTwoSidedCrosshairs = false,
  mockupConfig,
  onPlaceAsset,
  onSelectItem,
  onUpdateItem,
  onNudgeSelected,
  onDeleteItem,
  onClearWorkspace,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1); // px per mm
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [clearConfirm, setClearConfirm] = useState(false);

  // -------------------------------------------------------------------------
  // Recalculate scale whenever container or bed dimensions change
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const recalc = () => {
      const { offsetWidth, offsetHeight } = el;
      setContainerSize({ w: offsetWidth, h: offsetHeight });
      const s = calcBedScale(
        bedConfig.width,
        bedConfig.height,
        offsetWidth,
        offsetHeight,
        40
      );
      setScale(s);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bedConfig.width, bedConfig.height]);

  // -------------------------------------------------------------------------
  // Derived pixel dimensions
  // -------------------------------------------------------------------------
  const bedPxW = mmToPx(bedConfig.width, scale);
  const bedPxH = mmToPx(bedConfig.height, scale);
  // Centre the bed within the container
  const bedOffsetX = (containerSize.w - bedPxW) / 2;
  const bedOffsetY = Math.max(
    8,
    (containerSize.h - bedPxH) / 2 - BED_VERTICAL_LIFT_PX
  );
  const selectedItem = placedItems.find((item) => item.id === selectedItemId) ?? null;
  const nudgeStepMm = bedConfig.snapToGrid ? bedConfig.gridSpacing : 1;

  const activeGuideBand = getActiveTumblerGuideBand(bedConfig);
  const showGuideBands = shouldRenderTumblerGuideBand(bedConfig);

  useEffect(() => {
    if (!isDevEnvironment()) return;
    if (!activeGuideBand) return;
    console.info("[tumbler-guides] loaded guide band", {
      upperGrooveYmm: activeGuideBand.upperGrooveYmm,
      lowerGrooveYmm: activeGuideBand.lowerGrooveYmm,
      showGuideBands,
    });
  }, [
    activeGuideBand,
    activeGuideBand?.upperGrooveYmm,
    activeGuideBand?.lowerGrooveYmm,
    showGuideBands,
  ]);

  // -------------------------------------------------------------------------
  // Keyboard: Delete / Backspace removes selected item
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedItemId || !onDeleteItem) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteItem(selectedItemId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedItemId, onDeleteItem]);

  // -------------------------------------------------------------------------
  // Drag state
  // -------------------------------------------------------------------------
  const dragRef = useRef<{
    itemId: string;
    startMouseX: number;
    startMouseY: number;
    startItemX: number; // mm
    startItemY: number; // mm
    itemWidth: number; // mm
    itemHeight: number; // mm
  } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      const {
        itemId,
        startMouseX,
        startMouseY,
        startItemX,
        startItemY,
        itemWidth,
        itemHeight,
      } =
        dragRef.current;
      const dx = pxToMm(e.clientX - startMouseX, scale);
      const dy = pxToMm(e.clientY - startMouseY, scale);

      let nextX = startItemX + dx;
      let nextY = startItemY + dy;
      const disableSnap = e.altKey || e.shiftKey;
      if (bedConfig.snapToGrid && !disableSnap) {
        nextX = snapToStep(nextX, bedConfig.gridSpacing);
        nextY = snapToStep(nextY, bedConfig.gridSpacing);
      }

      const maxX = Math.max(0, bedConfig.width - itemWidth);
      const maxY = Math.max(0, bedConfig.height - itemHeight);
      nextX = clamp(nextX, 0, maxX);
      nextY = clamp(nextY, 0, maxY);

      onUpdateItem(itemId, {
        x: Number(nextX.toFixed(3)),
        y: Number(nextY.toFixed(3)),
      });
    },
    [scale, onUpdateItem, bedConfig.snapToGrid, bedConfig.gridSpacing, bedConfig.width, bedConfig.height]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // -------------------------------------------------------------------------
  // Canvas click: place armed asset once or deselect
  // -------------------------------------------------------------------------
  const handleBedClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (!isPlacementArmed || !placementAsset) {
        onSelectItem(null);
        return;
      }
      const rect = (e.target as SVGRectElement).getBoundingClientRect();
      let xMm = pxToMm(e.clientX - rect.left, scale);
      let yMm = pxToMm(e.clientY - rect.top, scale);

      // Snap to Front/Back crosshair when within 15% of bed width
      if (showTwoSidedCrosshairs) {
        const snapRadiusMm = bedConfig.width * 0.15;
        const crosshairs = [
          { x: bedConfig.width * 0.25, y: bedConfig.height * 0.5 },
          { x: bedConfig.width * 0.75, y: bedConfig.height * 0.5 },
        ];
        for (const ch of crosshairs) {
          const dist = Math.hypot(xMm - ch.x, yMm - ch.y);
          if (dist <= snapRadiusMm) {
            xMm = ch.x;
            yMm = ch.y;
            break;
          }
        }
      }

      onPlaceAsset(xMm, yMm);
    },
    [isPlacementArmed, placementAsset, scale, onPlaceAsset, onSelectItem, showTwoSidedCrosshairs, bedConfig]
  );

  return (
    <div className={styles.wrapper} ref={containerRef}>
      {/* Toolbar row */}
      <div className={styles.toolbar}>
        <span className={styles.bedInfo}>
          {formatMm(bedConfig.width)} x {formatMm(bedConfig.height)} mm
          &nbsp;|&nbsp; grid: {formatMm(bedConfig.gridSpacing)} mm
        </span>
        <OriginChip originPosition={bedConfig.originPosition} />
        {isPlacementArmed && placementAsset ? (
          <span className={styles.activeTip}>
            Click bed once to place &quot;{placementAsset.name.replace(/\.svg$/i, "")}&quot;
          </span>
        ) : (
          <span className={styles.activeTip} style={{ color: "#555" }}>
            Select an asset, then click &quot;Place on Bed&quot;
          </span>
        )}
        {placedItems.length > 0 && (
          clearConfirm ? (
            <>
              <span className={styles.confirmLabel}>Clear all items?</span>
              <button className={styles.confirmYes} onClick={() => { onClearWorkspace(); setClearConfirm(false); }}>Yes</button>
              <button className={styles.confirmNo} onClick={() => setClearConfirm(false)}>Cancel</button>
            </>
          ) : (
            <button className={styles.clearBtn} onClick={() => setClearConfirm(true)}>
              Clear Workspace
            </button>
          )
        )}
      </div>

      {/* ── Mode selector — large centered overlay ── */}
      {onWorkspaceModeChange && (
        <div className={styles.modeOverlay}>
          <button
            className={`${styles.modeBtn} ${bedConfig.workspaceMode === "flat-bed" ? styles.modeBtnActive : ""}`}
            onClick={() => onWorkspaceModeChange("flat-bed")}
          >
            Flat Bed
          </button>
          <button
            className={`${styles.modeBtn} ${bedConfig.workspaceMode === "tumbler-wrap" ? styles.modeBtnActive : ""}`}
            onClick={() => onWorkspaceModeChange("tumbler-wrap")}
          >
            Tumbler
          </button>
        </div>
      )}

      {/* SVG canvas */}
      <svg
        className={styles.canvas}
        width={containerSize.w}
        height={containerSize.h}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPlacementArmed ? "crosshair" : "default" }}
      >
        {/* Defs: grid pattern + arrow markers for origin indicator */}
        <defs>
          <pattern
            id="grid-minor"
            width={mmToPx(bedConfig.gridSpacing, scale)}
            height={mmToPx(bedConfig.gridSpacing, scale)}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${mmToPx(bedConfig.gridSpacing, scale)} 0 L 0 0 0 ${mmToPx(
                bedConfig.gridSpacing,
                scale
              )}`}
              fill="none"
              stroke="#2e2e2e"
              strokeWidth="0.5"
            />
          </pattern>
          <marker id="arrowX" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#a54444" />
          </marker>
          <marker id="arrowY" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#2f7b48" />
          </marker>
        </defs>

        {/* Bed group (offset to centre) */}
        <g transform={`translate(${bedOffsetX}, ${bedOffsetY})`}>
          {/* Bed background */}
          <rect
            x={0}
            y={0}
            width={bedPxW}
            height={bedPxH}
            fill="#1c1c1c"
            stroke="none"
          />

          {/* Tumbler mockup overlay */}
          {mockupConfig && (
            <BedMockupOverlay
              config={mockupConfig}
              bedPxW={bedPxW}
              bedPxH={bedPxH}
            />
          )}

          {/* Bed boundary */}
          <rect
            x={0}
            y={0}
            width={bedPxW}
            height={bedPxH}
            fill="none"
            stroke="#404040"
            strokeWidth="1.5"
            rx={1}
          />

          {/* Light grey grid, 25mm apart */}
          {Array.from({ length: Math.floor(bedConfig.width / bedConfig.gridSpacing) + 1 }, (_, i) => {
            const x = -bedConfig.width / 2 + i * bedConfig.gridSpacing;
            return (
              <line
                key={`grid-x-${x}`}
                x1={mmToPx(x + bedConfig.width / 2, scale)}
                y1={0}
                x2={mmToPx(x + bedConfig.width / 2, scale)}
                y2={bedPxH}
                stroke="#2e2e2e"
                strokeWidth={0.8}
                opacity={1}
              />
            );
          })}
          {Array.from({ length: Math.floor(bedConfig.height / bedConfig.gridSpacing) + 1 }, (_, i) => {
            const y = -bedConfig.height / 2 + i * bedConfig.gridSpacing;
            return (
              <line
                key={`grid-y-${y}`}
                x1={0}
                y1={mmToPx(y + bedConfig.height / 2, scale)}
                x2={bedPxW}
                y2={mmToPx(y + bedConfig.height / 2, scale)}
                stroke="#2e2e2e"
                strokeWidth={0.8}
                opacity={1}
              />
            );
          })}

          {/* Crosshair overlays render above grid and below items */}
          {bedConfig.showCrosshair && (
            <BedGuideCrosshair bedConfig={bedConfig} scale={scale} />
          )}

          {showGuideBands && activeGuideBand && (
            <TumblerGuideBandsOverlay
              bedWidthMm={bedConfig.width}
              band={activeGuideBand}
              scale={scale}
            />
          )}

          {/* Click target for placement (behind items) */}
          <rect
            x={0}
            y={0}
            width={bedPxW}
            height={bedPxH}
            fill="transparent"
            onClick={handleBedClick}
            style={{ cursor: isPlacementArmed ? "crosshair" : "default" }}
          />

          {/* Origin indicator */}
          {bedConfig.showOrigin && (
            <OriginMarker bedConfig={bedConfig} scale={scale} />
          )}

          {/* Placed items */}
          {placedItems.map((item) => {
            const isSelected = item.id === selectedItemId;
            const px = mmToPx(item.x, scale);
            const py = mmToPx(item.y, scale);
            const pw = mmToPx(item.width, scale);
            const ph = mmToPx(item.height, scale);
            const cx = px + pw / 2;
            const cy = py + ph / 2;

            return (
              <g
                key={item.id}
                transform={`rotate(${item.rotation}, ${cx}, ${cy})`}
                style={{ cursor: isSelected ? "grab" : "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id);
                }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();

                  if (!isSelected) {
                    onSelectItem(item.id);
                    return;
                  }

                  onSelectItem(item.id);
                  dragRef.current = {
                    itemId: item.id,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startItemX: item.x,
                    startItemY: item.y,
                    itemWidth: item.width,
                    itemHeight: item.height,
                  };
                }}
              >
                {/* SVG content via foreignObject-like approach: use image */}
                <image
                  x={px}
                  y={py}
                  width={pw}
                  height={ph}
                  href={svgToDataUrl(item.svgText)}
                  preserveAspectRatio="none"
                />

                {/* Selection outline */}
                {isSelected && (
                  <>
                    <rect
                      x={px - 2}
                      y={py - 2}
                      width={pw + 4}
                      height={ph + 4}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      rx={2}
                    />
                    {/* Selection handles */}
                    {[
                      [px, py],
                      [px + pw, py],
                      [px, py + ph],
                      [px + pw, py + ph],
                    ].map(([hx, hy], idx) => (
                      <rect
                        key={idx}
                        x={hx - 3}
                        y={hy - 3}
                        width={6}
                        height={6}
                        fill="#f97316"
                        stroke="#141414"
                        strokeWidth={1}
                      />
                    ))}
                  </>
                )}
              </g>
            );
          })}

          {selectedItem && (
            <BedNudgeControl
              x={Math.max(8, bedPxW - BED_NUDGE_PANEL_SIZE_PX - 10)}
              y={10}
              stepMm={nudgeStepMm}
              onNudge={onNudgeSelected}
            />
          )}

          {/* Empty state — shown when no items are placed and placement is not armed */}
          {placedItems.length === 0 && !isPlacementArmed && (
            <g pointerEvents="none">
              <text
                x={bedPxW / 2}
                y={bedPxH / 2 - 9}
                fill="#3a3a3a"
                fontSize={12}
                fontFamily="monospace"
                textAnchor="middle"
              >
                Upload an SVG in the left panel,
              </text>
              <text
                x={bedPxW / 2}
                y={bedPxH / 2 + 9}
                fill="#333"
                fontSize={11}
                fontFamily="monospace"
                textAnchor="middle"
              >
                then click &quot;Place on Bed&quot; to position it here.
              </text>
            </g>
          )}

          {/* Frame preview — dashed rectangle showing where the job will engrave */}
          {framePreview && (
            <g pointerEvents="none">
              <rect
                x={mmToPx(framePreview.originXmm, scale)}
                y={mmToPx(framePreview.originYmm, scale)}
                width={mmToPx(framePreview.widthMm, scale)}
                height={mmToPx(framePreview.heightMm, scale)}
                fill="none"
                stroke="#4ea8c8"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                opacity={0.75}
              />
              <text
                x={mmToPx(framePreview.originXmm, scale) + 4}
                y={mmToPx(framePreview.originYmm, scale) - 4}
                className={styles.framePreviewLabel}
              >
                {`Frame ${framePreview.widthMm.toFixed(1)} × ${framePreview.heightMm.toFixed(1)} mm`}
              </text>
            </g>
          )}

          {/* Front / Back crosshairs */}
          {showTwoSidedCrosshairs && (
            <TwoSidedCrosshairOverlay
              bedConfig={bedConfig}
              scale={scale}
            />
          )}

          {/* Coordinate labels along edges */}
          <CoordLabels
            bedConfig={bedConfig}
            scale={scale}
          />
        </g>

      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tumbler mockup background overlay
// ---------------------------------------------------------------------------

function BedMockupOverlay({
  config,
  bedPxW,
  bedPxH,
}: {
  config: BedMockupConfig;
  bedPxW: number;
  bedPxH: number;
}) {
  const zoneH = config.printBottomPct - config.printTopPct;
  if (zoneH <= 0) return null;

  const scaledImgH = bedPxH / zoneH;
  const aspect = config.naturalWidth / config.naturalHeight;
  const scaledImgW = scaledImgH * aspect;
  const imgX = bedPxW / 2 - scaledImgW / 2;
  const imgY = -config.printTopPct * scaledImgH;

  return (
    <image
      x={imgX}
      y={imgY}
      width={scaledImgW}
      height={scaledImgH}
      href={config.src}
      opacity={config.opacity}
      preserveAspectRatio="none"
      pointerEvents="none"
    />
  );
}

// ---------------------------------------------------------------------------
// Toolbar: origin position chip with LightBurn alignment tooltip
// ---------------------------------------------------------------------------

function OriginChip({
  originPosition,
}: {
  originPosition: BedConfig["originPosition"];
}) {
  const [showTip, setShowTip] = useState(false);
  const label = originPosition === "bottom-left" ? "Bottom-Left" : "Top-Left";

  return (
    <div
      className={styles.originChip}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <span className={styles.originChipDot} />
      <span className={styles.originChipText}>
        Origin: {label} · Absolute
      </span>
      {showTip && (
        <div className={styles.originTooltip}>
          <span className={styles.originTooltipTitle}>Job Start Position</span>
          <div className={styles.originTooltipRow}>
            <span className={styles.originTooltipLabel}>LightBurn mode</span>
            <span className={styles.originTooltipValue}>Absolute Coords</span>
          </div>
          <div className={styles.originTooltipRow}>
            <span className={styles.originTooltipLabel}>Machine origin</span>
            <span className={styles.originTooltipValue}>{label} corner</span>
          </div>
          <div className={styles.originTooltipHint}>
            In LightBurn → Device Settings, set Origin to match. A mismatch is
            the most common cause of artwork landing in the wrong position.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Front / Back crosshair overlay (tumbler two-sided mode)
// ---------------------------------------------------------------------------

function TwoSidedCrosshairOverlay({
  bedConfig,
  scale,
}: {
  bedConfig: BedConfig;
  scale: number;
}) {
  const bedPxW = mmToPx(bedConfig.width, scale);
  const bedPxH = mmToPx(bedConfig.height, scale);

  const crosshairs = [
    { xMm: bedConfig.width * 0.25, label: "FRONT", color: "#7ecfa8" },
    { xMm: bedConfig.width * 0.75, label: "BACK",  color: "#6ab0e8" },
  ];

  return (
    <g pointerEvents="none">
      {/* Center divider */}
      <line
        x1={bedPxW / 2} y1={0}
        x2={bedPxW / 2} y2={bedPxH}
        stroke="#2a2a2a"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {crosshairs.map(({ xMm, label, color }) => {
        const cx = mmToPx(xMm, scale);
        const cy = bedPxH / 2;
        const armH = bedPxH * 0.28;
        const armW = bedPxW * 0.12;

        return (
          <g key={label}>
            {/* Vertical arm */}
            <line x1={cx} y1={cy - armH} x2={cx} y2={cy + armH}
              stroke={color} strokeWidth={1} opacity={0.35} />
            {/* Horizontal arm */}
            <line x1={cx - armW} y1={cy} x2={cx + armW} y2={cy}
              stroke={color} strokeWidth={1} opacity={0.35} />
            {/* Center diamond */}
            <path
              d={`M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              opacity={0.9}
            />
            <circle cx={cx} cy={cy} r={2} fill={color} opacity={0.9} />
            {/* Label */}
            <text
              x={cx}
              y={cy - armH - 8}
              fill={color}
              fontSize={10}
              fontFamily="monospace"
              fontWeight="700"
              letterSpacing="0.08em"
              textAnchor="middle"
              opacity={0.85}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Coordinate labels along bed edges
// ---------------------------------------------------------------------------

function CoordLabels({
  bedConfig,
  scale,
}: {
  bedConfig: BedConfig;
  scale: number;
}) {
  // Centered grid numbers: X from -150 to 150, Y from -150 to 150
  const step = bedConfig.gridSpacing;
  const labels: React.ReactNode[] = [];
  const w = bedConfig.width;
  const h = bedConfig.height;
  // X axis: bottom edge
  for (let x = -w / 2; x <= w / 2; x += step) {
    labels.push(
      <text
        key={`x-${x}`}
        x={mmToPx(x + w / 2, scale)}
        y={mmToPx(h, scale) + BOTTOM_LABEL_OFFSET_PX}
        fill="#505050"
        fontSize={9}
        fontFamily="monospace"
        textAnchor="middle"
      >
        {formatMm(x)}
      </text>
    );
  }
  // Y axis: left edge
  for (let y = -h / 2; y <= h / 2; y += step) {
    labels.push(
      <text
        key={`y-${y}`}
        x={-8}
        y={mmToPx(y + h / 2, scale) + 4}
        fill="#505050"
        fontSize={9}
        fontFamily="monospace"
        textAnchor="end"
      >
        {formatMm(y)}
      </text>
    );
  }
  return <>{labels}</>;
}

function TumblerGuideBandsOverlay({
  bedWidthMm,
  band,
  scale,
}: {
  bedWidthMm: number;
  band: {
    upperGrooveYmm: number;
    lowerGrooveYmm: number;
  };
  scale: number;
}) {
  const { widthPx, upperYpx, lowerYpx, bandHeightPx } =
    getGrooveGuideOverlayMetrics({
      bedWidthMm,
      scale,
      band,
    });
  const shouldShowLabels = bandHeightPx >= 22 && widthPx >= 140;

  return (
    <g pointerEvents="none">
      <rect
        x={0}
        y={upperYpx}
        width={widthPx}
        height={bandHeightPx}
        fill="#4e6f82"
        opacity={0.08}
      />
      <line
        x1={0}
        y1={upperYpx}
        x2={widthPx}
        y2={upperYpx}
        stroke="#4e6f82"
        strokeWidth={1.2}
        strokeDasharray="2 5"
        strokeLinecap="round"
        opacity={0.9}
      />
      <line
        x1={0}
        y1={lowerYpx}
        x2={widthPx}
        y2={lowerYpx}
        stroke="#4e6f82"
        strokeWidth={1.2}
        strokeDasharray="2 5"
        strokeLinecap="round"
        opacity={0.9}
      />
      {shouldShowLabels && (
        <>
          <text
            x={6}
            y={upperYpx - 4}
            fill="#315264"
            fontSize={9}
            fontFamily="monospace"
          >
            Upper groove
          </text>
          <text
            x={6}
            y={lowerYpx - 4}
            fill="#315264"
            fontSize={9}
            fontFamily="monospace"
          >
            Lower groove
          </text>
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Guide overlay helpers
// ---------------------------------------------------------------------------

function getOriginPointPx(
  bedConfig: BedConfig,
  scale: number
): { x: number; y: number } {
  if (bedConfig.originPosition === "bottom-left") {
    return { x: 0, y: mmToPx(bedConfig.height, scale) };
  }
  return { x: 0, y: 0 };
}

function BedGuideCrosshair({
  bedConfig,
  scale,
}: {
  bedConfig: BedConfig;
  scale: number;
}) {
  const bedPxW = mmToPx(bedConfig.width, scale);
  const bedPxH = mmToPx(bedConfig.height, scale);
  const centerX = bedPxW / 2;
  const centerY = bedPxH / 2;
  const origin = getOriginPointPx(bedConfig, scale);

  const showOriginGuides =
    bedConfig.crosshairMode === "origin" || bedConfig.crosshairMode === "both";
  const showCenterGuides =
    bedConfig.crosshairMode === "center" || bedConfig.crosshairMode === "both";

  const originGuideX = origin.x + ORIGIN_GUIDE_INSET_PX;
  const originGuideY =
    bedConfig.originPosition === "bottom-left"
      ? origin.y - ORIGIN_GUIDE_INSET_PX
      : origin.y + ORIGIN_GUIDE_INSET_PX;

  return (
    <g pointerEvents="none">
      {showCenterGuides && (
        <g>
          <line
            x1={centerX}
            y1={0}
            x2={centerX}
            y2={bedPxH}
            stroke="#0e6984"
            strokeWidth={1.9}
            strokeDasharray="10 6"
            strokeLinecap="round"
            opacity={0.92}
          />
          <line
            x1={0}
            y1={centerY}
            x2={bedPxW}
            y2={centerY}
            stroke="#0e6984"
            strokeWidth={1.9}
            strokeDasharray="10 6"
            strokeLinecap="round"
            opacity={0.92}
          />
          {/* Center target marker (rendered above guide dashes) */}
          <circle
            cx={centerX}
            cy={centerY}
            r={CENTER_TARGET_OUTER_PX}
            fill="#1c1c1c"
            fillOpacity={0.9}
            stroke="#0a5a72"
            strokeWidth={1.35}
          />
          <circle
            cx={centerX}
            cy={centerY}
            r={CENTER_TARGET_INNER_PX}
            fill="#0a5a72"
          />
        </g>
      )}

      {showOriginGuides && (
        <g>
          <line
            x1={originGuideX}
            y1={0}
            x2={originGuideX}
            y2={bedPxH}
            stroke="#9f683e"
            strokeWidth={1.35}
            strokeDasharray="4 7"
            strokeLinecap="round"
            opacity={0.76}
          />
          <line
            x1={0}
            y1={originGuideY}
            x2={bedPxW}
            y2={originGuideY}
            stroke="#9f683e"
            strokeWidth={1.35}
            strokeDasharray="4 7"
            strokeLinecap="round"
            opacity={0.76}
          />
          <line
            x1={origin.x}
            y1={origin.y}
            x2={originGuideX}
            y2={origin.y}
            stroke="#9f683e"
            strokeWidth={1.35}
            strokeLinecap="round"
            opacity={0.78}
          />
          <line
            x1={origin.x}
            y1={origin.y}
            x2={origin.x}
            y2={originGuideY}
            stroke="#9f683e"
            strokeWidth={1.35}
            strokeLinecap="round"
            opacity={0.78}
          />
        </g>
      )}
    </g>
  );
}

function OriginMarker({
  bedConfig,
  scale,
}: {
  bedConfig: BedConfig;
  scale: number;
}) {
  const origin = getOriginPointPx(bedConfig, scale);
  const yAxisDirection = bedConfig.originPosition === "bottom-left" ? -1 : 1;
  const widgetX = origin.x + ORIGIN_WIDGET_OFFSET_PX;
  const widgetY = origin.y + ORIGIN_WIDGET_OFFSET_PX * yAxisDirection;
  const originLabelY = widgetY + (yAxisDirection > 0 ? 11 : -6);

  const badgeX = widgetX + ORIGIN_ARROW_PX + 4;
  const badgeY = originLabelY - 9;
  const badgeW = 34;
  const badgeH = 13;

  return (
    <g pointerEvents="none">
      <title>{`Machine origin (0, 0) — ${bedConfig.originPosition} corner. Use Absolute Coords in LightBurn.`}</title>
      {/* True machine-origin anchor point */}
      <circle
        cx={origin.x}
        cy={origin.y}
        r={2}
        fill="#2a2a2a"
        stroke="#8b5f40"
        strokeWidth={1}
        opacity={0.92}
      />
      <line
        x1={origin.x}
        y1={origin.y}
        x2={widgetX}
        y2={widgetY}
        stroke="#8b5f40"
        strokeWidth={1.1}
        opacity={0.72}
      />
      <line
        x1={widgetX}
        y1={widgetY}
        x2={widgetX + ORIGIN_ARROW_PX}
        y2={widgetY}
        stroke="#a54444"
        strokeWidth={1.75}
        markerEnd="url(#arrowX)"
      />
      <line
        x1={widgetX}
        y1={widgetY}
        x2={widgetX}
        y2={widgetY + ORIGIN_ARROW_PX * yAxisDirection}
        stroke="#2f7b48"
        strokeWidth={1.75}
        markerEnd="url(#arrowY)"
      />
      <circle
        cx={widgetX}
        cy={widgetY}
        r={2.8}
        fill="#f6c48d"
        stroke="#825633"
        strokeWidth={0.85}
      />
      <text
        x={widgetX + ORIGIN_ARROW_PX + 1}
        y={widgetY + 3}
        fill="#8f3f3f"
        fontSize={8}
        fontFamily="monospace"
      >
        X
      </text>
      <text
        x={widgetX + 2}
        y={widgetY + ORIGIN_ARROW_PX * yAxisDirection + (yAxisDirection > 0 ? 7 : -1)}
        fill="#2f7b48"
        fontSize={8}
        fontFamily="monospace"
      >
        Y
      </text>
      {/* (0, 0) coordinate badge — replaces the vague "origin" text */}
      <rect
        x={badgeX}
        y={badgeY}
        width={badgeW}
        height={badgeH}
        rx={3}
        fill="#141210"
        stroke="#8b5f40"
        strokeWidth={0.75}
        opacity={0.9}
      />
      <text
        x={badgeX + badgeW / 2}
        y={badgeY + badgeH - 3}
        fill="#c49a6a"
        fontSize={8}
        fontFamily="monospace"
        textAnchor="middle"
      >
        (0, 0)
      </text>
    </g>
  );
}
