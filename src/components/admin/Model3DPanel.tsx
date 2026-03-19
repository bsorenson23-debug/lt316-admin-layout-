"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ModelViewerProps } from "./ModelViewer";
import styles from "./Model3DPanel.module.css";

const VIEWABLE_EXTS = new Set(["stl", "obj", "glb", "gltf"]);
const MAX_MODEL_BYTES = 150 * 1024 * 1024; // 150 MB

const ModelViewer = dynamic<ModelViewerProps>(
  () => import("./ModelViewer"),
  { ssr: false }
);

export function Model3DPanel() {
  const [modelFile, setModelFile] = React.useState<File | null>(null);
  const [sizeError, setSizeError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const modelExt = modelFile?.name.split(".").pop()?.toLowerCase() ?? "";
  const viewable = VIEWABLE_EXTS.has(modelExt);

  const accept = React.useCallback((file: File) => {
    if (file.size > MAX_MODEL_BYTES) {
      setSizeError(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 150 MB.`);
      return;
    }
    setSizeError(null);
    setModelFile(file);
    setViewerOpen(false);
  }, []);

  const clear = () => { setModelFile(null); setViewerOpen(false); setSizeError(null); };

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
          <div className={styles.viewerWrap}>
            <ModelViewer file={modelFile} />
          </div>
        )}
      </div>
    </section>
  );
}
