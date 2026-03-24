"use client";

import React from "react";
import type { ProductTemplate, TumblerMapping } from "@/types/productTemplate";
import type { AutoDetectResult } from "@/lib/autoDetect";
import { detectTumblerFromImage } from "@/lib/autoDetect";
import { KNOWN_MATERIAL_PROFILES } from "@/data/materialProfiles";
import { DEFAULT_ROTARY_PLACEMENT_PRESETS } from "@/data/rotaryPlacementPresets";
import { saveTemplate, updateTemplate } from "@/lib/templateStorage";
import { generateThumbnail } from "@/lib/generateThumbnail";
import { findTumblerProfileIdForBrandModel, getTumblerProfileById, getProfileHandleArcDeg } from "@/data/tumblerProfiles";
import { FileDropZone } from "./shared/FileDropZone";
import { TumblerMappingWizard } from "./TumblerMappingWizard";
import styles from "./TemplateCreateForm.module.css";

interface Props {
  onSave: (template: ProductTemplate) => void;
  onCancel: () => void;
  editingTemplate?: ProductTemplate;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convert an image file to a data URL (max 480px on longest side for face photos) */
function fileToFacePhotoDataUrl(file: File, maxSize = 480): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(img.src); resolve(""); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(""); };
    img.src = URL.createObjectURL(file);
  });
}

/** Flip an image data URL horizontally (mirror) for back-side overlay */
function flipImageHorizontal(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}


/** Map AI product type string to our ProductTemplate product types */
function mapProductType(aiType: string): "tumbler" | "mug" | "bottle" | "flat" {
  const lower = aiType.toLowerCase();
  if (lower.includes("mug")) return "mug";
  if (lower.includes("bottle") || lower.includes("water")) return "bottle";
  if (lower.includes("flat") || lower.includes("sheet") || lower.includes("plate")) return "flat";
  return "tumbler";
}

