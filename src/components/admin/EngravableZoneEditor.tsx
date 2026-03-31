"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import styles from "./EngravableZoneEditor.module.css";

interface Props {
  /** BG-removed product photo data URL */
  photoDataUrl: string;
  /** Total product height in mm */
  overallHeightMm: number;
  /** Current top margin in mm */
  topMarginMm: number;
  /** Current bottom margin in mm */
  bottomMarginMm: number;
  /** Outside diameter in mm (shown in readout) */
  diameterMm: number;
  /** Saved editor scale for the reference photo (percent) */
  photoScalePct: number;
  /** Saved editor vertical nudge for the reference photo (percent of editor height) */
  photoOffsetYPct: number;
  /** Saved editor horizontal nudge for the reference photo (percent of editor width) */
  photoOffsetXPct: number;
  /** Saved editor vertical anchor for the reference photo */
  photoAnchorY: "center" | "bottom";
  /** Saved editor horizontal centering mode for the reference photo */
  photoCenterMode: "body" | "photo";
  /** Current sampled / saved body color */
  bodyColorHex: string;
  /** Current sampled / saved rim / engrave color */
  rimColorHex: string;
  onChange: (topMarginMm: number, bottomMarginMm: number) => void;
  onPhotoScaleChange: (scalePct: number) => void;
  onPhotoOffsetYChange: (offsetPct: number) => void;
  onPhotoOffsetXChange: (offsetPct: number) => void;
  onPhotoAnchorYChange: (anchor: "center" | "bottom") => void;
  onPhotoCenterModeChange: (mode: "body" | "photo") => void;
  onColorsChange: (bodyColorHex: string, rimColorHex: string) => void;
}

/** Display height for the editor canvas in px */
const CANVAS_HEIGHT = 320;
/** Minimum margin in mm */
const MIN_MARGIN_MM = 0;
/** How much of the editor height the visible tumbler should occupy */
const VISIBLE_TUMBLER_HEIGHT_PCT = 0.98;
const MIN_PHOTO_SCALE_PCT = 60;
const MAX_PHOTO_SCALE_PCT = 180;
const MAX_PHOTO_OFFSET_Y_PCT = 25;
const MAX_PHOTO_OFFSET_X_PCT = 25;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sampleRegionColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  mode: "average" | "bright" = "average",
): string | null {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.floor(width));
  const sh = Math.max(1, Math.floor(height));
  const imageData = ctx.getImageData(sx, sy, sw, sh).data;
  const samples: Array<{ r: number; g: number; b: number; l: number }> = [];

  for (let i = 0; i < imageData.length; i += 4) {
    const alpha = imageData[i + 3];
    if (alpha <= 20) continue;
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    samples.push({ r, g, b, l });
  }

  if (samples.length === 0) return null;

  const activeSamples =
    mode === "bright"
      ? [...samples]
          .sort((a, b) => b.l - a.l)
          .slice(0, Math.max(8, Math.ceil(samples.length * 0.35)))
      : samples;

  const total = activeSamples.reduce(
    (acc, sample) => {
      acc.r += sample.r;
      acc.g += sample.g;
      acc.b += sample.b;
      return acc;
    },
    { r: 0, g: 0, b: 0 },
  );

  return rgbToHex(total.r / activeSamples.length, total.g / activeSamples.length, total.b / activeSamples.length);
}

