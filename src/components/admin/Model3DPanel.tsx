"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ModelViewerProps, BedOverlayData, TumblerDimensions } from "./ModelViewer";
import type { PlacedItem } from "@/types/admin";
import { GLB_TEMPLATES } from "@/data/glbTemplates";
import type { GlbTemplate } from "@/data/glbTemplates";
import styles from "./Model3DPanel.module.css";

const VIEWABLE_EXTS = new Set(["stl", "obj", "glb", "gltf"]);
const MAX_MODEL_BYTES = 150 * 1024 * 1024; // 150 MB

const ModelViewer = dynamic<ModelViewerProps>(
  () => import("./ModelViewer"),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Renders all placed SVG items onto an off-screen canvas → PNG data URL
// The canvas is transparent so only the actual vector art has alpha > 0.
// ---------------------------------------------------------------------------

async function buildBedTexture(
  items: PlacedItem[],
  bedWidthMm: number,
  bedHeightMm: number,
): Promise<{ dataUrl: string; canvas: HTMLCanvasElement }> {
  const SCALE = 4; // px per mm — enough resolution for a 300mm bed
  const W = Math.ceil(bedWidthMm * SCALE);
  const H = Math.ceil(bedHeightMm * SCALE);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context");

  ctx.clearRect(0, 0, W, H); // transparent background

  for (const item of items) {
    if (item.visible === false) continue;

    const blob = new Blob([item.svgText], { type: "image/svg+xml" });
    const blobUrl = URL.createObjectURL(blob);

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const cx = (item.x + item.width / 2) * SCALE;
        const cy = (item.y + item.height / 2) * SCALE;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.drawImage(
          img,
          (-item.width * SCALE) / 2,
          (-item.height * SCALE) / 2,
          item.width * SCALE,
          item.height * SCALE,
        );
        ctx.restore();
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
      img.src = blobUrl;
    });
  }

  return { dataUrl: canvas.toDataURL("image/png"), canvas };
}

// ---------------------------------------------------------------------------

export interface Model3DPanelProps {
  placedItems?: PlacedItem[];
  bedWidthMm?: number;
  bedHeightMm?: number;
  workspaceMode?: "flat-bed" | "tumbler-wrap";
  tumblerDims?: TumblerDimensions | null;
  handleArcDeg?: number;
  modelPathOverride?: string | null;
}