export function TemplateCreateForm({ onSave, onCancel, editingTemplate }: Props) {
  const isEdit = Boolean(editingTemplate);

  // ── Product identity ─────────────────────────────────────────────
  const [name, setName] = React.useState(editingTemplate?.name ?? "");
  const [brand, setBrand] = React.useState(editingTemplate?.brand ?? "");
  const [capacity, setCapacity] = React.useState(editingTemplate?.capacity ?? "");
  const [laserType, setLaserType] = React.useState<"fiber" | "co2" | "diode">(
    editingTemplate?.laserType ?? "fiber"
  );
  const [productType, setProductType] = React.useState<"tumbler" | "mug" | "bottle" | "flat">(
    editingTemplate?.productType ?? "tumbler"
  );

  // ── Files ────────────────────────────────────────────────────────
  const [thumbDataUrl, setThumbDataUrl] = React.useState(editingTemplate?.thumbnailDataUrl ?? "");
  const [glbPath, setGlbPath] = React.useState(editingTemplate?.glbPath ?? "");
  const [glbFileName, setGlbFileName] = React.useState<string | null>(null);
  const [glbUploading, setGlbUploading] = React.useState(false);
  const [glbUploadError, setGlbUploadError] = React.useState<string | null>(null);
  const [productImageFile, setProductImageFile] = React.useState<File | null>(null);
  const [productPhotoFullUrl, setProductPhotoFullUrl] = React.useState(editingTemplate?.productPhotoFullUrl ?? "");

  // ── Auto-detect ──────────────────────────────────────────────────
  const [detecting, setDetecting] = React.useState(false);
  const [detectResult, setDetectResult] = React.useState<AutoDetectResult | null>(null);
  const [detectError, setDetectError] = React.useState<string | null>(null);

  // ── Dimensions ───────────────────────────────────────────────────
  const [diameterMm, setDiameterMm] = React.useState(editingTemplate?.dimensions.diameterMm ?? 0);
  const [printHeightMm, setPrintHeightMm] = React.useState(editingTemplate?.dimensions.printHeightMm ?? 0);
  const [handleArcDeg, setHandleArcDeg] = React.useState(() => {
    const saved = editingTemplate?.dimensions.handleArcDeg;
    if (saved != null && saved > 0) return saved;
    // Default: 90° for tumblers (standard handle), 0 for flat/mug/bottle
    const pt = editingTemplate?.productType ?? "tumbler";
    return pt === "tumbler" ? 90 : 0;
  });
  const [taperCorrection, setTaperCorrection] = React.useState<"none" | "top-narrow" | "bottom-narrow">(
    editingTemplate?.dimensions.taperCorrection ?? "none"
  );

  const templateWidthMm = diameterMm > 0 ? round2(Math.PI * diameterMm) : 0;

  // ── Laser settings ───────────────────────────────────────────────
  const [power, setPower] = React.useState(editingTemplate?.laserSettings.power ?? 22);
  const [speed, setSpeed] = React.useState(editingTemplate?.laserSettings.speed ?? 350);
  const [frequency, setFrequency] = React.useState(editingTemplate?.laserSettings.frequency ?? 100);
  const [lineInterval, setLineInterval] = React.useState(editingTemplate?.laserSettings.lineInterval ?? 0.05);
  const [materialProfileId, setMaterialProfileId] = React.useState(editingTemplate?.laserSettings.materialProfileId ?? "");
  const [rotaryPresetId, setRotaryPresetId] = React.useState(editingTemplate?.laserSettings.rotaryPresetId ?? "");

  // ── Tumbler mapping ─────────────────────────────────────────────
  const [tumblerMapping, setTumblerMapping] = React.useState<TumblerMapping | undefined>(
    editingTemplate?.tumblerMapping,
  );
  const [showMappingWizard, setShowMappingWizard] = React.useState(false);

  // ── Front / Back face photos ──────────────────────────────────
  const [frontPhotoDataUrl, setFrontPhotoDataUrl] = React.useState(editingTemplate?.frontPhotoDataUrl ?? "");
  const [backPhotoDataUrl, setBackPhotoDataUrl] = React.useState(editingTemplate?.backPhotoDataUrl ?? "");
  const [frontOriginalUrl, setFrontOriginalUrl] = React.useState("");
  const [backOriginalUrl, setBackOriginalUrl] = React.useState("");
  const [frontCleanUrl, setFrontCleanUrl] = React.useState("");
  const [backCleanUrl, setBackCleanUrl] = React.useState("");
  const [frontBgStatus, setFrontBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [backBgStatus, setBackBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [frontUseOriginal, setFrontUseOriginal] = React.useState(false);
  const [backUseOriginal, setBackUseOriginal] = React.useState(false);
  const [mirrorForBack, setMirrorForBack] = React.useState(true);

  // Auto-mirror front photo as back when mirrorForBack is enabled
  React.useEffect(() => {
    if (!mirrorForBack || !frontPhotoDataUrl) {
      if (mirrorForBack) setBackPhotoDataUrl("");
      return;
    }
    let cancelled = false;
    flipImageHorizontal(frontPhotoDataUrl).then((flipped) => {
      if (!cancelled && flipped) setBackPhotoDataUrl(flipped);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorForBack, frontPhotoDataUrl]);

  // ── Validation ───────────────────────────────────────────────────
  const [errors, setErrors] = React.useState<string[]>([]);

  /** Handle product image selection — store file for auto-detect, generate thumbnail + full-res */
  const handleProductImage = async (file: File) => {
    setProductImageFile(file);
    setDetectResult(null);
    setDetectError(null);
    // Thumbnail: 120x120 cropped (for gallery cards)
    const thumb = await generateThumbnail(file);
    setThumbDataUrl(thumb);
    // Full-res: max 1024px (for grid overlay)
    const full = await fileToFacePhotoDataUrl(file, 1024);
    if (full) setProductPhotoFullUrl(full);
  };

  /** Run auto-detect on the uploaded product image */
  const handleAutoDetect = async () => {
    if (!productImageFile) return;
    setDetecting(true);
    setDetectError(null);
    setDetectResult(null);
    try {
      const result = await detectTumblerFromImage(productImageFile);
      setDetectResult(result);
      // Auto-fill form fields from detection
      const { draft, response } = result;
      const sug = response.suggestion;
      // Build a display name from brand + model + capacity
      const parts: string[] = [];
      if (sug.brand) parts.push(sug.brand);
      if (sug.model) parts.push(sug.model);
      if (sug.capacityOz) parts.push(`${sug.capacityOz}oz`);
      if (parts.length > 0) setName(parts.join(" "));
      if (sug.brand) setBrand(sug.brand);
      if (sug.capacityOz) setCapacity(`${sug.capacityOz}oz`);
      // Dimensions
      if (draft.outsideDiameterMm) setDiameterMm(round2(draft.outsideDiameterMm));
      if (draft.usableHeightMm) setPrintHeightMm(round2(draft.usableHeightMm));
      else if (draft.templateHeightMm) setPrintHeightMm(round2(draft.templateHeightMm));
      // Handle arc: prefer profile-specific value, fall back to 90 if hasHandle
      const profileId = findTumblerProfileIdForBrandModel({
        brand: sug.brand,
        model: sug.model,
        capacityOz: sug.capacityOz,
      });
      const matchedProfile = profileId ? getTumblerProfileById(profileId) : null;
      const profileArc = getProfileHandleArcDeg(matchedProfile);
      if (profileArc > 0) {
        setHandleArcDeg(profileArc);
      } else if (sug.hasHandle) {
        setHandleArcDeg(90);
      }
      // Product type
      setProductType(mapProductType(sug.productType));
      // Taper
      if (sug.topDiameterMm && sug.bottomDiameterMm && sug.topDiameterMm !== sug.bottomDiameterMm) {
        setTaperCorrection(sug.topDiameterMm < sug.bottomDiameterMm ? "top-narrow" : "bottom-narrow");
      }

      // Auto-assign uploaded product photo as front face (no bg removal — operator can trigger later)
      if (productImageFile && !frontPhotoDataUrl) {
        const original = await fileToFacePhotoDataUrl(productImageFile);
        if (original) {
          setFrontOriginalUrl(original);
          setFrontPhotoDataUrl(original);
        }
      }
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : "Auto-detect failed. Fill in manually.");
    } finally {
      setDetecting(false);
    }
  };

  const handleGlbFile = async (file: File) => {
    setGlbFileName(file.name);
    setGlbUploading(true);
    setGlbUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/models/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.path) {
        setGlbPath(data.path);
      } else {
        setGlbUploadError(data.error ?? "Upload failed");
      }
    } catch {
      setGlbUploadError("Upload failed — check server logs");
    } finally {
      setGlbUploading(false);
    }
  };

  const handleSave = () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("Product name is required.");
    if (productType !== "flat" && diameterMm <= 0) errs.push("Diameter must be > 0 for non-flat products.");
    if (printHeightMm <= 0) errs.push("Print height must be > 0.");
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    const now = new Date().toISOString();
    const template: ProductTemplate = {
      id: editingTemplate?.id ?? crypto.randomUUID(),
      name: name.trim(),
      brand: brand.trim(),
      capacity: capacity.trim(),
      laserType,
      productType,
      thumbnailDataUrl: thumbDataUrl,
      productPhotoFullUrl: productPhotoFullUrl || undefined,
      glbPath,
      dimensions: {
        diameterMm,
        printHeightMm,
        templateWidthMm,
        handleArcDeg,
        taperCorrection,
      },
      laserSettings: {
        power,
        speed,
        frequency,
        lineInterval,
        materialProfileId,
        rotaryPresetId,
      },
      createdAt: editingTemplate?.createdAt ?? now,
      updatedAt: now,
      builtIn: editingTemplate?.builtIn ?? false,
      tumblerMapping,
      frontPhotoDataUrl: frontPhotoDataUrl || undefined,
      backPhotoDataUrl: backPhotoDataUrl || undefined,
    };

    if (isEdit) {
      updateTemplate(template.id, template);
    } else {
      saveTemplate(template);
    }
    onSave(template);
  };

  return (
    <div className={styles.form}>
      {/* ── Product identity ──────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product identity</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product name *</label>
          <input
            className={styles.textInput}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="YETI Rambler 40oz"
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Brand</label>
          <input
            className={styles.textInput}
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="YETI"
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Capacity</label>
          <input
            className={styles.textInput}
            type="text"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="40oz"
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Laser type</label>
          <select
            className={styles.selectInput}
            value={laserType}
            onChange={(e) => setLaserType(e.target.value as "fiber" | "co2" | "diode")}
          >
            <option value="fiber">Fiber</option>
            <option value="co2">CO₂</option>
            <option value="diode">Diode</option>
          </select>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product type</label>
          <select
            className={styles.selectInput}
            value={productType}
            onChange={(e) => setProductType(e.target.value as "tumbler" | "mug" | "bottle" | "flat")}
          >
            <option value="tumbler">Tumbler</option>
            <option value="mug">Mug</option>
            <option value="bottle">Bottle</option>
            <option value="flat">Flat</option>
          </select>
        </div>
      </div>

      {/* ── Product image + auto-detect ──────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product image</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product photo</label>
          <div className={styles.thumbRow}>
            <div className={styles.thumbDropZone}>
              <FileDropZone
                accept="image/*"
                fileName={productImageFile?.name ?? null}
                onFileSelected={(f) => void handleProductImage(f)}
                onClear={() => {
                  setProductImageFile(null);
                  setDetectResult(null);
                  setDetectError(null);
                }}
              />
            </div>
            {thumbDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={thumbDataUrl}
                alt="Thumbnail preview"
                className={styles.thumbPreview}
              />
            )}
          </div>
        </div>

        {productImageFile && !detectResult && (
          <button
            type="button"
            className={styles.detectBtn}
            onClick={() => void handleAutoDetect()}
            disabled={detecting}
          >
            {detecting ? "Detecting\u2026" : "Auto-detect product specs"}
          </button>
        )}

        {detectResult && (
          <div className={styles.detectBanner}>
            <span className={styles.detectBannerText}>
              Detected: <strong>{name || "Unknown product"}</strong> — review and confirm
            </span>
            <button
              type="button"
              className={styles.detectRerunBtn}
              onClick={() => void handleAutoDetect()}
              disabled={detecting}
            >
              {detecting ? "Re-detecting\u2026" : "Re-detect"}
            </button>
          </div>
        )}

        {detectError && (
          <div className={styles.detectErrorBanner}>
            {detectError} — fill in manually below.
          </div>
        )}
      </div>

      {/* ── Front / Back face photos ─────────────────────────────── */}
      {productType !== "flat" && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Face photos (grid overlay)</div>

          {/* ── FRONT ── */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Front face</label>
            <div className={styles.thumbRow}>
              <div className={styles.thumbDropZone}>
                <FileDropZone
                  accept="image/*"
                  fileName={frontPhotoDataUrl ? "front-photo" : null}
                  label="Drop front photo"
                  hint="Auto background removal"
                  onFileSelected={async (f) => {
                    const original = await fileToFacePhotoDataUrl(f);
                    if (!original) return;
                    setFrontOriginalUrl(original);
                    setFrontCleanUrl("");
                    setFrontPhotoDataUrl(original);
                    setFrontUseOriginal(false);
                    setMirrorForBack(true);
                    setFrontBgStatus("idle");
                  }}
                  onClear={() => { setFrontPhotoDataUrl(""); setFrontOriginalUrl(""); setFrontCleanUrl(""); setFrontBgStatus("idle"); }}
                />
              </div>
              {frontPhotoDataUrl && (
                <div className={styles.bgPreviewGroup}>
                  <div className={styles.bgPreviewItem}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frontPhotoDataUrl} alt="Front" className={styles.thumbPreview} />
                    {frontBgStatus === "done" && <span className={styles.bgPreviewLabelDone}>BG removed</span>}
                  </div>
                  {frontBgStatus === "idle" && (
                    <button
                      type="button"
                      className={styles.bgRemoveBtn}
                      onClick={async () => {
                        setFrontBgStatus("processing");
                        try {
                          const res = await fetch(frontPhotoDataUrl);
                          const blob = await res.blob();
                          const { removeBackground } = await import("@imgly/background-removal");
                          const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const url = reader.result as string;
                            if (url) {
                              setFrontCleanUrl(url);
                              setFrontPhotoDataUrl(url);
                              setFrontBgStatus("done");
                            } else {
                              setFrontBgStatus("failed");
                            }
                          };
                          reader.onerror = () => setFrontBgStatus("failed");
                          reader.readAsDataURL(clean);
                        } catch {
                          setFrontBgStatus("failed");
                        }
                      }}
                    >
                      Remove background
                    </button>
                  )}
                  {frontBgStatus === "processing" && (
                    <span className={styles.bgProcessing}>Removing background…</span>
                  )}
                  {frontBgStatus === "done" && frontCleanUrl && (
                    <label className={styles.bgToggle}>
                      <input type="checkbox" checked={frontUseOriginal}
                        onChange={(e) => {
                          setFrontUseOriginal(e.target.checked);
                          setFrontPhotoDataUrl(e.target.checked ? frontOriginalUrl : frontCleanUrl);
                        }}
                      /> Use original
                    </label>
                  )}
                  {frontBgStatus === "failed" && (
                    <span className={styles.bgFailed}>BG removal failed — using original</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Front captured prompt ── */}
          {frontPhotoDataUrl && !backPhotoDataUrl && !mirrorForBack && (
            <div className={styles.frontCapturedBanner}>
              <div className={styles.frontCapturedTitle}>Front photo captured</div>
              <div className={styles.frontCapturedHint}>
                For two-sided placement, add a back photo or enable mirror below.
              </div>
            </div>
          )}

          {/* ── Mirror for back toggle ── */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} />
            <label className={styles.mirrorToggle}>
              <input
                type="checkbox"
                checked={mirrorForBack}
                onChange={(e) => {
                  setMirrorForBack(e.target.checked);
                  if (e.target.checked) {
                    // Clear manual back photo state when switching to mirror
                    setBackOriginalUrl("");
                    setBackCleanUrl("");
                    setBackBgStatus("idle");
                    setBackUseOriginal(false);
                  }
                }}
              />
              <span>Use mirrored front photo for back side</span>
            </label>
          </div>

          {/* ── BACK — manual upload (hidden when mirroring) ── */}
          {!mirrorForBack && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Back face</label>
              <div className={styles.thumbRow}>
                <div className={`${styles.thumbDropZone} ${frontPhotoDataUrl && !backPhotoDataUrl ? styles.backDropHighlight : ""}`}>
                  <FileDropZone
                    accept="image/*"
                    fileName={backPhotoDataUrl ? "back-photo" : null}
                    label="Drop back photo"
                    hint={frontPhotoDataUrl ? "Rotate tumbler 180° and photograph" : "Auto background removal"}
                    onFileSelected={async (f) => {
                      const original = await fileToFacePhotoDataUrl(f);
                      if (!original) return;
                      setBackOriginalUrl(original);
                      setBackCleanUrl("");
                      setBackPhotoDataUrl(original);
                      setBackUseOriginal(false);
                      setBackBgStatus("idle");
                    }}
                    onClear={() => { setBackPhotoDataUrl(""); setBackOriginalUrl(""); setBackCleanUrl(""); setBackBgStatus("idle"); }}
                  />
                </div>
                {backPhotoDataUrl && (
                  <div className={styles.bgPreviewGroup}>
                    <div className={styles.bgPreviewItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={backPhotoDataUrl} alt="Back" className={styles.thumbPreview} />
                      {backBgStatus === "done" && <span className={styles.bgPreviewLabelDone}>BG removed</span>}
                    </div>
                    {backBgStatus === "idle" && (
                      <button
                        type="button"
                        className={styles.bgRemoveBtn}
                        onClick={async () => {
                          setBackBgStatus("processing");
                          try {
                            const res = await fetch(backPhotoDataUrl);
                            const blob = await res.blob();
                            const { removeBackground } = await import("@imgly/background-removal");
                            const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const url = reader.result as string;
                              if (url) {
                                setBackCleanUrl(url);
                                setBackPhotoDataUrl(url);
                                setBackBgStatus("done");
                              } else {
                                setBackBgStatus("failed");
                              }
                            };
                            reader.onerror = () => setBackBgStatus("failed");
                            reader.readAsDataURL(clean);
                          } catch {
                            setBackBgStatus("failed");
                          }
                        }}
                      >
                        Remove background
                      </button>
                    )}
                    {backBgStatus === "processing" && (
                      <span className={styles.bgProcessing}>Removing background…</span>
                    )}
                    {backBgStatus === "done" && backCleanUrl && (
                      <label className={styles.bgToggle}>
                        <input type="checkbox" checked={backUseOriginal}
                          onChange={(e) => {
                            setBackUseOriginal(e.target.checked);
                            setBackPhotoDataUrl(e.target.checked ? backOriginalUrl : backCleanUrl);
                          }}
                        /> Use original
                      </label>
                    )}
                    {backBgStatus === "failed" && (
                      <span className={styles.bgFailed}>BG removal failed — using original</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Mirror preview (when mirroring is on) ── */}
          {mirrorForBack && backPhotoDataUrl && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Back (mirrored)</label>
              <div className={styles.bgPreviewGroup}>
                <div className={styles.bgPreviewItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={backPhotoDataUrl} alt="Mirrored back" className={styles.thumbPreview} />
                  <span className={styles.bgPreviewLabel}>Auto-mirrored</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3D Model file ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>3D Model</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>GLB / GLTF file</label>
          <div className={styles.glbRow}>
            <FileDropZone
              accept=".glb,.gltf"
              fileName={glbUploading ? "Uploading\u2026" : glbFileName}
              label="Drop GLB or GLTF file here"
              hint="3D model file for preview"
              onFileSelected={(f) => void handleGlbFile(f)}
              onClear={() => {
                setGlbFileName(null);
                setGlbPath("");
                setGlbUploadError(null);
              }}
            />
            {glbPath && !glbUploading && (
              <span className={styles.glbPathConfirm}>
                {glbPath} ✓
              </span>
            )}
            {glbUploadError && (
              <span className={styles.error}>{glbUploadError}</span>
            )}
            <input
              className={styles.textInput}
              type="text"
              value={glbPath}
              onChange={(e) => setGlbPath(e.target.value)}
              placeholder="/models/templates/my-model.glb"
            />
          </div>
        </div>

        {glbPath && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Orientation</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className={styles.detectBtn}
                onClick={() => setShowMappingWizard(true)}
              >
                {tumblerMapping?.isMapped ? "Re-map orientation" : "Map tumbler orientation"}
              </button>
              {tumblerMapping?.isMapped && (
                <span className={styles.glbPathConfirm}>
                  Mapped ({((tumblerMapping.frontFaceRotation * 180) / Math.PI).toFixed(0)}&deg;) &#x2713;
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Physical dimensions ───────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Physical dimensions</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Diameter (mm) *</label>
          <input
            className={styles.numInput}
            type="number"
            value={diameterMm || ""}
            step={0.1}
            onChange={(e) => setDiameterMm(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Print height (mm) *</label>
          <input
            className={styles.numInput}
            type="number"
            value={printHeightMm || ""}
            step={0.1}
            onChange={(e) => setPrintHeightMm(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Template width</label>
          <span className={styles.readOnly}>
            {templateWidthMm > 0 ? `${templateWidthMm} mm` : "\u2014"}{" "}
            <span className={styles.fieldHint}>(auto-calculated)</span>
          </span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Handle arc (&deg;)</label>
          <input
            className={styles.numInput}
            type="number"
            value={handleArcDeg}
            step={1}
            min={0}
            max={360}
            onChange={(e) => setHandleArcDeg(Number(e.target.value) || 0)}
          />
          <span className={styles.fieldHint}>0 = no handle, 90 = YETI Rambler style</span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Taper correction</label>
          <select
            className={styles.selectInput}
            value={taperCorrection}
            onChange={(e) => setTaperCorrection(e.target.value as "none" | "top-narrow" | "bottom-narrow")}
          >
            <option value="none">None</option>
            <option value="top-narrow">Top narrow</option>
            <option value="bottom-narrow">Bottom narrow</option>
          </select>
        </div>
      </div>

      {/* ── Default laser settings ────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Default laser settings</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Power (%)</label>
          <input
            className={styles.numInput}
            type="number"
            value={power}
            step={1}
            min={0}
            max={100}
            onChange={(e) => setPower(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Speed (mm/s)</label>
          <input
            className={styles.numInput}
            type="number"
            value={speed}
            step={10}
            min={0}
            onChange={(e) => setSpeed(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Frequency (kHz)</label>
          <input
            className={styles.numInput}
            type="number"
            value={frequency}
            step={1}
            min={0}
            onChange={(e) => setFrequency(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Line interval (mm)</label>
          <input
            className={styles.numInput}
            type="number"
            value={lineInterval}
            step={0.01}
            min={0}
            onChange={(e) => setLineInterval(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Material profile</label>
          <select
            className={styles.selectInput}
            value={materialProfileId}
            onChange={(e) => setMaterialProfileId(e.target.value)}
          >
            <option value="">None</option>
            {KNOWN_MATERIAL_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Rotary preset</label>
          <select
            className={styles.selectInput}
            value={rotaryPresetId}
            onChange={(e) => setRotaryPresetId(e.target.value)}
          >
            <option value="">None</option>
            {DEFAULT_ROTARY_PLACEMENT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Errors ────────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div>
          {errors.map((err) => (
            <div key={err} className={styles.error}>{err}</div>
          ))}
        </div>
      )}

      {/* ── Buttons ───────────────────────────────────────────────── */}
      <div className={styles.btnRow}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.saveBtn} onClick={handleSave}>
          {isEdit ? "Save changes" : "Save template"}
        </button>
      </div>

      {/* ── Tumbler mapping wizard modal ── */}
      {showMappingWizard && glbPath && (
        <TumblerMappingWizard
          glbPath={glbPath}
          diameterMm={diameterMm}
          printHeightMm={printHeightMm}
          productType={productType}
          existingMapping={tumblerMapping}
          handleArcDeg={handleArcDeg}
          onSave={(mapping) => {
            setTumblerMapping(mapping);
            setHandleArcDeg(mapping.handleArcDeg);
            setShowMappingWizard(false);
          }}
          onCancel={() => setShowMappingWizard(false)}
        />
      )}
    </div>
  );
}
