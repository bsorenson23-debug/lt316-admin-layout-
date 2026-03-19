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
  onApplyItem: (item: FlatBedItem) => void;
  onSetMockup?: (config: BedMockupConfig | null) => void;
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

export function FlatBedAutoDetectPanel({ onApplyItem, onSetMockup, mockupActive }: Props) {
  const [selectedImage, setSelectedImage] = React.useState<File | null>(null);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = React.useState<{ w: number; h: number } | null>(null);
  const [state, setState] = React.useState<PanelState>(INITIAL_STATE);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [overrideDraft, setOverrideDraft] = React.useState<OverrideDraft | null>(null);

  // Mockup calibration state
  const [mockupOpen, setMockupOpen] = React.useState(false);
  const [mockupTop, setMockupTop] = React.useState(12);
  const [mockupBottom, setMockupBottom] = React.useState(88);
  const [mockupOpacity, setMockupOpacity] = React.useState(35);

  const runAutoDetect = React.useCallback(async (file: File) => {
    setState({ status: "loading", result: null, error: null });

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
    if (item) onApplyItem(item);
  };

  const updateOverride = (patch: Partial<OverrideDraft>) => {
    setOverrideDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Auto Detect Flat Bed Item</span>
      </div>

      <div className={styles.body}>
        <div className={styles.sectionLabel}>Upload Image</div>
        <input
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setSelectedImage(file);
            setImageSrc(null);
            setImageNaturalSize(null);
            setOverrideDraft(null);
            setState(INITIAL_STATE);
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
        <div className={styles.fileName}>
          {selectedImage?.name ?? "No image selected"}
        </div>

        <button
          className={`${styles.primaryBtn} ${state.status === "loading" ? styles.primaryBtnLoading : ""}`}
          disabled={!selectedImage || state.status === "loading"}
          onClick={() => {
            if (selectedImage) void runAutoDetect(selectedImage);
          }}
        >
          {state.status === "loading" ? "Detecting…" : "Run Auto-Detect"}
        </button>

        {state.status === "idle" && (
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
