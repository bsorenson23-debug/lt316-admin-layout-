"use client";

import React from "react";
import type { EditableBodyOutline, EditableBodyOutlinePoint } from "@/types/productTemplate";
import type { BodyReferenceSvgQualityReport } from "@/lib/bodyReferenceSvgQuality";
import {
  buildBodyReferenceSvgQualityVisualizationFromOutline,
} from "@/lib/bodyReferenceSvgQuality";
import {
  buildOutlineGeometrySignature,
  canDeleteFineTunePoint,
  cloneOutline,
  deleteFineTunePoint,
  insertFineTunePointOnSegment,
  nudgeOutlinePoint,
  resolveOutlineBounds,
  updateOutlinePointPosition,
} from "@/lib/bodyReferenceFineTune";
import {
  buildContourSvgPath,
  sortEditableOutlinePoints,
} from "@/lib/editableBodyOutline";
import styles from "./BodyReferenceFineTuneEditor.module.css";

type OverlayToggleKey =
  | "sourceImage"
  | "detectedContour"
  | "approvedContour"
  | "draftContour"
  | "points"
  | "bodyBounds"
  | "bridgeGuides"
  | "qualityWarnings";

type Props = {
  outline: EditableBodyOutline | null;
  approvedOutline?: EditableBodyOutline | null;
  detectedOutline?: EditableBodyOutline | null;
  overallHeightMm?: number | null;
  interactive?: boolean;
  sourceImageUrl?: string | null;
  svgQualityReport?: BodyReferenceSvgQualityReport | null;
  canUndo?: boolean;
  onUndo?: () => void;
  onEditAction?: (outline: EditableBodyOutline) => void;
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

type ImagePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const OVERLAY_LABELS: Array<{ key: OverlayToggleKey; label: string }> = [
  { key: "sourceImage", label: "Source image" },
  { key: "detectedContour", label: "Detected contour" },
  { key: "approvedContour", label: "Approved contour" },
  { key: "draftContour", label: "Corrected draft contour" },
  { key: "points", label: "Contour points / handles" },
  { key: "bodyBounds", label: "Body bounds guides" },
  { key: "bridgeGuides", label: "Top / bottom bridge guides" },
  { key: "qualityWarnings", label: "SVG quality warnings" },
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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

function buildViewBox(args: {
  outline: EditableBodyOutline | null | undefined;
  approvedOutline: EditableBodyOutline | null | undefined;
  detectedOutline: EditableBodyOutline | null | undefined;
  sourceImagePlacement: ImagePlacement | null;
}): ViewBox {
  const points = [
    ...buildMirroredPoints(args.outline),
    ...buildMirroredPoints(args.approvedOutline),
    ...buildMirroredPoints(args.detectedOutline),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  if (args.sourceImagePlacement) {
    xs.push(args.sourceImagePlacement.x, args.sourceImagePlacement.x + args.sourceImagePlacement.width);
    ys.push(args.sourceImagePlacement.y, args.sourceImagePlacement.y + args.sourceImagePlacement.height);
  }

  if (xs.length === 0 || ys.length === 0) {
    return {
      minX: -60,
      minY: 0,
      width: 120,
      height: 220,
    };
  }

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

function buildSourceImagePlacement(outline: EditableBodyOutline | null | undefined): ImagePlacement | null {
  if (!outline?.sourceContourViewport || !outline.sourceContourBounds) {
    return null;
  }
  const outlineBounds = resolveOutlineBounds(outline);
  if (!outlineBounds) return null;

  const viewport = outline.sourceContourViewport;
  const contourBounds = outline.sourceContourBounds;
  const scaleX = outlineBounds.width / Math.max(1, contourBounds.width);
  const scaleY = outlineBounds.height / Math.max(1, contourBounds.height);

  return {
    x: round1(outlineBounds.minX - ((contourBounds.minX - viewport.minX) * scaleX)),
    y: round1(outlineBounds.minY - ((contourBounds.minY - viewport.minY) * scaleY)),
    width: round1(viewport.width * scaleX),
    height: round1(viewport.height * scaleY),
  };
}

function formatBounds(bounds: ReturnType<typeof resolveOutlineBounds>): string {
  if (!bounds) return "n/a";
  return `${bounds.width} x ${bounds.height} mm`;
}

function formatQualityStatus(status: BodyReferenceSvgQualityReport["status"] | undefined): string {
  if (status === "pass") return "SVG quality: pass";
  if (status === "warn") return "SVG quality: warn";
  if (status === "fail") return "SVG quality: fail";
  return "SVG quality unavailable";
}

export function BodyReferenceFineTuneEditor({
  outline,
  approvedOutline = null,
  detectedOutline = null,
  overallHeightMm = null,
  interactive = false,
  sourceImageUrl = null,
  svgQualityReport = null,
  canUndo = false,
  onUndo,
  onEditAction,
  onChange,
}: Props) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const recordedEditStartRef = React.useRef(false);
  const [selectedPointId, setSelectedPointId] = React.useState<string | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = React.useState<number | null>(null);
  const [draggingPointId, setDraggingPointId] = React.useState<string | null>(null);
  const [overlayState, setOverlayState] = React.useState<Record<OverlayToggleKey, boolean>>({
    sourceImage: true,
    detectedContour: true,
    approvedContour: true,
    draftContour: true,
    points: true,
    bodyBounds: true,
    bridgeGuides: true,
    qualityWarnings: true,
  });

  const sourceImagePlacement = React.useMemo(
    () => buildSourceImagePlacement(outline),
    [outline],
  );
  const viewBox = React.useMemo(
    () => buildViewBox({
      outline,
      approvedOutline,
      detectedOutline,
      sourceImagePlacement,
    }),
    [approvedOutline, detectedOutline, outline, sourceImagePlacement],
  );
  const approvedPath = React.useMemo(
    () => buildOutlinePath(approvedOutline),
    [approvedOutline],
  );
  const detectedPath = React.useMemo(
    () => buildOutlinePath(detectedOutline),
    [detectedOutline],
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
  const selectedSegment = React.useMemo(() => {
    if (selectedSegmentIndex == null || selectedSegmentIndex < 0 || selectedSegmentIndex >= sortedPoints.length - 1) {
      return null;
    }
    return {
      from: sortedPoints[selectedSegmentIndex]!,
      to: sortedPoints[selectedSegmentIndex + 1]!,
      index: selectedSegmentIndex,
    };
  }, [selectedSegmentIndex, sortedPoints]);
  const outlineBounds = React.useMemo(
    () => resolveOutlineBounds(outline),
    [outline],
  );
  const qualityVisualization = React.useMemo(
    () => buildBodyReferenceSvgQualityVisualizationFromOutline({ outline }),
    [outline],
  );
  const qualityMessages = React.useMemo(
    () => (
      svgQualityReport
        ? [
            ...svgQualityReport.errors.map((message) => ({ level: "error" as const, message })),
            ...svgQualityReport.warnings.map((message) => ({ level: "warn" as const, message })),
          ]
        : []
    ),
    [svgQualityReport],
  );

  React.useEffect(() => {
    if (!sourceImageUrl || !sourceImagePlacement) {
      setOverlayState((current) => (
        current.sourceImage
          ? { ...current, sourceImage: false }
          : current
      ));
    }
  }, [sourceImagePlacement, sourceImageUrl]);

  React.useEffect(() => {
    if (!detectedOutline) {
      setOverlayState((current) => (
        current.detectedContour
          ? { ...current, detectedContour: false }
          : current
      ));
    }
  }, [detectedOutline]);

  React.useEffect(() => {
    if (!sortedPoints.length) {
      setSelectedPointId(null);
      return;
    }
    if (!selectedPointId || !sortedPoints.some((point) => point.id === selectedPointId)) {
      setSelectedPointId(sortedPoints[0]?.id ?? null);
    }
  }, [selectedPointId, sortedPoints]);

  React.useEffect(() => {
    if (sortedPoints.length < 2) {
      setSelectedSegmentIndex(null);
      return;
    }
    if (
      selectedSegmentIndex == null ||
      selectedSegmentIndex < 0 ||
      selectedSegmentIndex >= sortedPoints.length - 1
    ) {
      setSelectedSegmentIndex(0);
    }
  }, [selectedSegmentIndex, sortedPoints]);

  const focusEditor = React.useCallback(() => {
    rootRef.current?.focus();
  }, []);

  const applyOutlineChange = React.useCallback((nextOutline: EditableBodyOutline | null) => {
    if (!outline || !nextOutline || !onChange) return;
    if (buildOutlineGeometrySignature(nextOutline) === buildOutlineGeometrySignature(outline)) {
      return;
    }
    onChange(nextOutline);
  }, [onChange, outline]);

  const recordEditStart = React.useCallback(() => {
    if (recordedEditStartRef.current || !outline || !onEditAction) return;
    const snapshot = cloneOutline(outline) ?? outline;
    onEditAction(snapshot);
    recordedEditStartRef.current = true;
  }, [onEditAction, outline]);

  const endEditGesture = React.useCallback(() => {
    recordedEditStartRef.current = false;
  }, []);

  React.useEffect(() => {
    if (!draggingPointId || !interactive) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      if (!svgRef.current) return;
      const nextPoint = getSvgPoint(svgRef.current, viewBox, event.clientX, event.clientY);
      if (!nextPoint) return;
      recordEditStart();
      const nextOutline = updateOutlinePointPosition({
        outline,
        pointId: draggingPointId,
        nextX: nextPoint.x,
        nextY: nextPoint.y,
        overallHeightMm,
      });
      applyOutlineChange(nextOutline);
    };

    const handlePointerUp = () => {
      setDraggingPointId(null);
      endEditGesture();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [applyOutlineChange, draggingPointId, endEditGesture, interactive, outline, overallHeightMm, recordEditStart, viewBox]);

  const handleDeleteSelectedPoint = React.useCallback(() => {
    if (!interactive || !selectedPointId || !outline) return;
    recordEditStart();
    const nextOutline = deleteFineTunePoint({
      outline,
      pointId: selectedPointId,
    });
    applyOutlineChange(nextOutline);
  }, [applyOutlineChange, interactive, outline, recordEditStart, selectedPointId]);

  const handleAddPointOnSegment = React.useCallback(() => {
    if (!interactive || selectedSegmentIndex == null || !outline) return;
    recordEditStart();
    const nextOutline = insertFineTunePointOnSegment({
      outline,
      segmentIndex: selectedSegmentIndex,
    });
    applyOutlineChange(nextOutline);
  }, [applyOutlineChange, interactive, outline, recordEditStart, selectedSegmentIndex]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !selectedPointId || !outline) return;

    const largeStep = event.shiftKey ? 5 : 1;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      let deltaX = 0;
      let deltaY = 0;
      if (event.key === "ArrowLeft") deltaX = -largeStep;
      if (event.key === "ArrowRight") deltaX = largeStep;
      if (event.key === "ArrowUp") deltaY = -largeStep;
      if (event.key === "ArrowDown") deltaY = largeStep;
      if (deltaX === 0 && deltaY === 0) return;

      recordEditStart();
      const nextOutline = nudgeOutlinePoint({
        outline,
        pointId: selectedPointId,
        deltaX,
        deltaY,
        overallHeightMm,
      });
      applyOutlineChange(nextOutline);
      endEditGesture();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      handleDeleteSelectedPoint();
    }
  }, [
    applyOutlineChange,
    endEditGesture,
    handleDeleteSelectedPoint,
    interactive,
    outline,
    overallHeightMm,
    recordEditStart,
    selectedPointId,
  ]);

  if (!outline) {
    return (
      <div className={styles.emptyState}>
        Accepted BODY REFERENCE cutout required before fine-tuning is available.
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={styles.editor}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={handleKeyDown}
      data-body-reference-fine-tune-editor="present"
    >
      <div className={styles.metaRow}>
        <span className={styles.metaLabel}>
          {interactive ? "Draft contour editor" : "Approved contour preview"}
        </span>
        {selectedPoint && (
          <span className={styles.metaValue}>
            Selected: {selectedPoint.role ?? "custom"} at {round1(selectedPoint.x)}mm x, {round1(selectedPoint.y)}mm y
          </span>
        )}
        {selectedSegment && (
          <span className={styles.metaValue}>
            Segment: {selectedSegment.from.role ?? "custom"} → {selectedSegment.to.role ?? "custom"}
          </span>
        )}
      </div>

      <div className={styles.toggleGrid}>
        {OVERLAY_LABELS.map((toggle) => {
          const disabled =
            (toggle.key === "sourceImage" && (!sourceImageUrl || !sourceImagePlacement)) ||
            (toggle.key === "detectedContour" && !detectedOutline);
          const active = !disabled && overlayState[toggle.key];
          return (
            <button
              key={toggle.key}
              type="button"
              className={active ? styles.toggleButtonActive : styles.toggleButton}
              disabled={disabled}
              onClick={() => {
                setOverlayState((current) => ({
                  ...current,
                  [toggle.key]: !current[toggle.key],
                }));
                focusEditor();
              }}
            >
              {toggle.label}
            </button>
          );
        })}
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => {
            onUndo?.();
            focusEditor();
          }}
          disabled={!interactive || !canUndo}
        >
          Undo last edit
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleAddPointOnSegment}
          disabled={!interactive || !selectedSegment}
        >
          Add point on selected segment
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleDeleteSelectedPoint}
          disabled={!interactive || !selectedPoint || !canDeleteFineTunePoint(outline)}
        >
          Delete selected point
        </button>
        <span className={styles.toolbarHint}>
          Arrow keys nudge the selected point by 1mm. Hold Shift for 5mm.
        </span>
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>Draft bounds</span>
          <span className={styles.statusValue}>{formatBounds(outlineBounds)}</span>
        </div>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>Point count</span>
          <span className={styles.statusValue}>{sortedPoints.length}</span>
        </div>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>SVG quality</span>
          <span className={styles.statusValue}>{formatQualityStatus(svgQualityReport?.status)}</span>
        </div>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>Bridge guides</span>
          <span className={styles.statusValue}>{qualityVisualization.expectedBridgeSegments.length}</span>
        </div>
      </div>

      {overlayState.qualityWarnings && qualityMessages.length > 0 && (
        <div className={styles.warningList}>
          {qualityMessages.map((warning) => (
            <div
              key={`${warning.level}:${warning.message}`}
              className={warning.level === "error" ? styles.warningItemError : styles.warningItem}
            >
              {warning.message}
            </div>
          ))}
        </div>
      )}

      <div className={styles.note}>
        Drag the right-side anchor points. The left side mirrors automatically. Draft edits stay non-authoritative until the corrected cutout is accepted.
      </div>

      <svg
        ref={svgRef}
        className={styles.canvas}
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label="BODY REFERENCE cutout fine-tune editor"
        onPointerDown={() => {
          focusEditor();
        }}
      >
        {overlayState.sourceImage && sourceImageUrl && sourceImagePlacement && (
          <image
            href={sourceImageUrl}
            x={sourceImagePlacement.x}
            y={sourceImagePlacement.y}
            width={sourceImagePlacement.width}
            height={sourceImagePlacement.height}
            preserveAspectRatio="none"
            className={styles.sourceImage}
          />
        )}

        {overlayState.bodyBounds && outlineBounds && (
          <>
            <rect
              x={outlineBounds.minX}
              y={outlineBounds.minY}
              width={outlineBounds.width}
              height={outlineBounds.height}
              className={styles.boundsGuide}
            />
            <line
              x1={outlineBounds.minX}
              y1={outlineBounds.minY}
              x2={outlineBounds.maxX}
              y2={outlineBounds.minY}
              className={styles.boundsGuideEdge}
            />
            <line
              x1={outlineBounds.minX}
              y1={outlineBounds.maxY}
              x2={outlineBounds.maxX}
              y2={outlineBounds.maxY}
              className={styles.boundsGuideEdge}
            />
          </>
        )}

        <line
          x1={0}
          y1={viewBox.minY}
          x2={0}
          y2={viewBox.minY + viewBox.height}
          className={styles.centerLine}
        />

        {overlayState.detectedContour && detectedPath && (
          <path d={detectedPath} className={styles.detectedPath} />
        )}
        {overlayState.approvedContour && approvedPath && interactive && (
          <path d={approvedPath} className={styles.approvedPath} />
        )}
        {overlayState.draftContour && draftPath && (
          <path d={draftPath} className={styles.draftPath} />
        )}

        {overlayState.bridgeGuides && qualityVisualization.expectedBridgeSegments.map((segment) => (
          <line
            key={`bridge:${segment.segmentIndex}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            className={styles.bridgeGuide}
          />
        ))}

        {overlayState.qualityWarnings && qualityVisualization.suspiciousJumpSegments.map((segment) => (
          <line
            key={`warning:${segment.segmentIndex}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            className={styles.warningSegment}
          />
        ))}

        {overlayState.points && sortedPoints.slice(0, -1).map((point, index) => {
          const nextPoint = sortedPoints[index + 1];
          if (!nextPoint) return null;
          const isSelected = selectedSegmentIndex === index;
          return (
            <line
              key={`segment:${point.id}:${nextPoint.id}`}
              x1={point.x}
              y1={point.y}
              x2={nextPoint.x}
              y2={nextPoint.y}
              className={isSelected ? styles.segmentSelected : styles.segmentGuide}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSelectedSegmentIndex(index);
                focusEditor();
              }}
            />
          );
        })}

        {overlayState.points && sortedPoints.map((point) => (
          <circle
            key={`mirror:${point.id}`}
            cx={-point.x}
            cy={point.y}
            r={1.8}
            className={styles.mirrorPoint}
          />
        ))}

        {overlayState.points && sortedPoints.map((point, index) => {
          const isSelected = point.id === selectedPointId;
          return (
            <circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={isSelected ? 3.4 : 2.6}
              className={isSelected ? styles.pointSelected : styles.point}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSelectedPointId(point.id);
                setSelectedSegmentIndex(Math.min(index, Math.max(0, sortedPoints.length - 2)));
                focusEditor();
                if (!interactive) return;
                setDraggingPointId(point.id);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
