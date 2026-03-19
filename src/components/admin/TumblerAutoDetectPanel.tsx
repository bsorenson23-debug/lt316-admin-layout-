"use client";

import React from "react";
import { BedConfig } from "@/types/admin";
import {
  getTumblerProfileById,
  KNOWN_TUMBLER_PROFILES,
} from "@/data/tumblerProfiles";
import {
  TumblerAutoSizeResponse,
  TumblerAutoSizeState,
  TumblerConfidenceLevel,
  TumblerShapeType,
  TumblerSpecDraft,
} from "@/types/tumblerAutoSize";
import {
  calculateTumblerTemplate,
  getTumblerConfidenceLevel,
  toTumblerSpecDraft,
} from "@/utils/tumblerAutoSize";
import type { BedMockupConfig } from "./LaserBedWorkspace";
import styles from "./TumblerAutoDetectPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  onApplyDraft: (draft: TumblerSpecDraft) => void;
  onSetMockup?: (config: BedMockupConfig | null) => void;
  mockupActive?: boolean;
}

const INITIAL_STATE: TumblerAutoSizeState = {
  status: "idle",
  fileName: null,
  result: null,
  draft: null,
  error: null,
};

type BrandOverrideMode =
  | "auto"
  | "YETI"
  | "Stanley"
  | "RTIC"
  | "Ozark Trail"
  | "unknown";

const BRAND_OVERRIDE_OPTIONS: Array<{
  value: BrandOverrideMode;
  label: string;
}> = [
  { value: "auto", label: "Auto Detect" },
  { value: "YETI", label: "YETI" },
  { value: "Stanley", label: "Stanley" },
  { value: "RTIC", label: "RTIC" },
  { value: "Ozark Trail", label: "Ozark Trail" },
  { value: "unknown", label: "Generic / Unknown" },
];

type ValidationErrors = Partial<
  Record<
    | "outsideDiameterMm"
    | "topDiameterMm"
    | "bottomDiameterMm"
    | "overallHeightMm"
    | "usableHeightMm",
    string
  >
>;

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function withRecalculatedTemplate(draft: TumblerSpecDraft): TumblerSpecDraft {
  const calculation = calculateTumblerTemplate(draft);
  return {
    ...draft,
    shapeType: calculation.shapeType,
    templateWidthMm: calculation.templateWidthMm,
    templateHeightMm: calculation.templateHeightMm,
  };
}

function validateDraft(draft: TumblerSpecDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  const activeHeight = draft.usableHeightMm ?? draft.overallHeightMm;

  if (!isFinitePositive(activeHeight)) {
    errors.usableHeightMm = "Set usable or overall height.";
  }

  if (isFinitePositive(draft.usableHeightMm) && isFinitePositive(draft.overallHeightMm)) {
    if (draft.usableHeightMm > draft.overallHeightMm) {
      errors.usableHeightMm = "Usable height cannot exceed overall height.";
    }
  }

  if (draft.shapeType === "straight") {
    const diameter =
      draft.outsideDiameterMm ?? draft.topDiameterMm ?? draft.bottomDiameterMm;
    if (!isFinitePositive(diameter)) {
      errors.outsideDiameterMm = "Set outside diameter for straight tumblers.";
    }
  }

  if (draft.shapeType === "tapered") {
    const top = draft.topDiameterMm ?? draft.outsideDiameterMm;
    const bottom = draft.bottomDiameterMm ?? draft.outsideDiameterMm;
    if (!isFinitePositive(top)) {
      errors.topDiameterMm = "Set top diameter.";
    }
    if (!isFinitePositive(bottom)) {
      errors.bottomDiameterMm = "Set bottom diameter.";
    }
  }

  return errors;
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
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return "Auto-detect failed. Please retry.";
}

const CONFIDENCE_BADGE_CLASS: Record<TumblerConfidenceLevel, string> = {
  high: styles.confidenceHigh,
  medium: styles.confidenceMedium,
  low: styles.confidenceLow,
};

