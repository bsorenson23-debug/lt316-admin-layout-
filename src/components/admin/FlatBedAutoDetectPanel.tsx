"use client";

import React from "react";
import {
  FLAT_BED_ITEMS,
  FLAT_BED_CATEGORIES,
  FLAT_BED_CATEGORY_LABELS,
  type FlatBedItem,
  type FlatBedCategory,
} from "@/data/flatBedItems";
import type { FlatBedAutoDetectResponse, FlatBedConfidenceLevel } from "@/server/flatbed/runFlatBedAutoDetect";
import type { BedMockupConfig } from "./LaserBedWorkspace";
import styles from "./FlatBedAutoDetectPanel.module.css";

interface Props {
  onApplyItem: (item: FlatBedItem, imageSrc?: string, imageNaturalWidth?: number, imageNaturalHeight?: number) => void;
  onSetMockup?: (config: BedMockupConfig | null) => void;
  onClearItemOverlay?: () => void;
  mockupActive?: boolean;
}

type DetectStatus = "idle" | "loading" | "success" | "error";

interface PanelState {
  status: DetectStatus;
  result: FlatBedAutoDetectResponse | null;
  error: string | null;
}

const INITIAL_STATE: PanelState = {
  status: "idle",
  result: null,
  error: null,
};

// Override state that the user can edit after detection
interface OverrideDraft {
  category: FlatBedCategory | "";
  itemId: string;
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
}

function toNullableNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function getErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as Record<string, unknown>).error === "string"
  ) {
    return (payload as Record<string, string>).error;
  }
  return "Auto-detect failed. Please retry.";
}

const CONFIDENCE_BADGE_CLASS: Record<FlatBedConfidenceLevel, string> = {
  high:   styles.confidenceHigh,
  medium: styles.confidenceMedium,
  low:    styles.confidenceLow,
};

function buildApplyItem(
  result: FlatBedAutoDetectResponse,
  draft: OverrideDraft
): FlatBedItem | null {
  // If user selected a known item from the catalog, use it (with dimension overrides applied)
  const catalogItem = draft.itemId
    ? FLAT_BED_ITEMS.find((i) => i.id === draft.itemId) ?? null
    : result.matchedItem;

  if (!catalogItem) return null;

  return {
    ...catalogItem,
    widthMm:     draft.widthMm     ?? catalogItem.widthMm,
    heightMm:    draft.heightMm    ?? catalogItem.heightMm,
    thicknessMm: draft.thicknessMm ?? catalogItem.thicknessMm,
  };
}

