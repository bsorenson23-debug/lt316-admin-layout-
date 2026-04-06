"use client";

import React from "react";
import { smartTemplateLookup } from "@/lib/smartTemplateLookup";
import type {
  SmartTemplateLookupPrompt,
  SmartTemplateLookupResponse,
} from "@/types/smartTemplateLookup";
import { FileDropZone } from "./shared/FileDropZone";
import styles from "./SmartTemplateLookupPanel.module.css";

interface Props {
  onResolved: (
    result: SmartTemplateLookupResponse,
    files: {
      analysisImageFile: File | null;
      frontPhotoFile: File | null;
      backPhotoFile: File | null;
    },
  ) => Promise<void> | void;
  onOpenMapping?: () => void;
  canOpenMapping?: boolean;
  onClearResult?: () => void;
}

const PROMPT_LABELS: Record<SmartTemplateLookupPrompt, string> = {
  "confirm-category": "Confirm category",
  "confirm-dimensions": "Confirm dimensions",
  "choose-laser-type": "Choose laser type",
  "choose-material-profile": "Choose material profile",
  "choose-rotary-preset": "Choose rotary preset",
  "choose-model": "Choose or verify 3D model",
  "map-tumbler": "Map tumbler orientation",
};

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.82) return "High confidence";
  if (confidence >= 0.62) return "Medium confidence";
  return "Low confidence";
}

