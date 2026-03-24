"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ModelViewerProps, TumblerDimensions } from "./ModelViewer";
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
// Rasterize a single PlacedItem's SVG into its own canvas (4 px/mm)
// ---------------------------------------------------------------------------

const PX_PER_MM = 4;

async function rasterizeItem(item: PlacedItem): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(item.width * PX_PER_MM);
  canvas.height = Math.ceil(item.height * PX_PER_MM);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const blob = new Blob([item.svgText], { type: "image/svg+xml" });
  const blobUrl = URL.createObjectURL(blob);

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
    img.src = blobUrl;
  });

  return canvas;
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
  /** Tumbler mapping from the wizard — orients the front face */
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping;
  /** Lifted model file — parent tracks it for center 3D view */
  onModelFileChange?: (file: File | null) => void;
  /** Callback to save calibration offsets to the template's tumblerMapping */
  onUpdateCalibration?: (offsetX: number, offsetY: number, rotation: number) => void;
}

export function Model3DPanel({
  placedItems = [],
  bedWidthMm = 100,
  bedHeightMm = 100,
  workspaceMode = "flat-bed",
  tumblerDims,
  handleArcDeg,
  modelPathOverride,
  tumblerMapping,
  onModelFileChange,
  onUpdateCalibration,
}: Model3DPanelProps) {
  const [modelFile, setModelFileLocal] = React.useState<File | null>(null);

  // Sync with parent
  const setModelFile = React.useCallback((file: File | null) => {
    setModelFileLocal(file);
    onModelFileChange?.(file);
  }, [onModelFileChange]);
  const [sizeError, setSizeError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [itemTextures, setItemTextures] = React.useState<Map<string, HTMLCanvasElement>>(new Map());
  const [templateLoading, setTemplateLoading] = React.useState<string | null>(null);
  const [templateError, setTemplateError] = React.useState<string | null>(null);
  const [showCalibration, setShowCalibration] = React.useState(false);
  const [calX, setCalX] = React.useState(tumblerMapping?.calibrationOffsetX ?? 0);
  const [calY, setCalY] = React.useState(tumblerMapping?.calibrationOffsetY ?? 0);
  const [calRot, setCalRot] = React.useState(tumblerMapping?.calibrationRotation ?? 0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync calibration sliders with mapping changes (e.g. template switch)
  React.useEffect(() => {
    setCalX(tumblerMapping?.calibrationOffsetX ?? 0);
    setCalY(tumblerMapping?.calibrationOffsetY ?? 0);
    setCalRot(tumblerMapping?.calibrationRotation ?? 0);
  }, [tumblerMapping?.calibrationOffsetX, tumblerMapping?.calibrationOffsetY, tumblerMapping?.calibrationRotation]);

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
  }, [setModelFile]);

  const clear = () => {
    setModelFile(null);
    setViewerOpen(false);
    setSizeError(null);
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

  // Serialized key so the effect re-fires when items move/resize, not just on reference changes
  const itemPositionKey = React.useMemo(
    () => placedItems.map(i => `${i.id}:${i.x}:${i.y}:${i.width}:${i.height}`).join("|"),
    [placedItems],
  );

  // Auto-rasterize each placed item into its own canvas texture
  // Runs whenever items change — no manual "Snap" button needed
  React.useEffect(() => {
    if (!viewerOpen || !hasItems) {
      setItemTextures(new Map());
      return;
    }

    let cancelled = false;
    const visible = placedItems.filter((i) => i.visible !== false);

    Promise.all(
      visible.map(async (item) => {
        const canvas = await rasterizeItem(item);
        return [item.id, canvas] as [string, HTMLCanvasElement];
      }),
    ).then((entries) => {
      if (!cancelled) setItemTextures(new Map(entries));
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen, itemPositionKey, hasItems]);

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

        {modelFile && !viewable && (
          <div className={styles.unsupported}>
            .{modelExt.toUpperCase()} — live preview not supported
          </div>
        )}

        {modelFile && viewable && viewerOpen && (
          <>
            <div className={styles.viewerWrap}>
              <ModelViewer
                file={modelFile}
                placedItems={placedItems}
                itemTextures={itemTextures}
                bedWidthMm={bedWidthMm}
                bedHeightMm={bedHeightMm}
                tumblerDims={tumblerDims}
                handleArcDeg={handleArcDeg}
                glbPath={modelPathOverride}
                tumblerMapping={showCalibration && tumblerMapping
                  ? { ...tumblerMapping, calibrationOffsetX: calX, calibrationOffsetY: calY, calibrationRotation: calRot }
                  : tumblerMapping}
              />
            </div>

            {/* Calibrate 3D preview — slider-based offset adjustment */}
            {tumblerMapping && onUpdateCalibration && (
              <div className={styles.calibrationSection}>
                {!showCalibration ? (
                  <button
                    type="button"
                    className={styles.calibrateBtn}
                    onClick={() => setShowCalibration(true)}
                  >
                    Calibrate 3D Preview
                  </button>
                ) : (
                  <>
                    <div className={styles.calibrateHint}>
                      Adjust until the 3D preview matches the grid placement
                    </div>
                    <label className={styles.calibrateRow}>
                      <span className={styles.calibrateLabel}>Rotation</span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={calRot}
                        onChange={(e) => setCalRot(Number(e.target.value))}
                        className={styles.calibrateSlider}
                      />
                      <span className={styles.calibrateValue}>{calRot}&deg;</span>
                    </label>
                    <label className={styles.calibrateRow}>
                      <span className={styles.calibrateLabel}>H offset</span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={calX}
                        onChange={(e) => setCalX(Number(e.target.value))}
                        className={styles.calibrateSlider}
                      />
                      <span className={styles.calibrateValue}>{calX}mm</span>
                    </label>
                    <label className={styles.calibrateRow}>
                      <span className={styles.calibrateLabel}>V offset</span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={calY}
                        onChange={(e) => setCalY(Number(e.target.value))}
                        className={styles.calibrateSlider}
                      />
                      <span className={styles.calibrateValue}>{calY}mm</span>
                    </label>
                    <div className={styles.calibrateBtns}>
                      <button
                        type="button"
                        className={styles.calibrateSaveBtn}
                        onClick={() => {
                          onUpdateCalibration(calX, calY, calRot);
                          setShowCalibration(false);
                        }}
                      >
                        Save Calibration
                      </button>
                      <button
                        type="button"
                        className={styles.calibrateCancelBtn}
                        onClick={() => {
                          setCalX(tumblerMapping.calibrationOffsetX ?? 0);
                          setCalY(tumblerMapping.calibrationOffsetY ?? 0);
                          setCalRot(tumblerMapping.calibrationRotation ?? 0);
                          setShowCalibration(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
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