function cropVisibleBounds(img: HTMLImageElement): {
  dataUrl: string;
  width: number;
  height: number;
  bodyCenterX: number;
} {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) {
    return {
      dataUrl: img.src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
    };
  }

  srcCtx.drawImage(img, 0, 0);
  const { data, width, height } = srcCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      dataUrl: img.src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
    };
  }

  const cropX = Math.max(0, minX - 2);
  const cropY = Math.max(0, minY - 2);
  const cropW = Math.min(width - cropX, maxX - minX + 5);
  const cropH = Math.min(height - cropY, maxY - minY + 5);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) {
    return {
      dataUrl: img.src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
    };
  }

  cropCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  const croppedImage = cropCtx.getImageData(0, 0, cropW, cropH);
  const sampleStartY = Math.floor(cropH * 0.1);
  const sampleEndY = Math.ceil(cropH * 0.62);
  const bodyCenters: number[] = [];

  for (let y = sampleStartY; y < sampleEndY; y += 1) {
    let runStart = -1;
    let bestStart = -1;
    let bestEnd = -1;

    for (let x = 0; x < cropW; x += 1) {
      const alpha = croppedImage.data[(y * cropW + x) * 4 + 3];
      if (alpha > 8) {
        if (runStart === -1) runStart = x;
      } else if (runStart !== -1) {
        if (bestStart === -1 || x - runStart > bestEnd - bestStart) {
          bestStart = runStart;
          bestEnd = x;
        }
        runStart = -1;
      }
    }

    if (runStart !== -1 && (bestStart === -1 || cropW - runStart > bestEnd - bestStart)) {
      bestStart = runStart;
      bestEnd = cropW;
    }

    if (bestStart !== -1 && bestEnd - bestStart > cropW * 0.14) {
      bodyCenters.push((bestStart + bestEnd) / 2);
    }
  }

  const sortedBodyCenters = [...bodyCenters].sort((a, b) => a - b);
  const bodyCenterX = sortedBodyCenters.length > 0
    ? sortedBodyCenters[Math.floor(sortedBodyCenters.length / 2)]
    : cropW / 2;

  return {
    dataUrl: cropCanvas.toDataURL("image/png"),
    width: cropW,
    height: cropH,
    bodyCenterX,
  };
}