export function FlatBedAutoDetectPanel({ onApplyItem, onSetMockup, onClearItemOverlay, mockupActive }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = React.useState<File | null>(null);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = React.useState<{ w: number; h: number } | null>(null);
  const [state, setState] = React.useState<PanelState>(INITIAL_STATE);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [overrideDraft, setOverrideDraft] = React.useState<OverrideDraft | null>(null);

  // Background removal state (client-side @imgly)
  const [bgRemovedSrc, setBgRemovedSrc] = React.useState<string | null>(null);
  const [bgRemovalStatus, setBgRemovalStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");

  // BiRefNet (Replicate server-side — higher quality)
  const [biRefNetStatus, setBiRefNetStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [biRefNetError, setBiRefNetError] = React.useState<string | null>(null);

  // SAM2 surface segmentation
  const [sam2Status, setSam2Status] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [sam2ClickMode, setSam2ClickMode] = React.useState(false);
  const [sam2MaskSrc, setSam2MaskSrc] = React.useState<string | null>(null);
  const [sam2Error, setSam2Error] = React.useState<string | null>(null);
  const imagePreviewRef = React.useRef<HTMLImageElement>(null);

  // URL input state
  const [urlInput, setUrlInput] = React.useState("");
  const [urlLoading, setUrlLoading] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  // Mockup calibration state
  const [mockupOpen, setMockupOpen] = React.useState(false);
  const [mockupTop, setMockupTop] = React.useState(12);
  const [mockupBottom, setMockupBottom] = React.useState(88);
  const [mockupOpacity, setMockupOpacity] = React.useState(35);

  const runBgRemoval = React.useCallback(async (file: File) => {
    setBgRemovedSrc(null);
    setBgRemovalStatus("running");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(file);
      const url = URL.createObjectURL(blob);
      setBgRemovedSrc(url);
      setBgRemovalStatus("done");
    } catch {
      setBgRemovalStatus("error");
    }
  }, []);

  // ── BiRefNet background removal (Replicate, server-side) ──────────────────
  const runBiRefNet = React.useCallback(async () => {
    if (!selectedImage) return;
    setBiRefNetStatus("running");
    setBiRefNetError(null);
    try {
      const fd = new FormData();
      fd.set("image", selectedImage);
      const res = await fetch("/api/admin/image/remove-bg", { method: "POST", body: fd });
      const data = await res.json() as { dataUrl?: string; error?: string };
      if (!res.ok || !data.dataUrl) throw new Error(data.error ?? "BiRefNet failed");
      setBgRemovedSrc(data.dataUrl);
      setBiRefNetStatus("done");
      setBgRemovalStatus("done"); // share the same result slot
    } catch (err) {
      setBiRefNetError(err instanceof Error ? err.message : "BiRefNet failed");
      setBiRefNetStatus("error");
    }
  }, [selectedImage]);

  // ── SAM2 surface segmentation ─────────────────────────────────────────────
  const handleImageClick = React.useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sam2ClickMode || !selectedImage) return;
    setSam2ClickMode(false);
    setSam2Status("running");
    setSam2Error(null);

    const imgEl = e.currentTarget;
    const rect  = imgEl.getBoundingClientRect();
    // Convert click to pixel coords relative to natural image size
    const scaleX = imgEl.naturalWidth  / rect.width;
    const scaleY = imgEl.naturalHeight / rect.height;
    const px = Math.round((e.clientX - rect.left) * scaleX);
    const py = Math.round((e.clientY - rect.top)  * scaleY);

    try {
      const fd = new FormData();
      fd.set("image",  selectedImage);
      fd.set("points", JSON.stringify([[px, py]]));
      fd.set("labels", JSON.stringify([1])); // 1 = foreground
      const res  = await fetch("/api/admin/image/segment", { method: "POST", body: fd });
      const data = await res.json() as { maskDataUrl?: string; error?: string };
      if (!res.ok || !data.maskDataUrl) throw new Error(data.error ?? "SAM2 failed");
      setSam2MaskSrc(data.maskDataUrl);
      setSam2Status("done");
    } catch (err) {
      setSam2Error(err instanceof Error ? err.message : "SAM2 segmentation failed");
      setSam2Status("error");
    }
  }, [sam2ClickMode, selectedImage]);

  const loadImageFromUrl = React.useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlLoading(true);
    setUrlError(null);
    onSetMockup?.(null);
    setMockupOpen(false);
    setState(INITIAL_STATE);
    setOverrideDraft(null);
    try {
      const res = await fetch("/api/admin/flatbed/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { dataUrl?: string; mimeType?: string; byteLength?: number; error?: string };
      if (!res.ok || !data.dataUrl) throw new Error(data.error ?? "Failed to load image.");
      setImageSrc(data.dataUrl);
      const img = new window.Image();
      img.onload = () => setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = data.dataUrl;
      // Create a synthetic File for auto-detect
      const blob = await fetch(data.dataUrl).then(r => r.blob());
      const name = url.split("/").pop()?.split("?")[0] ?? "image.jpg";
      const file = new File([blob], name, { type: data.mimeType ?? "image/jpeg" });
      setSelectedImage(file);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Failed to load image from URL.");
    } finally {
      setUrlLoading(false);
    }
  }, [urlInput, onSetMockup]);

  const runAutoDetect = React.useCallback(async (file: File) => {
    setState({ status: "loading", result: null, error: null });
    // Kick off background removal in parallel — don't await
    void runBgRemoval(file);

    const formData = new FormData();
    formData.set("image", file);

    try {
      const response = await fetch("/api/admin/flatbed/auto-detect", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as FlatBedAutoDetectResponse | { error?: string };

      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      const result = payload as FlatBedAutoDetectResponse;

      // Seed the override draft from the detection result
      const detectedCategory = (result.vision.category ?? "") as FlatBedCategory | "";
      const detectedItemId = result.matchedItemId ?? "";
      setOverrideDraft({
        category:    detectedCategory,
        itemId:      detectedItemId,
        widthMm:     result.vision.widthMm     ?? result.matchedItem?.widthMm     ?? null,
        heightMm:    result.vision.heightMm    ?? result.matchedItem?.heightMm    ?? null,
        thicknessMm: result.vision.thicknessMm ?? result.matchedItem?.thicknessMm ?? null,
      });

      setState({ status: "success", result, error: null });
      // Auto-open override when AI confidence is low so user can correct it
      if (result.confidence === "low") setOverrideOpen(true);
    } catch (error) {
      setState({
        status: "error",
        result: null,
        error: error instanceof Error ? error.message : "Auto-detect failed.",
      });
    }
  }, []);

  // Items filtered by the currently selected override category
  const filteredItems = React.useMemo(() => {
    if (!overrideDraft?.category) return FLAT_BED_ITEMS;
    return FLAT_BED_ITEMS.filter((item) => item.category === overrideDraft.category);
  }, [overrideDraft?.category]);

  const canApply =
    state.status === "success" &&
    overrideDraft !== null &&
    (overrideDraft.itemId
      ? FLAT_BED_ITEMS.some((i) => i.id === overrideDraft.itemId)
      : state.result?.matchedItem !== null);

  const handleApply = () => {
    if (!state.result || !overrideDraft) return;
    const item = buildApplyItem(state.result, overrideDraft);
    if (!item) return;
    // Prefer bg-removed image; fall back to original
    const finalSrc = bgRemovedSrc ?? imageSrc ?? undefined;
    onApplyItem(item, finalSrc, imageNaturalSize?.w, imageNaturalSize?.h);
  };

  const updateOverride = (patch: Partial<OverrideDraft>) => {
    setOverrideDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleClear = () => {
    setSelectedImage(null);
    setImageSrc(null);
    setImageNaturalSize(null);
    setState(INITIAL_STATE);
    setOverrideDraft(null);
    setOverrideOpen(false);
    setUrlInput("");
    setUrlError(null);
    setMockupOpen(false);
    setBgRemovedSrc(null);
    setBgRemovalStatus("idle");
    setBiRefNetStatus("idle");
    setBiRefNetError(null);
    setSam2Status("idle");
    setSam2ClickMode(false);
    setSam2MaskSrc(null);
    setSam2Error(null);
    onSetMockup?.(null);
    onClearItemOverlay?.();
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Auto Detect Flat Bed Item</span>
      </div>

      <div className={styles.body}>
        <div className={styles.sectionLabel}>Upload Image or Paste URL</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = ""; // reset so same file can be re-selected
            setSelectedImage(file);
            setImageSrc(null);
            setImageNaturalSize(null);
            setOverrideDraft(null);
            setState(INITIAL_STATE);
            setBgRemovedSrc(null);
            setBgRemovalStatus("idle");
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                const src = ev.target?.result as string;
                if (!src) return;
                setImageSrc(src);
                const img = new window.Image();
                img.onload = () => setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                img.src = src;
              };
              reader.readAsDataURL(file);
            }
            // Clear any active mockup when a new image is loaded
            onSetMockup?.(null);
            setMockupOpen(false);
          }}
        />
        <button
          type="button"
          className={styles.uploadBtn}
          onClick={() => inputRef.current?.click()}
        >
          + Upload Image
        </button>
        <div className={styles.fileName}>
          {selectedImage?.name ?? "No image selected"}
        </div>

        <div className={styles.urlRow}>
          <input
            type="url"
            className={styles.urlInput}
            placeholder="Or paste image URL…"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void loadImageFromUrl(); }}
          />
          <button
            className={styles.urlLoadBtn}
            onClick={() => void loadImageFromUrl()}
            disabled={!urlInput.trim() || urlLoading}
            type="button"
          >{urlLoading ? "…" : "Load"}</button>
        </div>
        {urlError && <div className={styles.error}>{urlError}</div>}

        <div className={styles.actionRow}>
          <button
            className={`${styles.primaryBtn} ${state.status === "loading" ? styles.primaryBtnLoading : ""}`}
            disabled={!selectedImage || state.status === "loading"}
            onClick={() => {
              if (selectedImage) void runAutoDetect(selectedImage);
            }}
          >
            {state.status === "loading" ? "Detecting…" : "Run Auto-Detect"}
          </button>
          <button
            className={styles.clearBtn}
            type="button"
            disabled={!selectedImage && !urlInput && state.status === "idle"}
            onClick={handleClear}
          >
            Clear
          </button>
        </div>

        {bgRemovalStatus === "running" && (
          <div className={styles.bgStatus}>✂ Removing background…</div>
        )}
        {bgRemovalStatus === "done" && (
          <div className={styles.bgStatusDone}>✓ Background removed</div>
        )}

        {/* ── Replicate AI tools — visible once image is loaded ── */}
        {selectedImage && imageSrc && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>

            {/* Image preview — clickable when SAM2 click mode is active */}
            <div style={{ position: "relative", display: "inline-block" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imagePreviewRef}
                src={bgRemovedSrc ?? imageSrc}
                alt="preview"
                onClick={sam2ClickMode ? handleImageClick : undefined}
                style={{
                  width: "100%", borderRadius: 4, display: "block",
                  cursor: sam2ClickMode ? "crosshair" : "default",
                  outline: sam2ClickMode ? "2px solid #cc88ff" : "none",
                }}
              />
              {sam2MaskSrc && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={sam2MaskSrc} alt="SAM2 mask"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                           mixBlendMode: "screen", opacity: 0.7, borderRadius: 4,
                           pointerEvents: "none" }} />
              )}
              {sam2ClickMode && (
                <div style={{ position: "absolute", bottom: 4, left: 4, right: 4, fontSize: 9,
                              fontFamily: "monospace", color: "#cc88ff", textAlign: "center",
                              background: "rgba(20,0,40,0.75)", padding: "3px 6px", borderRadius: 3 }}>
                  Click the engravable surface
                </div>
              )}
              {sam2MaskSrc && !sam2ClickMode && (
                <div style={{ position: "absolute", top: 4, left: 4, fontSize: 9,
                              fontFamily: "monospace", color: "#cc88ff",
                              background: "rgba(0,0,0,0.6)", padding: "2px 5px", borderRadius: 3 }}>
                  SAM2 surface mask
                </div>
              )}
            </div>

            {/* BiRefNet button */}
            <button
              type="button"
              disabled={biRefNetStatus === "running"}
              onClick={() => void runBiRefNet()}
              style={{
                padding: "5px 10px", fontSize: 11, fontFamily: "monospace",
                background: biRefNetStatus === "done" ? "#0a3a1a" : "#0a1a2a",
                border: `1px solid ${biRefNetStatus === "done" ? "#1a6a2a" : "#1a4060"}`,
                color: biRefNetStatus === "done" ? "#4dbb6a" : "#5ab0d0",
                borderRadius: 4, cursor: biRefNetStatus === "running" ? "wait" : "pointer",
                textAlign: "left",
              }}
            >
              {biRefNetStatus === "running" ? "⏳ BiRefNet running…"
               : biRefNetStatus === "done"    ? "✓ BiRefNet — BG Removed"
               : "✦ Remove BG (BiRefNet / Replicate)"}
            </button>
            {biRefNetError && <div className={styles.error} style={{ fontSize: 10 }}>{biRefNetError}</div>}

            {/* SAM2 button */}
            <button
              type="button"
              disabled={sam2Status === "running"}
              onClick={() => setSam2ClickMode(c => !c)}
              style={{
                padding: "5px 10px", fontSize: 11, fontFamily: "monospace",
                background: sam2ClickMode  ? "#2a1a3a"
                          : sam2Status === "done" ? "#0a3a1a" : "#0a1a2a",
                border: `1px solid ${sam2ClickMode ? "#7a4aaa" : sam2Status === "done" ? "#1a6a2a" : "#1a4060"}`,
                color: sam2ClickMode  ? "#cc88ff"
                     : sam2Status === "done" ? "#4dbb6a" : "#5ab0d0",
                borderRadius: 4, cursor: "pointer", textAlign: "left",
              }}
            >
              {sam2Status === "running"  ? "⏳ SAM2 segmenting…"
               : sam2Status === "done"   ? "✓ SAM2 — Surface Segmented"
               : sam2ClickMode           ? "🖱 Click image above…"
               : "✦ Identify Surface (SAM2 / Replicate)"}
            </button>
            {sam2Error && <div className={styles.error} style={{ fontSize: 10 }}>{sam2Error}</div>}
          </div>
        )}

        {state.status === "idle" && bgRemovalStatus === "idle" && !selectedImage && (
          <div className={styles.hint}>
            Upload one product image, then run auto-detect.
          </div>
        )}

        {state.status === "error" && (
          <div className={styles.error}>{state.error}</div>
        )}

        {/* ── Mockup toggle — appears once an image is loaded ── */}
        {imageSrc && imageNaturalSize && (
          <>
            <button
              className={`${styles.mockupToggleBtn} ${mockupActive ? styles.mockupToggleBtnActive : ""}`}
              onClick={() => {
                if (mockupActive) {
                  onSetMockup?.(null);
                  setMockupOpen(false);
                } else {
                  setMockupOpen((o) => !o);
                }
              }}
            >
              {mockupActive ? "Mockup On — Click to Hide" : "Show Mockup on Bed"}
            </button>

            {mockupOpen && !mockupActive && (
              <div className={styles.mockupCalibration}>
                <div className={styles.mockupPreviewWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageSrc} alt="" className={styles.mockupPreviewImg} />
                  <div
                    className={styles.mockupZoneOverlay}
                    style={{ top: `${mockupTop}%`, height: `${mockupBottom - mockupTop}%` }}
                  />
                  <div className={styles.mockupLineTop} style={{ top: `${mockupTop}%` }} />
                  <div className={styles.mockupLineBottom} style={{ top: `${mockupBottom}%` }} />
                </div>

                <label className={styles.mockupSliderRow}>
                  <span className={styles.mockupSliderLabel}>Print top</span>
                  <input
                    type="range" min={0} max={mockupBottom - 1} value={mockupTop}
                    onChange={(e) => setMockupTop(Number(e.target.value))}
                    className={styles.mockupSlider}
                  />
                  <span className={styles.mockupSliderVal}>{mockupTop}%</span>
                </label>

                <label className={styles.mockupSliderRow}>
                  <span className={styles.mockupSliderLabel}>Print bottom</span>
                  <input
                    type="range" min={mockupTop + 1} max={100} value={mockupBottom}
                    onChange={(e) => setMockupBottom(Number(e.target.value))}
                    className={styles.mockupSlider}
                  />
                  <span className={styles.mockupSliderVal}>{mockupBottom}%</span>
                </label>

                <label className={styles.mockupSliderRow}>
                  <span className={styles.mockupSliderLabel}>Opacity</span>
                  <input
                    type="range" min={10} max={80} value={mockupOpacity}
                    onChange={(e) => setMockupOpacity(Number(e.target.value))}
                    className={styles.mockupSlider}
                  />
                  <span className={styles.mockupSliderVal}>{mockupOpacity}%</span>
                </label>

                <button
                  className={styles.mockupApplyBtn}
                  onClick={() => {
                    onSetMockup?.({
                      src: imageSrc,
                      naturalWidth: imageNaturalSize.w,
                      naturalHeight: imageNaturalSize.h,
                      printTopPct: mockupTop / 100,
                      printBottomPct: mockupBottom / 100,
                      opacity: mockupOpacity / 100,
                    });
                    setMockupOpen(false);
                  }}
                >Apply to Bed</button>
              </div>
            )}
          </>
        )}

        {/* ── Detection results ── */}
        {state.status === "success" && state.result && overrideDraft && (
          <>
            <div className={styles.sectionLabel}>Detected Product</div>

            <div className={styles.readRow}>
              <span>Category</span>
              <span>
                {state.result.vision.category
                  ? FLAT_BED_CATEGORY_LABELS[state.result.vision.category as FlatBedCategory] ?? state.result.vision.category
                  : "Unknown"}
              </span>
            </div>

            <div className={styles.readRow}>
              <span>Item</span>
              <span>{state.result.vision.label ?? state.result.matchedItem?.label ?? "Unknown"}</span>
            </div>

            <div className={styles.readRow}>
              <span>Material</span>
              <span>{state.result.vision.material ?? state.result.matchedItem?.materialLabel ?? "Unknown"}</span>
            </div>

            <div className={styles.readRow}>
              <span>Dimensions</span>
              <span>
                {[
                  overrideDraft.widthMm != null ? `${overrideDraft.widthMm}` : null,
                  overrideDraft.heightMm != null ? `${overrideDraft.heightMm}` : null,
                  overrideDraft.thicknessMm != null ? `${overrideDraft.thicknessMm}` : null,
                ]
                  .filter(Boolean)
                  .join(" × ") || "Unknown"}{" "}
                {overrideDraft.widthMm != null ? "mm" : ""}
              </span>
            </div>

            <ConfidenceBadgeRow
              label="Confidence"
              value={state.result.vision.confidence}
              level={state.result.confidence}
            />

            <button
              className={styles.overrideToggle}
              onClick={() => setOverrideOpen((o) => !o)}
              type="button"
            >
              <span>Override Values</span>
              <span>{overrideOpen ? "▾" : "▸"}</span>
            </button>

            {overrideOpen && (
              <>
                <OverrideRow label="Category">
                  <select
                    className={styles.select}
                    value={overrideDraft.category}
                    onChange={(e) => {
                      const cat = e.target.value as FlatBedCategory | "";
                      updateOverride({ category: cat, itemId: "" });
                    }}
                  >
                    <option value="">All Categories</option>
                    {FLAT_BED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {FLAT_BED_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </OverrideRow>

                <OverrideRow label="Item">
                  <select
                    className={styles.select}
                    value={overrideDraft.itemId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const item = FLAT_BED_ITEMS.find((i) => i.id === id) ?? null;
                      updateOverride({
                        itemId: id,
                        widthMm:     item?.widthMm     ?? overrideDraft.widthMm,
                        heightMm:    item?.heightMm    ?? overrideDraft.heightMm,
                        thicknessMm: item?.thicknessMm ?? overrideDraft.thicknessMm,
                      });
                    }}
                  >
                    <option value="">Auto / None</option>
                    {filteredItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </OverrideRow>

                <OverrideRow label="Width mm">
                  <input
                    type="number"
                    className={styles.numInput}
                    value={overrideDraft.widthMm ?? ""}
                    step={0.1}
                    onChange={(e) => updateOverride({ widthMm: toNullableNumber(e.target.value) })}
                  />
                </OverrideRow>

                <OverrideRow label="Height mm">
                  <input
                    type="number"
                    className={styles.numInput}
                    value={overrideDraft.heightMm ?? ""}
                    step={0.1}
                    onChange={(e) => updateOverride({ heightMm: toNullableNumber(e.target.value) })}
                  />
                </OverrideRow>

                <OverrideRow label="Thickness mm">
                  <input
                    type="number"
                    className={styles.numInput}
                    value={overrideDraft.thicknessMm ?? ""}
                    step={0.1}
                    onChange={(e) => updateOverride({ thicknessMm: toNullableNumber(e.target.value) })}
                  />
                </OverrideRow>
              </>
            )}

            <div className={styles.actionRow}>
              <button
                className={styles.secondaryBtn}
                disabled={!selectedImage}
                onClick={() => {
                  if (selectedImage) void runAutoDetect(selectedImage);
                }}
              >
                Retry
              </button>
              <button
                className={styles.primaryBtn}
                disabled={!canApply}
                onClick={handleApply}
              >
                Apply
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ConfidenceBadgeRow({
  label,
  value,
  level,
}: {
  label: string;
  value: number;
  level: FlatBedConfidenceLevel;
}) {
  const badgeLabel = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <div className={styles.readRow}>
      <span>{label}</span>
      <span className={styles.confidenceBadgeWrap}>
        <span className={`${styles.confidenceBadge} ${CONFIDENCE_BADGE_CLASS[level]}`}>
          {badgeLabel}
        </span>
        <span className={styles.confidencePct}>{(value * 100).toFixed(0)}%</span>
      </span>
    </div>
  );
}

function OverrideRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.overrideRow}>
      <span className={styles.overrideLabel}>{label}</span>
      {children}
    </div>
  );
}
