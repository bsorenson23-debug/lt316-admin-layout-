"use client";

/**
 * LaserBedWorkspace
 *
 * The center panel SVG canvas that renders:
 *   - A scaled laser bed outline with grid overlay
 *   - Placed SVG items (draggable, selectable)
 *   - Click-to-place behavior when an active asset is selected
 *   - An origin indicator (top-left by default)
 *
 * Coordinate system: origin = top-left corner of the bed.
 * x increases right, y increases down (matches screen coordinates).
 * All item positions and bed dimensions are stored in mm; this component
 * converts to canvas pixels using a computed scale factor.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BedConfig, PlacedItem, SvgAsset } from "@/types/admin";
import { calcBedScale, mmToPx, pxToMm } from "@/utils/geometry";
import { svgToDataUrl } from "@/utils/svg";
import styles from "./LaserBedWorkspace.module.css";

/** Length of the origin axis arrows in canvas pixels (fixed, decorative). */
const ORIGIN_ARROW_PX = 20;

interface Props {
  bedConfig: BedConfig;
  svgAssets: SvgAsset[];
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  activeAsset: SvgAsset | null;
  onPlaceAsset: (xMm: number, yMm: number) => void;
  onSelectItem: (id: string | null) => void;
  onUpdateItem: (id: string, patch: Partial<Omit<PlacedItem, "id" | "assetId">>) => void;
  onClearWorkspace: () => void;
}

