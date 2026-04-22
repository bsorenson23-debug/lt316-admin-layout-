"use client";

import React from "react";
import type { EditableBodyOutline, EditableBodyOutlinePoint } from "@/types/productTemplate";
import {
  buildContourSvgPath,
  rebuildEditableBodyOutline,
  sortEditableOutlinePoints,
} from "@/lib/editableBodyOutline";
import styles from "./BodyReferenceFineTuneEditor.module.css";

type Props = {
  outline: EditableBodyOutline | null;
  approvedOutline?: EditableBodyOutline | null;
  overallHeightMm?: number | null;
  interactive?: boolean;
  onChange?: (outline: EditableBodyOutline) => void;
};

type DisplayPoint = {
  id: string;
  x: number;
  y: number;
  role?: EditableBodyOutlinePoint["role"];
};

type ViewBox = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildMirroredPoints(outline: EditableBodyOutline | null | undefined): DisplayPoint[] {
  if (!outline) return [];
  const sorted = sortEditableOutlinePoints(outline.points);
  return [
    ...sorted.map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      role: point.role,
    })),
    ...[...sorted].reverse().map((point) => ({
      id: `mirror:${point.id}`,
      x: -point.x,
      y: point.y,
      role: point.role,
    })),
  ];
}

function buildOutlinePath(outline: EditableBodyOutline | null | undefined): string | null {
  const points = buildMirroredPoints(outline);
  if (points.length < 4) return null;
  return buildContourSvgPath(points.map((point) => ({ x: point.x, y: point.y })));
}

function buildViewBox(outline: EditableBodyOutline | null | undefined, approvedOutline: EditableBodyOutline | null | undefined): ViewBox {
  const points = [
    ...buildMirroredPoints(outline),
    ...buildMirroredPoints(approvedOutline),
  ];
  if (points.length === 0) {
    return {
      minX: -60,
      minY: 0,
      width: 120,
      height: 220,
    };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max(10, (maxX - minX) * 0.2);
  const padY = Math.max(10, (maxY - minY) * 0.12);
  return {
    minX: round1(minX - padX),
    minY: round1(Math.max(0, minY - padY)),
    width: round1(Math.max(80, (maxX - minX) + (padX * 2))),
    height: round1(Math.max(120, (maxY - Math.max(0, minY - padY)) + padY)),
  };
}

function getSvgPoint(svg: SVGSVGElement, viewBox: ViewBox, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: viewBox.minX + (((clientX - rect.left) / rect.width) * viewBox.width),
    y: viewBox.minY + (((clientY - rect.top) / rect.height) * viewBox.height),
  };
}

export function BodyReferenceFineTuneEditor({
  outline,
  approvedOutline = null,
  overallHeightMm = null,
  interactive = false,
  onChange,
}: Props) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [selectedPointId, setSelectedPointId] = React.useState<string | null>(null);
  const [draggingPointId, setDraggingPointId] = React.useState<string | null>(null);

  const viewBox = React.useMemo(
    () => buildViewBox(outline, approvedOutline),
    [approvedOutline, outline],
  );
  const approvedPath = React.useMemo(
    () => buildOutlinePath(approvedOutline),
    [approvedOutline],
  );
  const draftPath = React.useMemo(
    () => buildOutlinePath(outline),
    [outline],
  );
  const sortedPoints = React.useMemo(
    () => sortEditableOutlinePoints(outline?.points ?? []),
    [outline],
  );
  const selectedPoint = React.useMemo(
    () => sortedPoints.find((point) => point.id === selectedPointId) ?? null,
    [selectedPointId, sortedPoints],
  );

  React.useEffect(() => {
    if (!sortedPoints.length) {
      setSelectedPointId(null);
      return;
    }
    if (!selectedPointId || !sortedPoints.some((point) => point.id === selectedPointId)) {
      setSelectedPointId(sortedPoints[0]?.id ?? null);
    }
  }, [selectedPointId, sortedPoints]);

  const updatePoint = React.useCallback((pointId: string, nextX: number, nextY: number) => {
    if (!outline || !onChange) return;
    const ordered = sortEditableOutlinePoints(outline.points);
    const index = ordered.findIndex((point) => point.id === pointId);
    if (index < 0) return;
    const previousPoint = ordered[index - 1] ?? null;
    const nextPoint = ordered[index + 1] ?? null;
    const minY = previousPoint ? previousPoint.y + 1 : 0;
    const maxY = nextPoint
      ? nextPoint.y - 1
      : (typeof overallHeightMm === "number" && Number.isFinite(overallHeightMm) && overallHeightMm > minY
        ? overallHeightMm
        : Math.max(minY, ordered[index]?.y ?? minY));

    const nextOutline = rebuildEditableBodyOutline({
      ...outline,
      points: outline.points.map((point) => {
        if (point.id !== pointId) return point;
        return {
          ...point,
          x: round1(Math.max(0.5, nextX)),
          y: round1(clamp(nextY, minY, maxY)),
        };
      }),
    });
    onChange(nextOutline);
  }, [onChange, outline, overallHeightMm]);

  React.useEffect(() => {
    if (!draggingPointId || !interactive) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      if (!svgRef.current) return;
      const nextPoint = getSvgPoint(svgRef.current, viewBox, event.clientX, event.clientY);
      if (!nextPoint) return;
      updatePoint(draggingPointId, nextPoint.x, nextPoint.y);
    };

    const handlePointerUp = () => {
      setDraggingPointId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingPointId, interactive, updatePoint, viewBox]);

  if (!outline) {
    return (
      <div className={styles.emptyState}>
        Accepted BODY REFERENCE cutout required before fine-tuning is available.
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.metaRow}>
        <span className={styles.metaLabel}>
          {interactive ? "Draft contour" : "Approved contour"}
        </span>
        {selectedPoint && (
          <span className={styles.metaValue}>
            Selected: {selectedPoint.role ?? "custom"} at {round1(selectedPoint.x)}mm x, {round1(selectedPoint.y)}mm y
          </span>
        )}
      </div>
      <div className={styles.note}>
        Drag the right-side anchor points. The left side mirrors automatically.
      </div>
      <svg
        ref={svgRef}
        className={styles.canvas}
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label="BODY REFERENCE cutout fine-tune editor"
      >
        <line
          x1={0}
          y1={viewBox.minY}
          x2={0}
          y2={viewBox.minY + viewBox.height}
          className={styles.centerLine}
        />
        {approvedPath && interactive && (
          <path d={approvedPath} className={styles.approvedPath} />
        )}
        {draftPath && (
          <path d={draftPath} className={styles.draftPath} />
        )}
        {sortedPoints.map((point) => (
          <circle
            key={`mirror:${point.id}`}
            cx={-point.x}
            cy={point.y}
            r={1.8}
            className={styles.mirrorPoint}
          />
        ))}
        {sortedPoints.map((point) => {
          const isSelected = point.id === selectedPointId;
          return (
            <circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={isSelected ? 3.1 : 2.5}
              className={isSelected ? styles.pointSelected : styles.point}
              onPointerDown={(event) => {
                setSelectedPointId(point.id);
                if (!interactive) return;
                event.preventDefault();
                setDraggingPointId(point.id);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
