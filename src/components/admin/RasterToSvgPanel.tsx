"use client";

import React from "react";
import type { RasterVectorizeResponse, RasterTraceMode } from "@/types/rasterVectorize";
import { svgToDataUrl } from "@/utils/svg";
import { FileDropZone } from "./shared/FileDropZone";
import styles from "./RasterToSvgPanel.module.css";

interface Props {
  onAddAsset: (svgContent: string, fileName: string) => void;
}

type Status = "idle" | "running" | "done" | "error";
type ThresholdMode = "auto" | "manual";

function basename(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function RasterToSvgPanel({ onAddAsset }: Props) {
  const [open, setOpen] = React.useState(false);
  const [sourceFile, setSourceFile] = React.useState<File | null>(null);
  const [workingFile, setWorkingFile] = React.useState<File | null>(null);
  const [traceMode, setTraceMode] = React.useState<RasterTraceMode>("trace");
  const [thresholdMode, setThresholdMode] = React.useState<ThresholdMode>("auto");
  const [threshold, setThreshold] = React.useState(160);
  const [invert, setInvert] = React.useState(false);
  const [trimWhitespace, setTrimWhitespace] = React.useState(true);
  const [normalizeLevels, setNormalizeLevels] = React.useState(true);
  const [turdSize, setTurdSize] = React.useState(2);
  const [alphaMax, setAlphaMax] = React.useState(1);
  const [optTolerance, setOptTolerance] = React.useState(0.2);
  const [posterizeSteps, setPosterizeSteps] = React.useState(4);
  const [outputColor, setOutputColor] = React.useState("#000000");
  const [bgStatus, setBgStatus] = React.useState<Status>("idle");
  const [traceStatus, setTraceStatus] = React.useState<Status>("idle");
  const [traceError, setTraceError] = React.useState<string | null>(null);
  const [svgText, setSvgText] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<{ pathCount: number; width: number; height: number } | null>(null);

  const activeFile = workingFile ?? sourceFile;
  const [sourcePreviewUrl, setSourcePreviewUrl] = React.useState<string | null>(null);
  const [workingPreviewUrl, setWorkingPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sourceFile) {
      setSourcePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourcePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  React.useEffect(() => {
    if (!workingFile) {
      setWorkingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(workingFile);
    setWorkingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [workingFile]);

  const svgPreviewUrl = React.useMemo(() => (svgText ? svgToDataUrl(svgText) : null), [svgText]);

  const resetTrace = React.useCallback(() => {
    setSvgText(null);
    setStats(null);
    setTraceError(null);
    setTraceStatus("idle");
  }, []);

  const handleFileSelected = React.useCallback((file: File) => {
    setSourceFile(file);
    setWorkingFile(null);
    setBgStatus("idle");
    resetTrace();
  }, [resetTrace]);

  const handleClear = React.useCallback(() => {
    setSourceFile(null);
    setWorkingFile(null);
    setBgStatus("idle");
    resetTrace();
  }, [resetTrace]);

  const handleResetRaster = React.useCallback(() => {
    setWorkingFile(null);
    setBgStatus("idle");
    resetTrace();
  }, [resetTrace]);

  const handleRemoveBackground = React.useCallback(async () => {
    if (!sourceFile) return;
    setBgStatus("running");
    setTraceError(null);
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(sourceFile);
      const cutoutFile = new File([blob], `${basename(sourceFile.name)}-cutout.png`, { type: "image/png" });
      setWorkingFile(cutoutFile);
      setBgStatus("done");
      resetTrace();
    } catch (error) {
      setBgStatus("error");
      setTraceError(error instanceof Error ? error.message : "Background removal failed");
    }
  }, [sourceFile, resetTrace]);

  const handleVectorize = React.useCallback(async () => {
    if (!activeFile) return;
    setTraceStatus("running");
    setTraceError(null);
    try {
      const formData = new FormData();
      formData.set("image", activeFile);
      formData.set("mode", traceMode);
      formData.set("thresholdMode", thresholdMode);
      formData.set("threshold", String(threshold));
      formData.set("invert", String(invert));
      formData.set("trimWhitespace", String(trimWhitespace));
      formData.set("normalizeLevels", String(normalizeLevels));
      formData.set("turdSize", String(turdSize));
      formData.set("alphaMax", String(alphaMax));
      formData.set("optTolerance", String(optTolerance));
      formData.set("posterizeSteps", String(posterizeSteps));
      formData.set("outputColor", outputColor);
      formData.set("maxDimension", "2200");

      const response = await fetch("/api/admin/image/vectorize", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as RasterVectorizeResponse | { error?: string };
      if (!response.ok || !("svg" in payload)) {
        throw new Error((payload as { error?: string }).error ?? "Vectorization failed");
      }

      setSvgText(payload.svg);
      setStats({
        pathCount: payload.pathCount,
        width: payload.width,
        height: payload.height,
      });
      setTraceStatus("done");
    } catch (error) {
      setTraceStatus("error");
      setTraceError(error instanceof Error ? error.message : "Vectorization failed");
    }
  }, [activeFile, traceMode, thresholdMode, threshold, invert, trimWhitespace, normalizeLevels, turdSize, alphaMax, optTolerance, posterizeSteps, outputColor]);

  const handleAddSvg = React.useCallback(() => {
    if (!svgText || !sourceFile) return;
    const fileName = `${basename(sourceFile.name)}-${traceMode}.svg`;
    onAddAsset(svgText, fileName);
  }, [svgText, sourceFile, traceMode, onAddAsset]);

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((value) => !value)}>
        <span className={styles.toggleLabel}>Premium Raster to SVG</span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <p className={styles.note}>
            High-quality PNG/JPEG tracing for logos, line art, and cleaned product graphics. Best results come from clean images or a quick cutout first.
          </p>

          <div className={styles.dropWrap}>
            <FileDropZone
              accept="image/png,image/jpeg,image/webp,image/avif"
              fileName={null}
              label="Drop PNG or JPEG here"
              hint="PNG, JPEG, WEBP, AVIF"
              onFileSelected={handleFileSelected}
              onClear={handleClear}
            />
            {sourceFile && (
              <div className={styles.fileRow}>
                <div className={styles.fileMeta}>
                  <span className={styles.fileName}>{sourceFile.name}</span>
                  <span className={styles.fileHint}>{workingFile ? `Tracing ${workingFile.name}` : "Tracing original raster"}</span>
                </div>
                <button type="button" className={styles.clearBtn} onClick={handleClear}>Clear</button>
              </div>
            )}
          </div>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondaryBtn} onClick={handleRemoveBackground} disabled={!sourceFile || bgStatus === "running"}>
              {bgStatus === "running" ? "Removing BG…" : workingFile ? "Re-run Cutout" : "AI Cutout"}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={handleResetRaster} disabled={!workingFile}>
              Use Original
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Trace Mode</div>
            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${traceMode === "trace" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setTraceMode("trace")}
              >
                Single Color
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${traceMode === "posterize" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setTraceMode("posterize")}
              >
                Posterized
              </button>
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Threshold</span>
                  <span className={styles.value}>{thresholdMode === "auto" ? "Auto" : threshold}</span>
                </div>
                <select className={styles.select} value={thresholdMode} onChange={(e) => setThresholdMode(e.target.value as ThresholdMode)}>
                  <option value="auto">Auto threshold</option>
                  <option value="manual">Manual threshold</option>
                </select>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Noise filter</span>
                  <span className={styles.value}>{turdSize}</span>
                </div>
                <input className={styles.range} type="range" min={0} max={25} step={1} value={turdSize} onChange={(e) => setTurdSize(Number(e.target.value))} />
              </div>

              {thresholdMode === "manual" && (
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Manual threshold</span>
                    <span className={styles.value}>{threshold}</span>
                  </div>
                  <input className={styles.range} type="range" min={0} max={255} step={1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
                </div>
              )}

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Corner smoothing</span>
                  <span className={styles.value}>{alphaMax.toFixed(2)}</span>
                </div>
                <input className={styles.range} type="range" min={0} max={2} step={0.05} value={alphaMax} onChange={(e) => setAlphaMax(Number(e.target.value))} />
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Curve tolerance</span>
                  <span className={styles.value}>{optTolerance.toFixed(2)}</span>
                </div>
                <input className={styles.range} type="range" min={0.05} max={1} step={0.05} value={optTolerance} onChange={(e) => setOptTolerance(Number(e.target.value))} />
              </div>

              {traceMode === "posterize" ? (
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Posterize layers</span>
                    <span className={styles.value}>{posterizeSteps}</span>
                  </div>
                  <input className={styles.range} type="range" min={2} max={8} step={1} value={posterizeSteps} onChange={(e) => setPosterizeSteps(Number(e.target.value))} />
                </div>
              ) : (
                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Output color</span>
                    <span className={styles.value}>{outputColor}</span>
                  </div>
                  <input className={styles.colorInput} type="color" value={outputColor} onChange={(e) => setOutputColor(e.target.value)} />
                </div>
              )}
            </div>

            <div className={styles.checkboxRow}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                Invert trace
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={trimWhitespace} onChange={(e) => setTrimWhitespace(e.target.checked)} />
                Trim whitespace
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={normalizeLevels} onChange={(e) => setNormalizeLevels(e.target.checked)} />
                Normalize contrast
              </label>
            </div>

            <button type="button" className={styles.primaryBtn} onClick={handleVectorize} disabled={!activeFile || traceStatus === "running"}>
              {traceStatus === "running" ? "Tracing…" : "Trace to SVG"}
            </button>
          </div>

          <div className={styles.previewGrid}>
            <div className={styles.previewCard}>
              <div className={styles.previewLabel}>{workingFile ? "Active Raster" : "Original Raster"}</div>
              <div className={styles.previewFrame}>
                {activeFile && (workingPreviewUrl ?? sourcePreviewUrl) ? (
                  <img className={styles.previewImage} src={workingPreviewUrl ?? sourcePreviewUrl ?? undefined} alt="Raster preview" />
                ) : (
                  <div className={styles.previewPlaceholder}>Upload an image to start tracing.</div>
                )}
              </div>
            </div>

            <div className={styles.previewCard}>
              <div className={styles.previewLabel}>SVG Preview</div>
              <div className={styles.previewFrame}>
                {svgPreviewUrl ? (
                  <img className={styles.previewImage} src={svgPreviewUrl} alt="SVG preview" />
                ) : (
                  <div className={styles.previewPlaceholder}>Run the trace to preview the vector result.</div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.statusRow}>
            <span className={traceStatus === "done" ? styles.statusSuccess : traceStatus === "error" ? styles.statusError : undefined}>
              {traceStatus === "done"
                ? `Ready${stats ? ` • ${stats.pathCount} paths • ${Math.round(stats.width)}×${Math.round(stats.height)}` : ""}`
                : traceStatus === "running"
                  ? "Vectorizing…"
                  : bgStatus === "done"
                    ? "Cutout applied"
                    : "Awaiting trace"}
            </span>
            <button type="button" className={styles.addBtn} onClick={handleAddSvg} disabled={!svgText}>
              Add SVG to Library
            </button>
          </div>

          {traceError && <p className={styles.errorText}>{traceError}</p>}
        </div>
      )}
    </div>
  );
}