function formatDimension(value: number | null | undefined, suffix = "mm"): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${Math.round(value * 100) / 100} ${suffix}`
    : null;
}

function buildMetrics(result: SmartTemplateLookupResponse): string[] {
  const dims = result.templateDraft.dimensions;
  return [
    result.category !== "flat" ? formatDimension(dims?.diameterMm, "mm dia") : null,
    formatDimension(dims?.printHeightMm, "mm print"),
    result.category === "flat" ? formatDimension(dims?.templateWidthMm, "mm width") : null,
    dims?.flatFamilyKey ? `Family ${dims.flatFamilyKey}` : null,
    result.templateDraft.glbPath ? "3D ready" : null,
    result.templateDraft.productPhotoUrl ? "Photo found" : null,
  ].filter((value): value is string => Boolean(value));
}

function formatReferenceRole(result: SmartTemplateLookupResponse, imageId: string): string[] {
  const refSet = result.templateDraft.productReferenceSet;
  if (!refSet) return [];
  const roles: string[] = [];
  if (refSet.canonicalFrontImageId === imageId) roles.push("front");
  if (refSet.canonicalBackImageId === imageId) roles.push("back");
  if (refSet.canonicalHandleSideImageId === imageId) roles.push("handle");
  if (refSet.canonicalViewSelection?.bestAuxBack3qImageId === imageId) roles.push("aux-back-3q");
  return roles;
}

function formatReferenceConfidence(confidence: number | null | undefined): string {
  return `${Math.round((confidence ?? 0) * 100)}%`;
}

function formatReferenceViewLabel(
  result: SmartTemplateLookupResponse,
  image: NonNullable<SmartTemplateLookupResponse["templateDraft"]["productReferenceSet"]>["images"][number],
): string {
  const selection = result.templateDraft.productReferenceSet?.canonicalViewSelection;
  if (
    selection?.canonicalBackStatus === "only-back-3q-found" &&
    selection.bestAuxBack3qImageId === image.id
  ) {
    return "back-3q";
  }
  return image.viewClass;
}

export function SmartTemplateLookupPanel({
  onResolved,
  onOpenMapping,
  canOpenMapping = false,
  onClearResult,
}: Props) {
  const [lookupInput, setLookupInput] = React.useState("");
  const [analysisImageFile, setAnalysisImageFile] = React.useState<File | null>(null);
  const [frontPhotoFile, setFrontPhotoFile] = React.useState<File | null>(null);
  const [backPhotoFile, setBackPhotoFile] = React.useState<File | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SmartTemplateLookupResponse | null>(null);
  const [applied, setApplied] = React.useState(false);

  const effectiveAnalysisImage = analysisImageFile ?? frontPhotoFile;
  const canAnalyze = lookupInput.trim().length > 0 || Boolean(effectiveAnalysisImage);
  const metrics = React.useMemo(() => (result ? buildMetrics(result) : []), [result]);

  const handleAnalyze = React.useCallback(async () => {
    if (!canAnalyze) return;
    setIsLoading(true);
    setError(null);
    setApplied(false);

    try {
      const nextResult = await smartTemplateLookup({
        lookupInput,
        image: effectiveAnalysisImage,
      });
      setResult(nextResult);
      await onResolved(nextResult, {
        analysisImageFile: effectiveAnalysisImage,
        frontPhotoFile,
        backPhotoFile,
      });
      setApplied(true);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Smart lookup failed. Fill the template manually.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [backPhotoFile, canAnalyze, effectiveAnalysisImage, frontPhotoFile, lookupInput, onResolved]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Smart lookup</div>
          <div className={styles.hint}>
            Start with a product image, website URL, or search text. The app will try to classify the product, prefill the template, and tell you what still needs confirmation.
          </div>
        </div>
        {result && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => {
              setResult(null);
              setApplied(false);
              setError(null);
              onClearResult?.();
            }}
          >
            Clear result
          </button>
        )}
      </div>

      <div className={styles.inputGrid}>
        <div className={styles.dropZoneCard}>
          <div className={styles.cardTitle}>Analyze image</div>
          <FileDropZone
            accept="image/*"
            fileName={analysisImageFile?.name ?? null}
            label="Drop product image"
            hint="Vision can classify drinkware or flat items"
            onFileSelected={setAnalysisImageFile}
            onClear={() => setAnalysisImageFile(null)}
          />
          <div className={styles.assist}>
            Optional if you already provide a front photo. The front image will be reused for analysis when this slot is empty.
          </div>
        </div>

        <div className={styles.lookupCard}>
          <div className={styles.cardTitle}>Search text or product URL</div>
          <div className={styles.lookupForm}>
            <input
              className={styles.textInput}
              type="text"
              value={lookupInput}
              onChange={(event) => setLookupInput(event.target.value)}
              placeholder="Stanley IceFlow 30 oz or https://example.com/product-page"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAnalyze();
                }
              }}
            />
            <button
              type="button"
              className={styles.analyzeBtn}
              onClick={() => void handleAnalyze()}
              disabled={!canAnalyze || isLoading}
            >
              {isLoading ? "Analyzing..." : "Analyze product"}
            </button>
          </div>
          <div className={styles.assist}>
            Use either input on its own or combine both. URLs are scraped for product metadata and images before the form is filled.
          </div>
        </div>

        <div className={styles.photoCard}>
          <div className={styles.cardTitle}>Face photos</div>
          <div className={styles.photoGrid}>
            <FileDropZone
              accept="image/*"
              fileName={frontPhotoFile?.name ?? null}
              label="Drop front face photo"
              hint="Used for the front overlay"
              onFileSelected={setFrontPhotoFile}
              onClear={() => setFrontPhotoFile(null)}
            />
            <FileDropZone
              accept="image/*"
              fileName={backPhotoFile?.name ?? null}
              label="Drop back face photo"
              hint="Used for the back overlay"
              onFileSelected={setBackPhotoFile}
              onClear={() => setBackPhotoFile(null)}
            />
          </div>
          <div className={styles.assist}>
            Add both sides here so the template opens with real front and back reference photos instead of relying on a mirrored fallback.
          </div>
        </div>
      </div>

      <div className={styles.statusLine} role="status" aria-live="polite">
        {isLoading
          ? "Resolving product type, dimensions, photo, and model hints..."
          : applied
            ? "Smart lookup applied to the template fields below."
            : "Run smart lookup first, then review the prompted fields before saving."}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {result && (
        <div className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <div>
              <div className={styles.resultTitle}>
                {result.templateDraft.name ?? "Resolved product"}
              </div>
              <div className={styles.resultReason}>{result.categoryReason}</div>
            </div>
            <div className={styles.badgeRow}>
              <span className={styles.badgePrimary}>
                {result.category === "unknown" ? "Needs review" : result.category}
              </span>
              <span className={styles.badgeMuted}>
                {confidenceLabel(result.confidence)} ({Math.round(result.confidence * 100)}%)
              </span>
              {result.reviewRequired && (
                <span className={styles.badgeWarning}>Review required</span>
              )}
            </div>
          </div>

          {(result.templateDraft.brand || result.templateDraft.capacity) && (
            <div className={styles.resultLine}>
              {[result.templateDraft.brand, result.templateDraft.capacity].filter(Boolean).join(" / ")}
            </div>
          )}

          {metrics.length > 0 && (
            <div className={styles.metricRow}>
              {metrics.map((metric) => (
                <span key={metric} className={styles.metric}>
                  {metric}
                </span>
              ))}
            </div>
          )}

          {result.templateDraft.productReferenceSet && (
            <div className={styles.promptBlock}>
              <div className={styles.promptTitle}>
                Reference set ({result.templateDraft.productReferenceSet.images.length} images, {Math.round(result.templateDraft.productReferenceSet.orientationConfidence * 100)}% orientation confidence)
              </div>
              <div className={styles.assist}>
                {(() => {
                  const selection = result.templateDraft.productReferenceSet?.canonicalViewSelection;
                  if (!selection) return null;
                  if (selection.canonicalBackStatus === "true-back") {
                    return `Front ${formatReferenceConfidence(selection.frontConfidence)}. Back face locked as true back (${formatReferenceConfidence(selection.backConfidence)}).`;
                  }
                  if (selection.canonicalBackStatus === "only-back-3q-found") {
                    return `Front ${formatReferenceConfidence(selection.frontConfidence)}. No strict true back face was assigned; only an auxiliary back-3q candidate was found (${formatReferenceConfidence(selection.backConfidence)}).`;
                  }
                  return `Front ${formatReferenceConfidence(selection.frontConfidence)}. Back face remains unknown.`;
                })()}
              </div>
              <div className={styles.promptList}>
                {result.templateDraft.productReferenceSet.images.map((image) => {
                  const roles = formatReferenceRole(result, image.id);
                  return (
                    <span key={image.id} className={styles.promptChip}>
                      {formatReferenceViewLabel(result, image)}
                      {image.handleVisible ? ` / handle-${image.handleSide}` : ""}
                      {image.logoDetected ? " / logo" : ""}
                      {roles.length > 0 ? ` / ${roles.join("+")}` : ""}
                      {` / ${formatReferenceConfidence(image.confidence)}`}
                      {typeof image.approxAzimuthDeg === "number" ? ` / ${image.approxAzimuthDeg}°` : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {result.nextPrompts.length > 0 && (
            <div className={styles.promptBlock}>
              <div className={styles.promptTitle}>Next setup prompts</div>
              <div className={styles.promptList}>
                {result.nextPrompts.map((prompt) => (
                  <span key={prompt} className={styles.promptChip}>
                    {PROMPT_LABELS[prompt]}
                  </span>
                ))}
              </div>
              {result.nextPrompts.includes("map-tumbler") && onOpenMapping && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={onOpenMapping}
                  disabled={!canOpenMapping}
                >
                  {canOpenMapping ? "Open mapping wizard" : "Map tumbler after model loads"}
                </button>
              )}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className={styles.warningBlock}>
              {result.warnings.map((warning) => (
                <div key={warning} className={styles.warningLine}>
                  {warning}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
