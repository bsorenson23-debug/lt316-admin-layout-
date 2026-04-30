"use client";

import React from "react";
import type { EditableBodyOutline, EditableBodyOutlinePoint } from "@/types/productTemplate";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";
import type { BodyReferenceSvgQualityReport } from "@/lib/bodyReferenceSvgQuality";
import {
  buildBodyReferenceSvgQualityVisualizationFromOutline,
} from "@/lib/bodyReferenceSvgQuality";
import {
  buildBodyReferenceGuideCandidateReport,
  type BodyReferenceGuideCandidate,
} from "@/lib/bodyReferenceGuideCandidates";
import {
  buildOutlineGeometrySignature,
  canDeleteFineTunePoint,
  cloneOutline,
  deleteFineTunePoint,
  insertFineTunePointOnSegment,
  nudgeOutlinePoint,
  resolveOutlineBounds,
  resolvePrimaryBodyReferenceVisualContour,
  resolveUiOnlyRimReferenceGuide,
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
  debugMode?: boolean;
  sourceImageUrl?: string | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
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

function buildPrimaryVisualPath(
  visualContour: ReturnType<typeof resolvePrimaryBodyReferenceVisualContour>,
): string | null {
  if (!visualContour || visualContour.points.length < 3) return null;
  return buildContourSvgPath(visualContour.points);
}

function buildPrimaryVisualPoints(outline: EditableBodyOutline | null | undefined): DisplayPoint[] {
  const visualContour = resolvePrimaryBodyReferenceVisualContour(outline);
  if (!visualContour) return [];
  return visualContour.points.map((point, index) => ({
    id: `visual:${index}`,
    x: point.x,
    y: point.y,
  }));
}

function buildViewBox(args: {
  outline: EditableBodyOutline | null | undefined;
  approvedOutline: EditableBodyOutline | null | undefined;
  detectedOutline: EditableBodyOutline | null | undefined;
  sourceImagePlacement: ImagePlacement | null;
  uiOnlyRimReferenceGuideY?: number | null;
}): ViewBox {
  const points = [
    ...buildMirroredPoints(args.outline),
    ...buildMirroredPoints(args.approvedOutline),
    ...buildMirroredPoints(args.detectedOutline),
    ...buildPrimaryVisualPoints(args.outline),
    ...buildPrimaryVisualPoints(args.approvedOutline),
    ...buildPrimaryVisualPoints(args.detectedOutline),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  if (args.sourceImagePlacement) {
    xs.push(args.sourceImagePlacement.x, args.sourceImagePlacement.x + args.sourceImagePlacement.width);
    ys.push(args.sourceImagePlacement.y, args.sourceImagePlacement.y + args.sourceImagePlacement.height);
  }
  if (typeof args.uiOnlyRimReferenceGuideY === "number" && Number.isFinite(args.uiOnlyRimReferenceGuideY)) {
    ys.push(args.uiOnlyRimReferenceGuideY);
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
  return `${bounds.width} x ${bounds.height} contour units`;
}

function formatQualityStatus(status: BodyReferenceSvgQualityReport["status"] | undefined): string {
  if (status === "pass") return "SVG quality: pass";
  if (status === "warn") return "SVG quality: warn";
  if (status === "fail") return "SVG quality: fail";
  return "SVG quality unavailable";
}

function formatGuideStatus(status: string): string {
  if (status === "pass") return "Guides ready";
  if (status === "warn") return "Guides need review";
  if (status === "fail") return "Guides unavailable";
  return "Guide readiness unknown";
}

function getGuideCandidateTestId(candidate: BodyReferenceGuideCandidate): string {
  if (candidate.kind === "top-bridge") return "body-reference-guide-top-bridge";
  if (candidate.kind === "bottom-bridge") return "body-reference-guide-bottom-bridge";
  if (candidate.kind === "centerline") return "body-reference-guide-centerline";
  if (candidate.kind === "outline") return "body-reference-guide-outline";
  return "body-reference-guide-body-bounds";
}

function getGuideCandidateClassName(candidate: BodyReferenceGuideCandidate): string {
  if (candidate.kind === "top-bridge") return styles.guideTopBridge;
  if (candidate.kind === "bottom-bridge") return styles.guideBottomBridge;
  if (candidate.kind === "centerline") return styles.guideCenterline;
  if (candidate.kind === "outline") return styles.guideOutline;
  return styles.guideBounds;
}

function renderGuideCandidate(candidate: BodyReferenceGuideCandidate) {
  if (candidate.points.length < 2) return null;
  const testId = getGuideCandidateTestId(candidate);
  const className = getGuideCandidateClassName(candidate);
  const [start, end] = candidate.points;
  if (!start || !end) return null;
  if (candidate.kind === "outline" && candidate.points.length > 2) {
    return (
      <polyline
        key={candidate.id}
        points={candidate.points.map((point) => `${point.x},${point.y}`).join(" ")}
        className={className}
        data-testid={testId}
        data-guide-id={candidate.id}
        data-coordinate-space={candidate.coordinateSpace}
      />
    );
  }
  return (
    <line
      key={candidate.id}
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      className={className}
      data-testid={testId}
      data-guide-id={candidate.id}
      data-coordinate-space={candidate.coordinateSpace}
    />
  );
}

export function BodyReferenceFineTuneEditor({
  outline,
  approvedOutline = null,
  detectedOutline = null,
  overallHeightMm = null,
  interactive = false,
  debugMode = false,
  sourceImageUrl = null,
  fitDebug = null,
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
  const [guideOverlayVisible, setGuideOverlayVisible] = React.useState(() => debugMode);

  React.useEffect(() => {
    if (debugMode) {
      setGuideOverlayVisible(true);
    }
  }, [debugMode]);

  const sourceImagePlacement = React.useMemo(
    () => buildSourceImagePlacement(outline),
    [outline],
  );
  const uiOnlyRimReferenceGuide = React.useMemo(
    () => resolveUiOnlyRimReferenceGuide({
      outline,
      fitDebug,
    }),
    [fitDebug, outline],
  );
  const viewBox = React.useMemo(
    () => buildViewBox({
      outline,
      approvedOutline,
      detectedOutline,
      sourceImagePlacement,
      uiOnlyRimReferenceGuideY: uiOnlyRimReferenceGuide?.y ?? null,
    }),
    [approvedOutline, detectedOutline, outline, sourceImagePlacement, uiOnlyRimReferenceGuide?.y],
  );
  const approvedVisualContour = React.useMemo(
    () => resolvePrimaryBodyReferenceVisualContour(approvedOutline),
    [approvedOutline],
  );
  const detectedVisualContour = React.useMemo(
    () => resolvePrimaryBodyReferenceVisualContour(detectedOutline),
    [detectedOutline],
  );
  const approvedPath = React.useMemo(
    () => buildPrimaryVisualPath(approvedVisualContour),
    [approvedVisualContour],
  );
  const detectedPath = React.useMemo(
    () => buildPrimaryVisualPath(detectedVisualContour),
    [detectedVisualContour],
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
  const guideCandidateReport = React.useMemo(
    () => buildBodyReferenceGuideCandidateReport({
      outline,
      svgQualityReport,
    }),
    [outline, svgQualityReport],
  );
  const bridgeGuideCandidateCount = React.useMemo(
    () => guideCandidateReport.candidates.filter((candidate) => (
      candidate.kind === "top-bridge" || candidate.kind === "bottom-bridge"
    )).length,
    [guideCandidateReport.candidates],
  );
  const showUiOnlyGuides = guideOverlayVisible;
  const showSourceImage = overlayState.sourceImage && Boolean(sourceImageUrl && sourceImagePlacement);
  const showBodyBounds = showUiOnlyGuides && overlayState.bodyBounds && Boolean(outlineBounds);
  const showRimReferenceGuide = showUiOnlyGuides && Boolean(uiOnlyRimReferenceGuide && outlineBounds);
  const showGuideCandidateOverlay = showUiOnlyGuides && guideCandidateReport.candidates.length > 0;
  const showDetectedContour = showUiOnlyGuides && overlayState.detectedContour && Boolean(detectedPath);
  const showDraftContour = showUiOnlyGuides && overlayState.draftContour && Boolean(draftPath);
  const showBridgeGuides = showUiOnlyGuides && overlayState.bridgeGuides;
  const showQualityWarnings = showUiOnlyGuides && overlayState.qualityWarnings;
  const showEditablePoints = interactive && overlayState.points;

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
          <span className={styles.statusLabel}>Primary outline</span>
          <span
            className={styles.statusValue}
            data-testid="body-reference-primary-outline-source"
          >
            {approvedVisualContour?.source ?? "unavailable"}
          </span>
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

      <div
        className={styles.guidesPanel}
        data-testid="body-reference-guides-panel"
        data-guide-status={guideCandidateReport.status}
        data-coordinate-space={guideCandidateReport.coordinateSpace}
      >
        <div className={styles.guidesHeader}>
          <div>
            <div className={styles.guidesEyebrow}>Outline guides</div>
            <div className={styles.guidesTitle}>
              UI-only guide overlay
            </div>
          </div>
          <span className={styles.guidesBadge}>
            {formatGuideStatus(guideCandidateReport.status)}
          </span>
        </div>
        <div className={styles.guidesSummary}>
          <span>Coordinate space: {guideCandidateReport.coordinateSpace}</span>
          <span>Bridge candidates: {bridgeGuideCandidateCount}/2</span>
          <span>Expected bridge segments: {guideCandidateReport.expectedBridgeSegmentCount}</span>
          <span>Suspicious jumps: {guideCandidateReport.suspiciousJumpCount}</span>
        </div>
        <div className={styles.guidesActions}>
          <button
            type="button"
            className={guideOverlayVisible ? styles.toggleButtonActive : styles.toggleButton}
            data-testid="body-reference-guides-toggle"
            disabled={guideCandidateReport.candidates.length === 0}
            onClick={() => {
              setGuideOverlayVisible((current) => !current);
              focusEditor();
            }}
          >
            {guideOverlayVisible ? "Hide UI-only guides" : "Show UI-only guides"}
          </button>
          <span
            className={styles.guidesNote}
            data-testid="body-reference-guides-ui-only-note"
          >
            UI-only guides are hidden by default. They help debug bridge segments and symmetry, but they are not exported, not saved as the approved cutout, and not used for BODY CUTOUT QA GLB generation.
          </span>
        </div>
        <div
          className={styles.guidesNote}
          data-testid="body-reference-guides-source-hash-note"
        >
          Approved SVG cutout is the primary BODY CUTOUT QA outline. Guide rendering is read-only and excluded from source hash, GLB input, WRAP / EXPORT, and v2 authority.
        </div>
        {(guideCandidateReport.warnings.length > 0 || guideCandidateReport.errors.length > 0) && (
          <div className={styles.guidesMessages}>
            {[...guideCandidateReport.errors, ...guideCandidateReport.warnings].map((message) => (
              <div key={message} className={styles.guidesMessage}>
                {message}
              </div>
            ))}
          </div>
        )}
      </div>

      {showQualityWarnings && qualityMessages.length > 0 && (
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
        {showSourceImage && sourceImageUrl && sourceImagePlacement && (
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

        {showBodyBounds && outlineBounds && (
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
              data-testid="body-reference-body-contour-top-edge"
              data-guide-source="approved-body-contour"
              data-guide-authority="body-cutout"
              data-excluded-from-body-cutout="false"
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

        {showUiOnlyGuides && (
          <line
            x1={0}
            y1={viewBox.minY}
            x2={0}
            y2={viewBox.minY + viewBox.height}
            className={styles.centerLine}
          />
        )}

        {showRimReferenceGuide && uiOnlyRimReferenceGuide && outlineBounds && (
          <line
            x1={outlineBounds.minX}
            y1={uiOnlyRimReferenceGuide.y}
            x2={outlineBounds.maxX}
            y2={uiOnlyRimReferenceGuide.y}
            className={styles.rimReferenceGuide}
            data-testid="body-reference-rim-reference-guide"
            data-guide-source={uiOnlyRimReferenceGuide.source}
            data-guide-authority={uiOnlyRimReferenceGuide.authority}
            data-excluded-from-body-cutout={String(uiOnlyRimReferenceGuide.excludedFromBodyCutout)}
            data-affects-source-hash={String(uiOnlyRimReferenceGuide.affectsSourceHash)}
            data-affects-glb-input={String(uiOnlyRimReferenceGuide.affectsGlbInput)}
            data-affects-wrap-export={String(uiOnlyRimReferenceGuide.affectsWrapExport)}
            data-affects-v2-authority={String(uiOnlyRimReferenceGuide.affectsV2Authority)}
            data-source-field={uiOnlyRimReferenceGuide.sourceField}
            data-coordinate-space={uiOnlyRimReferenceGuide.coordinateSpace}
          />
        )}

        {showGuideCandidateOverlay && (
          <g
            className={styles.guideOverlay}
            data-testid="body-reference-guide-overlay"
            data-guide-status={guideCandidateReport.status}
          >
            {guideCandidateReport.candidates.map(renderGuideCandidate)}
          </g>
        )}

        {showDetectedContour && detectedPath && (
          <path d={detectedPath} className={styles.detectedPath} />
        )}
        {showDraftContour && draftPath && (
          <path
            d={draftPath}
            className={styles.draftPath}
            data-testid="body-reference-secondary-control-outline"
          />
        )}

        {showBridgeGuides && qualityVisualization.expectedBridgeSegments.map((segment) => (
          <line
            key={`bridge:${segment.segmentIndex}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            className={styles.bridgeGuide}
          />
        ))}

        {showQualityWarnings && qualityVisualization.suspiciousJumpSegments.map((segment) => (
          <line
            key={`warning:${segment.segmentIndex}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            className={styles.warningSegment}
          />
        ))}

        {overlayState.approvedContour && approvedPath && (
          <path
            d={approvedPath}
            className={styles.approvedPath}
            data-testid="body-reference-approved-primary-outline"
            data-outline-source={approvedVisualContour?.source ?? "unknown"}
            data-top-guide-y={approvedVisualContour?.topGuideY ?? ""}
          />
        )}

        {showEditablePoints && sortedPoints.slice(0, -1).map((point, index) => {
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

        {showEditablePoints && sortedPoints.map((point) => (
          <circle
            key={`mirror:${point.id}`}
            cx={-point.x}
            cy={point.y}
            r={1.8}
            className={styles.mirrorPoint}
          />
        ))}

        {showEditablePoints && sortedPoints.map((point, index) => {
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