export function EngravableZoneEditor({
  photoDataUrl,
  overallHeightMm,
  topMarginMm,
  bottomMarginMm,
  diameterMm,
  photoScalePct,
  photoOffsetYPct,
  photoOffsetXPct,
  photoAnchorY,
  photoCenterMode,
  bodyColorHex,
  rimColorHex,
  onChange,
  onPhotoScaleChange,
  onPhotoOffsetYChange,
  onPhotoOffsetXChange,
  onPhotoAnchorYChange,
  onPhotoCenterModeChange,
  onColorsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"top" | "bottom" | null>(null);
  const [displayPhoto, setDisplayPhoto] = useState<{
    src: string;
    w: number;
    h: number;
    bodyCenterX: number;
  } | null>(null);
  const activeDisplayPhoto = photoDataUrl ? displayPhoto : null;

  useEffect(() => {
    if (!photoDataUrl) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const cropped = cropVisibleBounds(img);
      if (!cancelled) {
        setDisplayPhoto({
          src: cropped.dataUrl,
          w: cropped.width,
          h: cropped.height,
          bodyCenterX: cropped.bodyCenterX,
        });
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setDisplayPhoto(null);
      }
    };
    img.src = photoDataUrl;

    return () => {
      cancelled = true;
    };
  }, [photoDataUrl]);

  // Pixels per mm for this display
  const pxPerMm = CANVAS_HEIGHT / overallHeightMm;
  const topPx = topMarginMm * pxPerMm;
  const bottomPx = bottomMarginMm * pxPerMm;
  const engravableHeightMm = round1(overallHeightMm - topMarginMm - bottomMarginMm);
  const bodyWidthPx = Math.max(40, round1(diameterMm * pxPerMm));
  const clampedPhotoScalePct = Math.max(MIN_PHOTO_SCALE_PCT, Math.min(photoScalePct || 100, MAX_PHOTO_SCALE_PCT));
  const clampedPhotoOffsetYPct = Math.max(-MAX_PHOTO_OFFSET_Y_PCT, Math.min(photoOffsetYPct || 0, MAX_PHOTO_OFFSET_Y_PCT));
  const clampedPhotoOffsetXPct = Math.max(-MAX_PHOTO_OFFSET_X_PCT, Math.min(photoOffsetXPct || 0, MAX_PHOTO_OFFSET_X_PCT));
  const basePhotoHeightPx = CANVAS_HEIGHT * VISIBLE_TUMBLER_HEIGHT_PCT;
  const maxPhotoHeightPx = basePhotoHeightPx * (MAX_PHOTO_SCALE_PCT / 100);
  const targetPhotoHeightPx = basePhotoHeightPx * (clampedPhotoScalePct / 100);

  // Compute photo display width from cropped visible aspect ratio
  const photoWidthPx = activeDisplayPhoto
    ? (activeDisplayPhoto.w / activeDisplayPhoto.h) * targetPhotoHeightPx
    : CANVAS_HEIGHT * 0.52;
  const maxPhotoWidthPx = activeDisplayPhoto
    ? (activeDisplayPhoto.w / activeDisplayPhoto.h) * maxPhotoHeightPx
    : CANVAS_HEIGHT * 0.52 * (MAX_PHOTO_SCALE_PCT / 100);
  const scaledBodyCenterX = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyCenterX / activeDisplayPhoto.h) * targetPhotoHeightPx
    : photoWidthPx / 2;
  const maxScaledBodyCenterX = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyCenterX / activeDisplayPhoto.h) * maxPhotoHeightPx
    : maxPhotoWidthPx / 2;
  const scaledPhotoCenterX = photoWidthPx / 2;
  const sideSpanPx = Math.max(maxScaledBodyCenterX, maxPhotoWidthPx - maxScaledBodyCenterX);
  const containerWidthPx = Math.max(Math.ceil(sideSpanPx * 2 + 32), bodyWidthPx + 96);
  const centeringAnchorX = photoCenterMode === "photo" ? scaledPhotoCenterX : scaledBodyCenterX;
  const photoLeftPx = Math.round(
    containerWidthPx / 2
    - centeringAnchorX
    + (clampedPhotoOffsetXPct / 100) * containerWidthPx,
  );
  const basePhotoTopPx = photoAnchorY === "bottom"
    ? CANVAS_HEIGHT - targetPhotoHeightPx
    : (CANVAS_HEIGHT - targetPhotoHeightPx) / 2;
  const photoTopPx = Math.round(basePhotoTopPx + (clampedPhotoOffsetYPct / 100) * CANVAS_HEIGHT);
  const bodyLeftPx = Math.round((containerWidthPx - bodyWidthPx) / 2);

  const handlePointerDown = useCallback(
    (line: "top" | "bottom") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(line);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const yInContainer = e.clientY - rect.top;
      const mm = yInContainer / pxPerMm;

      if (dragging === "top") {
        const clamped = Math.max(MIN_MARGIN_MM, Math.min(mm, overallHeightMm - bottomMarginMm - 10));
        onChange(round1(clamped), bottomMarginMm);
      } else {
        const fromBottom = overallHeightMm - mm;
        const clamped = Math.max(MIN_MARGIN_MM, Math.min(fromBottom, overallHeightMm - topMarginMm - 10));
        onChange(topMarginMm, round1(clamped));
      }
    },
    [dragging, pxPerMm, overallHeightMm, topMarginMm, bottomMarginMm, onChange],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Release drag on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDragging(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const engravableTopPx = topPx;
  const engravableBottomPx = CANVAS_HEIGHT - bottomPx;
  const engravableZoneHeightPx = engravableBottomPx - engravableTopPx;

  useEffect(() => {
    if (!activeDisplayPhoto) return;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(containerWidthPx));
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, photoLeftPx, photoTopPx, photoWidthPx, targetPhotoHeightPx);

      const bodySampleX = bodyLeftPx + bodyWidthPx * 0.28;
      const bodySampleW = bodyWidthPx * 0.34;
      const bodySampleY = engravableTopPx + engravableZoneHeightPx * 0.2;
      const bodySampleH = Math.max(10, engravableZoneHeightPx * 0.35);

      const rimSampleH = Math.max(6, Math.min(Math.max(topPx, 10), CANVAS_HEIGHT * 0.08));
      const rimSampleY = Math.max(0, engravableTopPx - rimSampleH);
      const rimSampleX = bodyLeftPx + bodyWidthPx * 0.24;
      const rimSampleW = bodyWidthPx * 0.4;

      const sampledBody = sampleRegionColor(ctx, bodySampleX, bodySampleY, bodySampleW, bodySampleH, "average");
      const sampledRim = sampleRegionColor(ctx, rimSampleX, rimSampleY, rimSampleW, rimSampleH, "bright");

      if (!sampledBody && !sampledRim) return;

      const nextBody = sampledBody ?? bodyColorHex;
      const nextRim = sampledRim ?? rimColorHex;

      if (nextBody !== bodyColorHex || nextRim !== rimColorHex) {
        onColorsChange(nextBody, nextRim);
      }
    };
    img.src = activeDisplayPhoto.src;
  }, [
    activeDisplayPhoto,
    bodyColorHex,
    rimColorHex,
    onColorsChange,
    containerWidthPx,
    photoLeftPx,
    photoTopPx,
    photoWidthPx,
    targetPhotoHeightPx,
    bodyLeftPx,
    bodyWidthPx,
    topPx,
    engravableTopPx,
    engravableZoneHeightPx,
  ]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.editorRow}>
        {/* Product photo + overlay */}
        <div
          ref={containerRef}
          className={styles.photoContainer}
          style={{ height: CANVAS_HEIGHT, width: containerWidthPx }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div
            className={styles.bodyFrame}
            style={{ left: bodyLeftPx, width: bodyWidthPx, height: CANVAS_HEIGHT }}
          />

          {/* Product photo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeDisplayPhoto?.src ?? photoDataUrl}
            alt="Product"
            className={styles.productPhoto}
            style={{ height: targetPhotoHeightPx, left: photoLeftPx, top: photoTopPx }}
          />

          {/* Dead zones (non-engravable) */}
          <div
            className={styles.deadZone}
            style={{ top: 0, height: topPx, left: bodyLeftPx, width: bodyWidthPx }}
          />
          <div
            className={styles.deadZone}
            style={{ bottom: 0, height: bottomPx, left: bodyLeftPx, width: bodyWidthPx }}
          />

          {/* Engravable zone highlight */}
          <div
            className={styles.engravableZone}
            style={{ top: engravableTopPx, height: engravableZoneHeightPx, left: bodyLeftPx, width: bodyWidthPx }}
          />

          {/* Top drag line */}
          <div
            className={`${styles.dragLine} ${dragging === "top" ? styles.dragLineActive : ""}`}
            style={{ top: topPx, left: bodyLeftPx, width: bodyWidthPx }}
            onPointerDown={handlePointerDown("top")}
          >
            <span className={styles.dragLineLabel}>
              Top: {round1(topMarginMm)} mm
            </span>
          </div>

          {/* Bottom drag line */}
          <div
            className={`${styles.dragLine} ${styles.dragLineBottom} ${dragging === "bottom" ? styles.dragLineActive : ""}`}
            style={{ top: CANVAS_HEIGHT - bottomPx, left: bodyLeftPx, width: bodyWidthPx }}
            onPointerDown={handlePointerDown("bottom")}
          >
            <span className={styles.dragLineLabel}>
              Bottom: {round1(bottomMarginMm)} mm
            </span>
          </div>
        </div>

        {/* Readout panel */}
        <div className={styles.readout}>
          <div className={styles.readoutTitle}>Engravable zone</div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Total height</span>
            <span className={styles.readoutValue}>{round1(overallHeightMm)} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Top margin</span>
            <span className={styles.readoutValue}>{round1(topMarginMm)} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Bottom margin</span>
            <span className={styles.readoutValue}>{round1(bottomMarginMm)} mm</span>
          </div>
          <div className={`${styles.readoutRow} ${styles.readoutHighlight}`}>
            <span className={styles.readoutLabel}>Engravable height</span>
            <span className={styles.readoutValue}>{engravableHeightMm} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Diameter</span>
            <span className={styles.readoutValue}>{round1(diameterMm)} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Wrap width</span>
            <span className={styles.readoutValue}>{round1(Math.PI * diameterMm)} mm</span>
          </div>
          <div className={styles.readoutHint}>
            The dashed frame is the physical tumbler body. Drag the green lines to the silver rings.
          </div>
          <div className={styles.colorSwatchGroup}>
            <div className={styles.colorSwatchRow}>
              <span className={styles.readoutLabel}>Body color</span>
              <span className={styles.colorSwatchValue}>
                <span className={styles.colorSwatchChip} style={{ backgroundColor: bodyColorHex }} />
                <span className={styles.readoutValue}>{bodyColorHex}</span>
              </span>
            </div>
            <div className={styles.colorSwatchRow}>
              <span className={styles.readoutLabel}>Rim / engrave</span>
              <span className={styles.colorSwatchValue}>
                <span className={styles.colorSwatchChip} style={{ backgroundColor: rimColorHex }} />
                <span className={styles.readoutValue}>{rimColorHex}</span>
              </span>
            </div>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo centering</span>
              <span className={styles.readoutValue}>{photoCenterMode === "body" ? "ignore handle" : "full photo"}</span>
            </div>
            <div className={styles.anchorButtonRow}>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoCenterMode === "body" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoCenterModeChange("body")}
              >
                Center body
              </button>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoCenterMode === "photo" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoCenterModeChange("photo")}
              >
                Center full photo
              </button>
            </div>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo anchor</span>
              <span className={styles.readoutValue}>{photoAnchorY}</span>
            </div>
            <div className={styles.anchorButtonRow}>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoAnchorY === "center" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoAnchorYChange("center")}
              >
                Center
              </button>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoAnchorY === "bottom" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoAnchorYChange("bottom")}
              >
                Anchor Bottom
              </button>
            </div>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo size</span>
              <span className={styles.readoutValue}>{Math.round(clampedPhotoScalePct)}%</span>
            </div>
            <input
              className={styles.sliderInput}
              type="range"
              min={MIN_PHOTO_SCALE_PCT}
              max={MAX_PHOTO_SCALE_PCT}
              step={1}
              value={clampedPhotoScalePct}
              onChange={(e) => onPhotoScaleChange(Number(e.target.value) || 100)}
            />
            <button
              type="button"
              className={styles.sliderReset}
              onClick={() => onPhotoScaleChange(100)}
              disabled={Math.round(clampedPhotoScalePct) === 100}
            >
              Reset size
            </button>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo X offset</span>
              <span className={styles.readoutValue}>
                {clampedPhotoOffsetXPct > 0 ? "+" : ""}
                {Math.round(clampedPhotoOffsetXPct)}%
              </span>
            </div>
            <input
              className={styles.sliderInput}
              type="range"
              min={-MAX_PHOTO_OFFSET_X_PCT}
              max={MAX_PHOTO_OFFSET_X_PCT}
              step={1}
              value={clampedPhotoOffsetXPct}
              onChange={(e) => onPhotoOffsetXChange(Number(e.target.value) || 0)}
            />
            <button
              type="button"
              className={styles.sliderReset}
              onClick={() => onPhotoOffsetXChange(0)}
              disabled={Math.round(clampedPhotoOffsetXPct) === 0}
            >
              Reset X
            </button>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo Y offset</span>
              <span className={styles.readoutValue}>
                {clampedPhotoOffsetYPct > 0 ? "+" : ""}
                {Math.round(clampedPhotoOffsetYPct)}%
              </span>
            </div>
            <input
              className={styles.sliderInput}
              type="range"
              min={-MAX_PHOTO_OFFSET_Y_PCT}
              max={MAX_PHOTO_OFFSET_Y_PCT}
              step={1}
              value={clampedPhotoOffsetYPct}
              onChange={(e) => onPhotoOffsetYChange(Number(e.target.value) || 0)}
            />
            <button
              type="button"
              className={styles.sliderReset}
              onClick={() => onPhotoOffsetYChange(0)}
              disabled={Math.round(clampedPhotoOffsetYPct) === 0}
            >
              Reset position
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