function normalizeBrandForMatch(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function findDefaultProfileForBrand(brand: string): string | undefined {
  const normalizedBrand = normalizeBrandForMatch(brand);
  if (!normalizedBrand || normalizedBrand === "unknown") {
    return undefined;
  }
  return KNOWN_TUMBLER_PROFILES.find(
    (profile) => normalizeBrandForMatch(profile.brand) === normalizedBrand
  )?.id;
}

function applyBrandOverrideSelection(
  draft: TumblerSpecDraft,
  mode: BrandOverrideMode,
  detectedDraft: TumblerSpecDraft | null
): TumblerSpecDraft {
  if (mode === "auto") {
    if (!detectedDraft) {
      return withRecalculatedTemplate({
        ...draft,
        manualBrandOverride: false,
        manualProfileOverrideId: undefined,
      });
    }
    return withRecalculatedTemplate({
      ...draft,
      brand: detectedDraft.brand,
      model: detectedDraft.model,
      manualBrandOverride: false,
      manualProfileOverrideId: undefined,
    });
  }

  const defaultProfileId = findDefaultProfileForBrand(mode);
  const profile = defaultProfileId
    ? getTumblerProfileById(defaultProfileId)
    : null;

  return withRecalculatedTemplate({
    ...draft,
    brand: mode,
    model: profile?.model ?? "unknown",
    manualBrandOverride: true,
    manualProfileOverrideId: defaultProfileId,
  });
}

export function TumblerAutoDetectPanel({ bedConfig, onApplyDraft, onSetMockup, mockupActive }: Props) {
  const [selectedImage, setSelectedImage] = React.useState<File | null>(null);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = React.useState<{ w: number; h: number } | null>(null);
  const [state, setState] = React.useState<TumblerAutoSizeState>(INITIAL_STATE);
  const [overrideOpen, setOverrideOpen] = React.useState(false);

  // Mockup calibration state
  const [mockupOpen, setMockupOpen] = React.useState(false);
  const [mockupTop, setMockupTop] = React.useState(12);
  const [mockupBottom, setMockupBottom] = React.useState(88);
  const [mockupOpacity, setMockupOpacity] = React.useState(35);

  const runAutoDetect = React.useCallback(
    async (file: File) => {
      setState((prev) => ({
        ...prev,
        status: "loading",
        fileName: file.name,
        error: null,
      }));

      const formData = new FormData();
      formData.set("image", file);

      try {
        const response = await fetch("/api/admin/tumbler/auto-size", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as
          | TumblerAutoSizeResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(getErrorMessage(payload));
        }

        const result = payload as TumblerAutoSizeResponse;
        const detectedDraft = toTumblerSpecDraft(result.suggestion, result.calculation);

        setState((prev) => {
          let nextDraft = detectedDraft;
          if (prev.draft?.manualBrandOverride) {
            nextDraft = withRecalculatedTemplate({
              ...nextDraft,
              brand: prev.draft.brand,
              model: prev.draft.model,
              manualBrandOverride: true,
            });
          }

          if (
            typeof prev.draft?.manualProfileOverrideId === "string" &&
            prev.draft.manualProfileOverrideId.trim().length > 0
          ) {
            nextDraft = withRecalculatedTemplate({
              ...nextDraft,
              manualProfileOverrideId: prev.draft.manualProfileOverrideId,
            });
          }

          const isUnknownBrand =
            (nextDraft.brand ?? "unknown").trim().toLowerCase() === "unknown";

          return {
            status: isUnknownBrand
              ? "unknown"
              : result.confidenceLevel === "low"
                ? "low-confidence"
                : "success",
            fileName: file.name,
            result,
            draft: nextDraft,
            error: null,
          };
        });
      } catch (error) {
        setState({
          status: "error",
          fileName: file.name,
          result: null,
          draft: null,
          error: error instanceof Error ? error.message : "Auto-detect failed.",
        });
      }
    },
    []
  );

  if (bedConfig.workspaceMode !== "tumbler-wrap") {
    return null;
  }

  const validationErrors = state.draft ? validateDraft(state.draft) : {};
  const hasValidationErrors = Object.keys(validationErrors).length > 0;
  const isBrandUnknown = (state.draft?.brand ?? "unknown").toLowerCase() === "unknown";
  const detectedDraft =
    state.result?.suggestion && state.result?.calculation
      ? toTumblerSpecDraft(state.result.suggestion, state.result.calculation)
      : null;
  const selectedBrandOverride: BrandOverrideMode = (() => {
    if (!state.draft?.manualBrandOverride) return "auto";
    const brand = state.draft.brand?.trim() ?? "";
    const matched = BRAND_OVERRIDE_OPTIONS.find(
      (option) => option.value !== "auto" && option.value === brand
    );
    return matched?.value ?? "unknown";
  })();
  const availableProfiles = KNOWN_TUMBLER_PROFILES.filter((profile) => {
    if (selectedBrandOverride === "auto") return true;
    if (selectedBrandOverride === "unknown") {
      return normalizeBrandForMatch(profile.brand) === "generic";
    }
    return normalizeBrandForMatch(profile.brand) === normalizeBrandForMatch(selectedBrandOverride);
  });

  const updateDraft = (patch: Partial<TumblerSpecDraft>) => {
    setState((prev) => {
      if (!prev.draft) return prev;
      const next = withRecalculatedTemplate({ ...prev.draft, ...patch });
      return {
        ...prev,
        draft: next,
      };
    });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Auto Detect Tumbler Size</span>
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
          {selectedImage?.name ?? state.fileName ?? "No image selected"}
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
                  <input type="range" min={0} max={mockupBottom - 1} value={mockupTop}
                    onChange={(e) => setMockupTop(Number(e.target.value))}
                    className={styles.mockupSlider} />
                  <span className={styles.mockupSliderVal}>{mockupTop}%</span>
                </label>

                <label className={styles.mockupSliderRow}>
                  <span className={styles.mockupSliderLabel}>Print bottom</span>
                  <input type="range" min={mockupTop + 1} max={100} value={mockupBottom}
                    onChange={(e) => setMockupBottom(Number(e.target.value))}
                    className={styles.mockupSlider} />
                  <span className={styles.mockupSliderVal}>{mockupBottom}%</span>
                </label>

                <label className={styles.mockupSliderRow}>
                  <span className={styles.mockupSliderLabel}>Opacity</span>
                  <input type="range" min={10} max={80} value={mockupOpacity}
                    onChange={(e) => setMockupOpacity(Number(e.target.value))}
                    className={styles.mockupSlider} />
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

        {state.result && state.draft && (
          <>
            <div className={styles.sectionLabel}>Detected Product</div>
            <div className={styles.readRow}>
              <span>Brand</span>
              <span>{state.draft.brand ?? "Unknown"}</span>
            </div>
            <div className={styles.readRow}>
              <span>Model</span>
              <span>{state.draft.model ?? "Unknown"}</span>
            </div>
            <div className={styles.readRow}>
              <span>Capacity</span>
              <span>{state.draft.capacityOz ? `${state.draft.capacityOz} oz` : "Unknown"}</span>
            </div>
            <ConfidenceBadgeRow
              label="Confidence"
              value={state.draft.confidence}
              forceLevel={isBrandUnknown ? "low" : undefined}
              overrideLabel={isBrandUnknown ? "Low" : undefined}
            />

            {(isBrandUnknown ||
              state.status === "low-confidence" ||
              state.status === "unknown") && (
              <div className={styles.warning}>
                Brand not confidently confirmed. You can continue as Generic or choose a
                brand manually.
              </div>
            )}

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
                <OverrideRow label="Brand">
                  <select
                    className={styles.select}
                    value={selectedBrandOverride}
                    onChange={(e) => {
                      const mode = e.target.value as BrandOverrideMode;
                      setState((prev) => {
                        if (!prev.draft) return prev;
                        return {
                          ...prev,
                          draft: applyBrandOverrideSelection(prev.draft, mode, detectedDraft),
                        };
                      });
                    }}
                  >
                    {BRAND_OVERRIDE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </OverrideRow>

                <OverrideRow label="Profile">
                  <select
                    className={styles.select}
                    value={state.draft.manualProfileOverrideId ?? ""}
                    onChange={(e) => {
                      const profileId = e.target.value || undefined;
                      const profile = profileId ? getTumblerProfileById(profileId) : null;
                      updateDraft({
                        manualProfileOverrideId: profileId,
                        ...(profile
                          ? { brand: profile.brand, model: profile.model, manualBrandOverride: true }
                          : {}),
                      });
                    }}
                  >
                    <option value="">Auto / None</option>
                    {availableProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </OverrideRow>

                <OverrideRow label="Shape">
                  <select
                    className={styles.select}
                    value={state.draft.shapeType}
                    onChange={(e) => updateDraft({ shapeType: e.target.value as TumblerShapeType })}
                  >
                    <option value="straight">Straight</option>
                    <option value="tapered">Tapered</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </OverrideRow>

                <LabeledNumberRow
                  label="Outside Dia"
                  value={state.draft.outsideDiameterMm}
                  onChange={(v) => updateDraft({ outsideDiameterMm: v })}
                />
                <LabeledNumberRow
                  label="Top Dia"
                  value={state.draft.topDiameterMm}
                  onChange={(v) => updateDraft({ topDiameterMm: v })}
                />
                <LabeledNumberRow
                  label="Bottom Dia"
                  value={state.draft.bottomDiameterMm}
                  onChange={(v) => updateDraft({ bottomDiameterMm: v })}
                />
                <LabeledNumberRow
                  label="Overall H"
                  value={state.draft.overallHeightMm}
                  onChange={(v) => updateDraft({ overallHeightMm: v })}
                />
                <LabeledNumberRow
                  label="Usable H"
                  value={state.draft.usableHeightMm}
                  onChange={(v) => updateDraft({ usableHeightMm: v })}
                />
              </>
            )}

            {(validationErrors.outsideDiameterMm ||
              validationErrors.topDiameterMm ||
              validationErrors.bottomDiameterMm ||
              validationErrors.overallHeightMm ||
              validationErrors.usableHeightMm) && (
              <div className={styles.error}>
                {validationErrors.outsideDiameterMm ??
                  validationErrors.topDiameterMm ??
                  validationErrors.bottomDiameterMm ??
                  validationErrors.overallHeightMm ??
                  validationErrors.usableHeightMm}
              </div>
            )}

            <div className={styles.actionRow}>
              <button
                className={styles.secondaryBtn}
                disabled={!selectedImage || state.status === "loading"}
                onClick={() => {
                  if (selectedImage) void runAutoDetect(selectedImage);
                }}
              >
                Retry Search
              </button>
              <button
                className={styles.primaryBtn}
                disabled={hasValidationErrors}
                onClick={() => onApplyDraft(state.draft!)}
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
  forceLevel,
  overrideLabel,
}: {
  label: string;
  value: number;
  forceLevel?: TumblerConfidenceLevel;
  overrideLabel?: string;
}) {
  const level = forceLevel ?? getTumblerConfidenceLevel(value);
  const badgeLabel = overrideLabel ?? (level.charAt(0).toUpperCase() + level.slice(1));
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

function LabeledNumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className={styles.overrideRow}>
      <span className={styles.overrideLabel}>{label}</span>
      <input
        type="number"
        className={styles.numInput}
        value={value ?? ""}
        step={0.1}
        onChange={(e) => onChange(toNullableNumber(e.target.value))}
      />
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

