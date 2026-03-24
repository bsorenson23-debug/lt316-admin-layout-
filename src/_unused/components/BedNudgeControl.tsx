"use client";

import React from "react";

const BUTTON_SIZE = 20;
const BUTTON_GAP = 4;
const PANEL_PADDING = 6;
export const BED_NUDGE_PANEL_SIZE_PX = PANEL_PADDING * 2 + BUTTON_SIZE * 3 + BUTTON_GAP * 2;

interface Props {
  x: number;
  y: number;
  stepMm: number;
  onNudge: (dxMm: number, dyMm: number) => void;
}

type ButtonDef = {
  key: "up" | "down" | "left" | "right";
  col: number;
  row: number;
  label: string;
  dx: number;
  dy: number;
};

const BUTTONS: ButtonDef[] = [
  { key: "up", col: 1, row: 0, label: "^", dx: 0, dy: -1 },
  { key: "left", col: 0, row: 1, label: "<", dx: -1, dy: 0 },
  { key: "right", col: 2, row: 1, label: ">", dx: 1, dy: 0 },
  { key: "down", col: 1, row: 2, label: "v", dx: 0, dy: 1 },
];

export function BedNudgeControl({ x, y, stepMm, onNudge }: Props) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <rect
        x={0}
        y={0}
        width={BED_NUDGE_PANEL_SIZE_PX}
        height={BED_NUDGE_PANEL_SIZE_PX}
        rx={7}
        fill="#1a2027"
        fillOpacity={0.88}
        stroke="#2f3d4a"
        strokeWidth={1}
      />

      {BUTTONS.map((button) => {
        const bx = PANEL_PADDING + button.col * (BUTTON_SIZE + BUTTON_GAP);
        const by = PANEL_PADDING + button.row * (BUTTON_SIZE + BUTTON_GAP);
        return (
          <g key={button.key} transform={`translate(${bx}, ${by})`}>
            <rect
              x={0}
              y={0}
              width={BUTTON_SIZE}
              height={BUTTON_SIZE}
              rx={4}
              fill="#2a3440"
              stroke="#435464"
              strokeWidth={0.9}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onNudge(button.dx * stepMm, button.dy * stepMm);
              }}
            />
            <text
              x={BUTTON_SIZE / 2}
              y={BUTTON_SIZE / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#d6dee5"
              fontSize={11}
              fontWeight={700}
              fontFamily="monospace"
              pointerEvents="none"
            >
              {button.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