export function LaserBedWorkspace({
  bedConfig,
  svgAssets,
  placedItems,
  selectedItemId,
  activeAsset,
  onPlaceAsset,
  onSelectItem,
  onUpdateItem,
  onClearWorkspace,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1); // px per mm
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

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
  const bedOffsetY = (containerSize.h - bedPxH) / 2;

  // -------------------------------------------------------------------------
  // Drag state
  // -------------------------------------------------------------------------
  const dragRef = useRef<{
    itemId: string;
    startMouseX: number;
    startMouseY: number;
    startItemX: number; // mm
    startItemY: number; // mm
  } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      const { itemId, startMouseX, startMouseY, startItemX, startItemY } =
        dragRef.current;
      const dx = pxToMm(e.clientX - startMouseX, scale);
      const dy = pxToMm(e.clientY - startMouseY, scale);
      onUpdateItem(itemId, {
        x: Math.max(0, startItemX + dx),
        y: Math.max(0, startItemY + dy),
      });
    },
    [scale, onUpdateItem]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // -------------------------------------------------------------------------
  // Canvas click: place active asset or deselect
  // -------------------------------------------------------------------------
  const handleBedClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (!activeAsset) {
        // Deselect when clicking empty bed
        onSelectItem(null);
        return;
      }
      const rect = (e.target as SVGRectElement).getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      onPlaceAsset(pxToMm(xPx, scale), pxToMm(yPx, scale));
    },
    [activeAsset, scale, onPlaceAsset, onSelectItem]
  );

  // -------------------------------------------------------------------------
  // Grid line generation
  // -------------------------------------------------------------------------
  const gridLines = buildGridLines(bedConfig, bedPxW, bedPxH);

  return (
    <div className={styles.wrapper} ref={containerRef}>
      {/* Toolbar row */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Laser Bed Workspace</span>
        <span className={styles.bedInfo}>
          {bedConfig.width} × {bedConfig.height} mm &nbsp;|&nbsp; grid:{" "}
          {bedConfig.gridSpacing} mm
        </span>
        {activeAsset ? (
          <span className={styles.activeTip}>
            Click bed to place &quot;{activeAsset.name.replace(/\.svg$/i, "")}&quot;
          </span>
        ) : (
          <span className={styles.activeTip} style={{ color: "#555" }}>
            Select an asset from the left panel
          </span>
        )}
        {placedItems.length > 0 && (
          <button className={styles.clearBtn} onClick={onClearWorkspace}>
            Clear Workspace
          </button>
        )}
      </div>

      {/* SVG canvas */}
      <svg
        className={styles.canvas}
        width={containerSize.w}
        height={containerSize.h}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: activeAsset ? "crosshair" : "default" }}
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
              stroke="#2a2a2a"
              strokeWidth="0.5"
            />
          </pattern>
          <marker id="arrowX" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#e05050" />
          </marker>
          <marker id="arrowY" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#50b050" />
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

          {/* Grid overlay */}
          <rect
            x={0}
            y={0}
            width={bedPxW}
            height={bedPxH}
            fill="url(#grid-minor)"
          />

          {/* Major grid lines every 5 minor cells */}
          {gridLines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="#2e2e2e"
              strokeWidth="1"
            />
          ))}

          {/* Bed boundary */}
          <rect
            x={0}
            y={0}
            width={bedPxW}
            height={bedPxH}
            fill="none"
            stroke="#f97316"
            strokeWidth="1.5"
            rx={1}
          />

          {/* Click target for placement (behind items) */}
          <rect
            x={0}
            y={0}
            width={bedPxW}
            height={bedPxH}
            fill="transparent"
            onClick={handleBedClick}
            style={{ cursor: activeAsset ? "crosshair" : "default" }}
          />

          {/* Origin indicator */}
          {bedConfig.showOrigin && (
            <g>
              <line x1={0} y1={0} x2={ORIGIN_ARROW_PX} y2={0} stroke="#e05050" strokeWidth={1.5} markerEnd="url(#arrowX)" />
              <line x1={0} y1={0} x2={0} y2={ORIGIN_ARROW_PX} stroke="#50b050" strokeWidth={1.5} markerEnd="url(#arrowY)" />
              <circle cx={0} cy={0} r={2.5} fill="#f97316" />
              <text x={ORIGIN_ARROW_PX + 2} y={4} fill="#e05050" fontSize={9} fontFamily="monospace">X</text>
              <text x={3} y={ORIGIN_ARROW_PX + 6} fill="#50b050" fontSize={9} fontFamily="monospace">Y</text>
            </g>
          )}

          {/* Placed items */}
          {placedItems.map((item) => {
            const asset = svgAssets.find((a) => a.id === item.assetId);
            if (!asset) return null;
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
                style={{ cursor: "grab" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id);
                  dragRef.current = {
                    itemId: item.id,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startItemX: item.x,
                    startItemY: item.y,
                  };
                }}
              >
                {/* SVG content via foreignObject-like approach: use image */}
                <image
                  x={px}
                  y={py}
                  width={pw}
                  height={ph}
                  href={svgToDataUrl(asset.content)}
                  preserveAspectRatio="xMidYMid meet"
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
// Coordinate labels along bed edges
// ---------------------------------------------------------------------------

function CoordLabels({
  bedConfig,
  scale,
}: {
  bedConfig: BedConfig;
  scale: number;
}) {
  const step = bedConfig.gridSpacing * 5; // label every 5 grid cells
  const labels: React.ReactNode[] = [];

  // X axis (top edge)
  for (let xMm = 0; xMm <= bedConfig.width; xMm += step) {
    const xPx = mmToPx(xMm, scale);
    labels.push(
      <text
        key={`lx-${xMm}`}
        x={xPx}
        y={-4}
        fill="#444"
        fontSize={8}
        fontFamily="monospace"
        textAnchor="middle"
      >
        {xMm}
      </text>
    );
  }

  // Y axis (left edge)
  for (let yMm = 0; yMm <= bedConfig.height; yMm += step) {
    const yPx = mmToPx(yMm, scale);
    labels.push(
      <text
        key={`ly-${yMm}`}
        x={-4}
        y={yPx + 3}
        fill="#444"
        fontSize={8}
        fontFamily="monospace"
        textAnchor="end"
      >
        {yMm}
      </text>
    );
  }

  return <>{labels}</>;
}

// ---------------------------------------------------------------------------
// Grid major lines (every 5 × gridSpacing)
// ---------------------------------------------------------------------------

function buildGridLines(
  bedConfig: BedConfig,
  bedPxW: number,
  bedPxH: number
): { x1: number; y1: number; x2: number; y2: number }[] {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const majorSpacing = bedConfig.gridSpacing * 5;
  const scaleX = bedPxW / bedConfig.width;
  const scaleY = bedPxH / bedConfig.height;

  // Vertical
  for (let xMm = 0; xMm <= bedConfig.width; xMm += majorSpacing) {
    const xPx = xMm * scaleX;
    lines.push({ x1: xPx, y1: 0, x2: xPx, y2: bedPxH });
  }
  // Horizontal
  for (let yMm = 0; yMm <= bedConfig.height; yMm += majorSpacing) {
    const yPx = yMm * scaleY;
    lines.push({ x1: 0, y1: yPx, x2: bedPxW, y2: yPx });
  }
  return lines;
}
