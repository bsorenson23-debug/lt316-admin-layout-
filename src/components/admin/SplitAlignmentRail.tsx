"use client";

/**
 * SplitAlignmentRail
 *
 * The vertical strip between the Front and Back panes in two-sided mode.
 * Renders a ruler aligned to the bed's Y coordinate system (origin = top = HOME),
 * with triangular handles pointing toward each pane showing where items sit,
 * and a dashed connector when front + back items share the same Y position.
 */

import React, { useEffect, useRef, useState } from "react";
import type { PlacedItem } from "@/types/admin";
import styles from "./SplitAlignmentRail.module.css";

const RAIL_W = 48;

// Extra vertical padding so the ruler zero-line visually aligns with the
// top of the bed rect inside LaserBedWorkspace.
// LaserBedWorkspace: toolbar ≈ 38px, splitPaneLabel ≈ 27px, bed margin ≈ 24px → total ≈ 89px
const PAD_TOP = 89;
const PAD_BOT = 28;

// Alignment tolerance: handles within this many mm are considered "aligned"
const ALIGN_TOLERANCE_MM = 1.0;

interface ItemHandle {
  id: string;
  /** Centre of the item in mm (y + height/2) */
  yMm: number;
}

interface Props {
  bedHeightMm: number;
  gridSpacingMm: number;
  frontItems: PlacedItem[];
  backItems: PlacedItem[];
}

export function SplitAlignmentRail({
  bedHeightMm,
  gridSpacingMm,
  frontItems,
  backItems,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [railH, setRailH] = useState(500);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setRailH(el.offsetHeight);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  const usableH = Math.max(1, railH - PAD_TOP - PAD_BOT);
  const scale = usableH / bedHeightMm; // px per mm

  function yToPx(mm: number): number {
    return PAD_TOP + Math.min(mm, bedHeightMm) * scale;
  }

  // Tick marks — minor every gridSpacing, major every 4× gridSpacing
  const ticks: { y: number; major: boolean }[] = [];
  const step = gridSpacingMm;
  for (let y = 0; y <= bedHeightMm + step * 0.01; y += step) {
    const clamped = Math.min(y, bedHeightMm);
    ticks.push({ y: clamped, major: y % (step * 4) === 0 || y === 0 || clamped === bedHeightMm });
  }

  // Item handles
  const frontHandles: ItemHandle[] = frontItems.map((it) => ({
    id: it.id,
    yMm: it.y + it.height / 2,
  }));
  const backHandles: ItemHandle[] = backItems.map((it) => ({
    id: it.id,
    yMm: it.y + it.height / 2,
  }));

  const cx = RAIL_W / 2;

  return (
    <div ref={containerRef} className={styles.rail}>
      <svg
        width={RAIL_W}
        height={railH}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* ── Center axis ── */}
        <line
          x1={cx} y1={PAD_TOP}
          x2={cx} y2={railH - PAD_BOT}
          stroke="#2a2a2a" strokeWidth={1}
        />

        {/* ── Tick marks ── */}
        {ticks.map(({ y, major }) => {
          const py = yToPx(y);
          const halfLen = major ? 6 : 3;
          return (
            <g key={y}>
              <line
                x1={cx - halfLen} y1={py}
                x2={cx + halfLen} y2={py}
                stroke={major ? "#3c3c3c" : "#272727"}
                strokeWidth={major ? 1 : 0.5}
              />
              {major && y > 0 && (
                <text
                  x={cx}
                  y={py - 2}
                  textAnchor="middle"
                  fill="#333"
                  fontSize={6.5}
                  fontFamily="monospace"
                >
                  {y}
                </text>
              )}
            </g>
          );
        })}

        {/* ── HOME marker (Y = 0, top of bed) ── */}
        <circle cx={cx} cy={PAD_TOP} r={5} fill="#131a14" stroke="#7ecfa8" strokeWidth={1.2} />
        <text
          x={cx} y={PAD_TOP - 9}
          textAnchor="middle"
          fill="#7ecfa8" fontSize={6.5} fontFamily="monospace"
          letterSpacing="0.05em"
        >
          HOME
        </text>

        {/* ── Alignment connectors (front & back at same Y) ── */}
        {frontHandles.map((fh) => {
          const aligned = backHandles.find(
            (bh) => Math.abs(bh.yMm - fh.yMm) < ALIGN_TOLERANCE_MM
          );
          if (!aligned) return null;
          const py = yToPx((fh.yMm + aligned.yMm) / 2);
          return (
            <line
              key={`conn-${fh.id}`}
              x1={4} y1={py}
              x2={RAIL_W - 4} y2={py}
              stroke="#4ea8c8"
              strokeWidth={1.2}
              strokeDasharray="3 2"
              opacity={0.75}
            />
          );
        })}

        {/* ── Front handles ◀ (pointing left toward front pane) ── */}
        {frontHandles.map((h) => {
          const py = yToPx(h.yMm);
          return (
            <g key={`f-${h.id}`}>
              <title>Front · {h.yMm.toFixed(1)} mm from home</title>
              {/* Triangle: base on center axis, apex pointing left */}
              <polygon
                points={`${cx - 1},${py - 5} ${cx - 1},${py + 5} ${5},${py}`}
                fill="#7ecfa8"
                opacity={0.85}
              />
              {/* Distance-from-home label — sits left of the axis */}
              <text
                x={cx - 3}
                y={py - 6}
                textAnchor="middle"
                fill="#7ecfa8"
                fontSize={6}
                fontFamily="monospace"
              >
                {h.yMm.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* ── Back handles ▶ (pointing right toward back pane) ── */}
        {backHandles.map((h) => {
          const py = yToPx(h.yMm);
          return (
            <g key={`b-${h.id}`}>
              <title>Back · {h.yMm.toFixed(1)} mm from home</title>
              {/* Triangle: base on center axis, apex pointing right */}
              <polygon
                points={`${cx + 1},${py - 5} ${cx + 1},${py + 5} ${RAIL_W - 5},${py}`}
                fill="#4ea8c8"
                opacity={0.85}
              />
              {/* Distance-from-home label — sits right of the axis */}
              <text
                x={cx + 3}
                y={py - 6}
                textAnchor="middle"
                fill="#4ea8c8"
                fontSize={6}
                fontFamily="monospace"
              >
                {h.yMm.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* ── Bottom of bed marker ── */}
        <circle
          cx={cx} cy={railH - PAD_BOT}
          r={3}
          fill="#131414" stroke="#3a3a3a" strokeWidth={1}
        />
      </svg>
    </div>
  );
}