export function Model3DPanel({
  placedItems = [],
  bedWidthMm = 100,
  bedHeightMm = 100,
  workspaceMode = "flat-bed",
  tumblerDims,
  handleArcDeg,
  modelPathOverride,
}: Model3DPanelProps) {
  const [modelFile, setModelFile] = React.useState<File | null>(null);
  const [sizeError, setSizeError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [overlay, setOverlay] = React.useState<BedOverlayData | null>(null);
  const [snapping, setSnapping] = React.useState(false);
  const [templateLoading, setTemplateLoading] = React.useState<string | null>(null);
  const [templateError, setTemplateError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const bedCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const filteredTemplates = GLB_TEMPLATES.filter((t) =>
    t.workspaceModes.includes(workspaceMode)
  );

  const modelExt = modelFile?.name.split(".").pop()?.toLowerCase() ?? "";
  const viewable = VIEWABLE_EXTS.has(modelExt);
  const hasItems = placedItems.length > 0;

  const accept = React.useCallback((file: File) => {
    if (file.size > MAX_MODEL_BYTES) {
      setSizeError(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 150 MB.`);
      return;
    }
    setSizeError(null);
    setModelFile(file);
    setViewerOpen(false);
    setOverlay(null); // clear old overlay when model changes
    bedCanvasRef.current = null;
  }, []);

  const clear = () => {
    setModelFile(null);
    setViewerOpen(false);
    setSizeError(null);
    setOverlay(null);
    bedCanvasRef.current = null;
  };

  const loadTemplate = React.useCallback(async (tpl: GlbTemplate) => {
    setTemplateLoading(tpl.id);
    setTemplateError(null);
    try {
      const res = await fetch(tpl.glbPath);
      if (!res.ok) {
        const name = tpl.glbPath.split("/").pop();
        throw new Error(`File not found — place ${name} in /public/models/templates/`);
      }
      const blob = await res.blob();
      const fileName = tpl.glbPath.split("/").pop() ?? "model.glb";
      const file = new File([blob], fileName, { type: "model/gltf-binary" });
      accept(file);
      setViewerOpen(true);
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "Failed to load template");
    } finally {
      setTemplateLoading(null);
    }
  }, [accept]);

  // Auto-load GLB when a product template is selected
  React.useEffect(() => {
    if (!modelPathOverride) return;
    // Skip if the currently loaded model already matches this path
    const expectedName = modelPathOverride.split("/").pop() ?? "";
    if (modelFile?.name === expectedName) return;

    fetch(modelPathOverride)
      .then((r) => {
        if (!r.ok) throw new Error(`404: ${modelPathOverride}`);
        return r.blob();
      })
      .then((blob) => {
        const filename = modelPathOverride.split("/").pop() ?? "model.glb";
        const file = new File([blob], filename, { type: "model/gltf-binary" });
        accept(file);
        setViewerOpen(true);
      })
      .catch((err) => console.warn("[Model3DPanel] auto-load failed:", err));
  }, [modelPathOverride, accept]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSnapDesign = React.useCallback(async () => {
    if (!hasItems) return;
    setSnapping(true);
    try {
      const result = await buildBedTexture(placedItems, bedWidthMm, bedHeightMm);
      bedCanvasRef.current = result.canvas;
      setOverlay({ dataUrl: result.dataUrl, bedWidthMm, bedHeightMm, workspaceMode });
    } catch (e) {
      console.error("[Model3DPanel] overlay build failed", e);
    } finally {
      setSnapping(false);
    }
  }, [placedItems, bedWidthMm, bedHeightMm, workspaceMode, hasItems]);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>3D Model Preview</span>
        {modelFile && (
          <button className={styles.clearBtn} onClick={clear}>Clear</button>
        )}
      </div>

      <div className={styles.body}>
        <input
          ref={inputRef}
          type="file"
          accept=".stl,.obj,.glb,.gltf,.step,.stp"
          className={styles.fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) accept(file);
            e.target.value = "";
          }}
        />

        {/* Drop zone */}
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""} ${modelFile ? styles.dropZoneLoaded : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) accept(file);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          aria-label="Drop 3D model file here"
        >
          {modelFile ? (
            <>
              <span className={styles.dropIcon}>◈</span>
              <span className={styles.dropName}>{modelFile.name}</span>
              <span className={styles.dropExt}>{modelExt.toUpperCase()}</span>
            </>
          ) : (
            <>
              <span className={styles.dropIcon}>◈</span>
              <span className={styles.dropText}>Drop 3D model here</span>
              <span className={styles.dropHint}>STL · OBJ · GLB · STEP</span>
            </>
          )}
        </div>

        {sizeError && <div className={styles.error}>{sizeError}</div>}

        {modelFile && viewable && (
          <button
            className={`${styles.toggleBtn} ${viewerOpen ? styles.toggleBtnActive : ""}`}
            onClick={() => setViewerOpen((o) => !o)}
          >
            {viewerOpen ? "Hide Preview" : "Show 3D Preview"}
          </button>
        )}

        {/* Snap design button — only shown when model is open and items exist */}
        {modelFile && viewable && viewerOpen && (
          <div className={styles.snapRow}>
            <button
              className={`${styles.snapBtn} ${overlay ? styles.snapBtnApplied : ""}`}
              onClick={handleSnapDesign}
              disabled={!hasItems || snapping}
              title={!hasItems ? "Place items on the bed first" : "Render bed design onto 3D model"}
            >
              {snapping
                ? "Building…"
                : overlay
                  ? "⟳ Re-snap Design"
                  : "◈ Snap Design to 3D"}
            </button>
            {overlay && (
              <button
                className={styles.snapClearBtn}
                onClick={() => { setOverlay(null); bedCanvasRef.current = null; }}
                title="Remove design overlay"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {modelFile && !viewable && (
          <div className={styles.unsupported}>
            .{modelExt.toUpperCase()} — live preview not supported
          </div>
        )}

        {modelFile && viewable && viewerOpen && (
          <div className={styles.viewerWrap}>
            <ModelViewer
              file={modelFile}
              overlay={overlay}
              tumblerDims={tumblerDims}
              handleArcDeg={handleArcDeg}
              bedCanvas={bedCanvasRef.current}
            />
          </div>
        )}

        {/* ── Admin template library ── */}
        {filteredTemplates.length > 0 && (
          <div className={styles.templateSection}>
            <span className={styles.templateSectionLabel}>Templates</span>
            {templateError && (
              <div className={styles.templateError}>{templateError}</div>
            )}
            <div className={styles.templateGrid}>
              {filteredTemplates.map((tpl) => {
                const isActive = modelFile?.name === tpl.glbPath.split("/").pop();
                const isLoading = templateLoading === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    className={`${styles.templateCard} ${isActive ? styles.templateCardActive : ""}`}
                    onClick={() => void loadTemplate(tpl)}
                    disabled={templateLoading !== null}
                    title={tpl.label}
                  >
                    <div className={styles.templateThumb}>
                      {isLoading ? (
                        <span className={styles.templateSpinner} />
                      ) : (
                        <>
                          {tpl.thumbnailPath && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={tpl.thumbnailPath}
                              alt=""
                              className={styles.templateThumbImg}
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                          <span className={styles.templateIcon}>{tpl.icon}</span>
                        </>
                      )}
                    </div>
                    <span className={styles.templateCardLabel}>{tpl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
