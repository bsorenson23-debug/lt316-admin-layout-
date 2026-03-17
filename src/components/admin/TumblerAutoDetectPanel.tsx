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
  TumblerShapeType,
  TumblerSpecDraft,
} from "@/types/tumblerAutoSize";
import {
  calculateTumblerTemplate,
  roundDisplayMm,
  toTumblerSpecDraft,
} from "@/utils/tumblerAutoSize";
import styles from "./TumblerAutoDetectPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  onApplyDraft: (draft: TumblerSpecDraft) => void;
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

export function TumblerAutoDetectPanel({ bedConfig, onApplyDraft }: Props) {
  const [selectedImage, setSelectedImage] = React.useState<File | null>(null);
  const [state, setState] = React.useState<TumblerAutoSizeState>(INITIAL_STATE);

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
  const brandResolution = state.result?.analysis.brandResolution;
  const alternateCandidates =
    brandResolution?.topCandidates ?? state.draft?.alternateCandidates ?? [];
  const candidateScoreByBrand = new Map(
    (brandResolution?.candidateScores ?? []).map((entry) => [
      entry.brand.toLowerCase(),
      entry.totalScore,
    ])
  );
  const detectedBrandConfidence =
    brandResolution?.confidence ??
    state.draft?.brandConfidence ??
    state.draft?.confidence ??
    0;
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
          }}
        />
        <div className={styles.fileName}>
          {selectedImage?.name ?? state.fileName ?? "No image selected"}
        </div>
        <button
          className={styles.primaryBtn}
          disabled={!selectedImage || state.status === "loading"}
          onClick={() => {
            if (selectedImage) void runAutoDetect(selectedImage);
          }}
        >
          {state.status === "loading" ? "Detecting..." : "Run Auto-Detect"}
        </button>

        {state.status === "idle" && (
          <div className={styles.hint}>
            Upload one product image, then run auto-detect.
          </div>
        )}

        {state.status === "error" && (
          <div className={styles.error}>{state.error}</div>
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
            <div className={styles.readRow}>
              <span>Confidence</span>
              <span
                className={
                  state.status === "low-confidence" || state.status === "unknown"
                    ? styles.lowConfidence
                    : styles.highConfidence
                }
              >
                {(state.draft.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className={styles.readRow}>
              <span>Brand Confidence</span>
              <span className={isBrandUnknown ? styles.lowConfidence : styles.highConfidence}>
                {(detectedBrandConfidence * 100).toFixed(0)}%
              </span>
            </div>
            {state.draft.familyHint && (
              <div className={styles.readRow}>
                <span>Family Hint</span>
                <span>{state.draft.familyHint}</span>
              </div>
            )}

            {(isBrandUnknown ||
              state.status === "low-confidence" ||
              state.status === "unknown") && (
              <div className={styles.warning}>
                Brand not confidently confirmed. You can continue as Generic or choose a
                brand manually.
              </div>
            )}

            {alternateCandidates.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Alternate Candidates</div>
                <ul className={styles.candidates}>
                  {alternateCandidates.map((candidate) => {
                    const key = `${candidate.id}-${candidate.brand}-${candidate.model ?? "unknown"}`;
                    const score = candidateScoreByBrand.get(candidate.brand.toLowerCase());
                    return (
                      <li key={key} className={styles.candidateItem}>
                        <span>
                          {candidate.brand}
                          {candidate.model && candidate.model !== "unknown"
                            ? ` - ${candidate.model}`
                            : ""}
                        </span>
                        {typeof score === "number" && (
                          <span className={styles.candidateScore}>
                            {(score * 100).toFixed(0)}%
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className={styles.sectionLabel}>Raw Spec Dimensions (mm)</div>
            <div className={styles.readRow}>
              <span>Outside Dia</span>
              <span>{roundDisplayMm(state.draft.outsideDiameterMm)}</span>
            </div>
            <div className={styles.readRow}>
              <span>Top Dia</span>
              <span>{roundDisplayMm(state.draft.topDiameterMm)}</span>
            </div>
            <div className={styles.readRow}>
              <span>Bottom Dia</span>
              <span>{roundDisplayMm(state.draft.bottomDiameterMm)}</span>
            </div>
            <div className={styles.readRow}>
              <span>Overall H</span>
              <span>{roundDisplayMm(state.draft.overallHeightMm)}</span>
            </div>
            <div className={styles.readRow}>
              <span>Usable H</span>
              <span>{roundDisplayMm(state.draft.usableHeightMm)}</span>
            </div>

            <div className={styles.sectionLabel}>Derived Template (mm)</div>
            <div className={styles.readRow}>
              <span>Template Width</span>
              <span>{roundDisplayMm(state.draft.templateWidthMm)}</span>
            </div>
            <div className={styles.readRow}>
              <span>Template Height</span>
              <span>{roundDisplayMm(state.draft.templateHeightMm)}</span>
            </div>

            <div className={styles.sectionLabel}>Manual Override</div>
            <div className={styles.field}>
              <span className={styles.inlineLabel}>Brand</span>
              <select
                className={styles.select}
                value={selectedBrandOverride}
                onChange={(e) => {
                  const mode = e.target.value as BrandOverrideMode;
                  setState((prev) => {
                    if (!prev.draft) return prev;
                    return {
                      ...prev,
                      draft: applyBrandOverrideSelection(
                        prev.draft,
                        mode,
                        detectedDraft
                      ),
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
            </div>
            <div className={styles.field}>
              <span className={styles.inlineLabel}>Profile</span>
              <select
                className={styles.select}
                value={state.draft.manualProfileOverrideId ?? ""}
                onChange={(e) => {
                  const profileId = e.target.value || undefined;
                  const profile = profileId ? getTumblerProfileById(profileId) : null;
                  updateDraft({
                    manualProfileOverrideId: profileId,
                    ...(profile
                      ? {
                          brand: profile.brand,
                          model: profile.model,
                          manualBrandOverride: true,
                        }
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
            </div>
            <div className={styles.grid}>
              <LabeledNumber
                label="Capacity (oz)"
                value={state.draft.capacityOz}
                onChange={(value) => updateDraft({ capacityOz: value })}
              />
              <label className={styles.field}>
                <span className={styles.inlineLabel}>Has Handle</span>
                <select
                  className={styles.select}
                  value={
                    state.draft.hasHandle === null
                      ? "unknown"
                      : state.draft.hasHandle
                        ? "yes"
                        : "no"
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    updateDraft({
                      hasHandle:
                        value === "unknown" ? null : value === "yes",
                    });
                  }}
                >
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <div className={styles.grid}>
              <LabeledNumber
                label="Outside Dia"
                value={state.draft.outsideDiameterMm}
                onChange={(value) => updateDraft({ outsideDiameterMm: value })}
              />
              <LabeledNumber
                label="Top Dia"
                value={state.draft.topDiameterMm}
                onChange={(value) => updateDraft({ topDiameterMm: value })}
              />
              <LabeledNumber
                label="Bottom Dia"
                value={state.draft.bottomDiameterMm}
                onChange={(value) => updateDraft({ bottomDiameterMm: value })}
              />
              <LabeledNumber
                label="Overall H"
                value={state.draft.overallHeightMm}
                onChange={(value) => updateDraft({ overallHeightMm: value })}
              />
              <LabeledNumber
                label="Usable H"
                value={state.draft.usableHeightMm}
                onChange={(value) => updateDraft({ usableHeightMm: value })}
              />
            </div>

            <div className={styles.shapeRow}>
              <span className={styles.inlineLabel}>Shape</span>
              <select
                className={styles.select}
                value={state.draft.shapeType}
                onChange={(e) =>
                  updateDraft({
                    shapeType: e.target.value as TumblerShapeType,
                  })
                }
              >
                <option value="straight">Straight</option>
                <option value="tapered">Tapered</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

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

            <div className={styles.sectionLabel}>Source Links</div>
            <ul className={styles.sources}>
              {state.result.suggestion.sources.length === 0 && (
                <li className={styles.sourceItemMuted}>No source links available.</li>
              )}
              {state.result.suggestion.sources.map((source) => (
                <li key={source.url} className={styles.sourceItem}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <span className={styles.sourceKind}>{source.kind}</span>
                </li>
              ))}
            </ul>

            {state.result.suggestion.notes.length > 0 && (
              <div className={styles.notes}>
                {state.result.suggestion.notes.map((note, idx) => (
                  <div key={`${note}-${idx}`}>{note}</div>
                ))}
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

function LabeledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.inlineLabel}>{label}</span>
      <input
        type="number"
        className={styles.numInput}
        value={value ?? ""}
        step={0.1}
        onChange={(e) => onChange(toNullableNumber(e.target.value))}
      />
    </label>
  );
}

