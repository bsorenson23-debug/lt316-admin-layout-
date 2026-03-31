"use client";

import React from "react";
import type { SvgAsset } from "@/types/admin";
import type { ImageTextDetectionResult, TextStylePreset } from "@/types/textDetection";
import { svgToDataUrl } from "@/utils/svg";
import {
  applyTextReplacementToSvg,
  buildPresetFromImageDetection,
  buildPresetFromSvgTextNode,
  buildTextSvgFromPreset,
  extractSvgTextNodes,
  summarizeFontCandidates,
} from "@/utils/textDetection";
import { FileDropZone } from "./shared/FileDropZone";
import styles from "./TextToolPanel.module.css";

interface Props {
  onAddAsset: (svgContent: string, fileName: string) => void;
  selectedAsset: SvgAsset | null;
  onReplaceSelectedAsset: (svgContent: string) => void;
}

const COMMON_FONT_OPTIONS = [
  "Arial",
  "Verdana",
  "Georgia",
  "Courier New",
  "Impact",
  "Tahoma",
  "Times New Roman",
  "Helvetica",
  "Garamond",
  "Brush Script MT",
  "Copperplate",
  "Futura",
];

type DetectionStatus = "idle" | "running" | "done" | "error";

function buildFileName(text: string): string {
  const base = text.trim() || "detected-text";
  return `${base.slice(0, 32).replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() || "detected-text"}.svg`;
}

function formatAngle(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} deg`;
}

export function TextToolPanel({
  onAddAsset,
  selectedAsset,
  onReplaceSelectedAsset,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [fontSize, setFontSize] = React.useState(48);
  const [fontFamily, setFontFamily] = React.useState("Arial");
  const [fontWeight, setFontWeight] = React.useState("normal");
  const [fontStyle, setFontStyle] = React.useState("normal");
  const [fillColor, setFillColor] = React.useState("#000000");
  const [letterSpacing, setLetterSpacing] = React.useState(0);
  const [angleDeg, setAngleDeg] = React.useState(0);
  const [textAnchor, setTextAnchor] = React.useState<"start" | "middle" | "end">("start");
  const [svgTextIndex, setSvgTextIndex] = React.useState(0);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState<string | null>(null);
  const [imageDetection, setImageDetection] = React.useState<ImageTextDetectionResult | null>(null);
  const [imageDetectionStatus, setImageDetectionStatus] = React.useState<DetectionStatus>("idle");
  const [imageDetectionError, setImageDetectionError] = React.useState<string | null>(null);
  const [replaceStatus, setReplaceStatus] = React.useState<string | null>(null);

  const detectedSvgTextNodes = React.useMemo(
    () => (selectedAsset ? extractSvgTextNodes(selectedAsset.content) : []),
    [selectedAsset],
  );

  const selectedSvgTextNode = detectedSvgTextNodes[svgTextIndex] ?? null;

  const detectedFontOptions = React.useMemo(() => {
    const options = new Set(COMMON_FONT_OPTIONS);
    if (selectedSvgTextNode?.fontFamily) options.add(selectedSvgTextNode.fontFamily);
    if (imageDetection?.fontFamily) options.add(imageDetection.fontFamily);
    for (const candidate of imageDetection?.fontCandidates ?? []) {
      options.add(candidate);
    }
    return Array.from(options);
  }, [imageDetection, selectedSvgTextNode]);

  const applyPresetToEditor = React.useCallback((preset: TextStylePreset) => {
    setText(preset.text);
    setFontSize(preset.fontSize);
    setFontFamily(preset.fontFamily);
    setFontWeight(preset.fontWeight);
    setFontStyle(preset.fontStyle);
    setFillColor(preset.fill);
    setLetterSpacing(preset.letterSpacing);
    setAngleDeg(preset.angleDeg);
    setTextAnchor(preset.textAnchor);
    setReplaceStatus(null);
  }, []);

  React.useEffect(() => {
    setSvgTextIndex(0);
    setReplaceStatus(null);
  }, [selectedAsset?.id]);

  React.useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [imageFile]);

  const currentPreset = React.useMemo<TextStylePreset>(
    () => ({
      text,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      fill: fillColor,
      letterSpacing,
      angleDeg,
      textAnchor,
    }),
    [angleDeg, fillColor, fontFamily, fontSize, fontStyle, fontWeight, letterSpacing, text, textAnchor],
  );

  const previewSvg = React.useMemo(
    () => (text.trim() ? buildTextSvgFromPreset(currentPreset) : null),
    [currentPreset, text],
  );
  const previewUrl = React.useMemo(
    () => (previewSvg ? svgToDataUrl(previewSvg) : null),
    [previewSvg],
  );

  const handleAnalyzeImage = React.useCallback(async () => {
    if (!imageFile) return;
    setImageDetectionStatus("running");
    setImageDetectionError(null);
    setReplaceStatus(null);

    try {
      const formData = new FormData();
      formData.set("image", imageFile);
      const response = await fetch("/api/admin/text/detect", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImageTextDetectionResult | { error?: string };
      if (!response.ok || !("confidence" in payload)) {
        throw new Error((payload as { error?: string }).error ?? "Text detection failed.");
      }
      setImageDetection(payload);
      setImageDetectionStatus("done");
    } catch (error) {
      setImageDetectionStatus("error");
      setImageDetectionError(
        error instanceof Error ? error.message : "Text detection failed.",
      );
    }
  }, [imageFile]);

  const handleApplySvgDetection = React.useCallback(() => {
    if (!selectedSvgTextNode) return;
    applyPresetToEditor(buildPresetFromSvgTextNode(selectedSvgTextNode));
  }, [applyPresetToEditor, selectedSvgTextNode]);

  const handleApplyImageDetection = React.useCallback(() => {
    if (!imageDetection) return;
    const nextPreset = buildPresetFromImageDetection(imageDetection);
    if (!nextPreset) return;
    applyPresetToEditor(nextPreset);
  }, [applyPresetToEditor, imageDetection]);

  const handleAdd = React.useCallback(() => {
    if (!text.trim()) return;
    onAddAsset(buildTextSvgFromPreset(currentPreset), buildFileName(text));
    setReplaceStatus("Added replacement text as a new SVG asset.");
  }, [currentPreset, onAddAsset, text]);

  const handleReplace = React.useCallback(() => {
    if (!selectedAsset || !selectedSvgTextNode || !text.trim()) return;
    try {
      const nextSvg = applyTextReplacementToSvg(
        selectedAsset.content,
        selectedSvgTextNode.index,
        currentPreset,
      );
      onReplaceSelectedAsset(nextSvg);
      setReplaceStatus("Updated the selected SVG text in place.");
    } catch (error) {
      setReplaceStatus(
        error instanceof Error ? error.message : "Unable to replace selected SVG text.",
      );
    }
  }, [currentPreset, onReplaceSelectedAsset, selectedAsset, selectedSvgTextNode, text]);

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((o) => !o)} type="button">
        <span className={styles.toggleLabel}>Text Detect + Replace</span>
        <span className={styles.chevron}>{open ? "v" : ">"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <p className={styles.note}>
            Exact detection works for SVG assets that still contain live text nodes.
            Image detection is approximate and is best used to seed replacement text and style.
          </p>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Selected SVG Text</div>
            {selectedAsset ? (
              detectedSvgTextNodes.length > 0 ? (
                <>
                  <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Text node</span>
                    <select
                      className={styles.select}
                      value={svgTextIndex}
                      onChange={(event) => setSvgTextIndex(Number(event.target.value))}
                    >
                      {detectedSvgTextNodes.map((node, index) => (
                        <option key={node.index} value={index}>
                          {`#${index + 1}: ${node.text.slice(0, 28) || "(empty text)"}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSvgTextNode && (
                    <div className={styles.metaCard}>
                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Text</span>
                        <span className={styles.metaValue}>{selectedSvgTextNode.text}</span>
                      </div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Font</span>
                        <span className={styles.metaValue}>{selectedSvgTextNode.fontFamily}</span>
                      </div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Size</span>
                        <span className={styles.metaValue}>{selectedSvgTextNode.fontSize.toFixed(1)} px</span>
                      </div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Angle</span>
                        <span className={styles.metaValue}>{formatAngle(selectedSvgTextNode.angleDeg)}</span>
                      </div>
                    </div>
                  )}

                  <button
                    className={styles.secondaryBtn}
                    type="button"
                    onClick={handleApplySvgDetection}
                  >
                    Load SVG text style into editor
                  </button>
                </>
              ) : (
                <div className={styles.emptyState}>
                  The selected asset has no live SVG text nodes. If the lettering was converted to paths,
                  use image detection below and add a replacement SVG.
                </div>
              )
            ) : (
              <div className={styles.emptyState}>
                Select an asset from the library to inspect its text nodes.
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Image Text Detection</div>
            <FileDropZone
              accept="image/png,image/jpeg,image/webp"
              fileName={imageFile?.name ?? null}
              label="Drop logo or text image here"
              hint="PNG, JPEG, WEBP"
              onFileSelected={(file) => {
                setImageFile(file);
                setImageDetection(null);
                setImageDetectionStatus("idle");
                setImageDetectionError(null);
                setReplaceStatus(null);
              }}
              onClear={() => {
                setImageFile(null);
                setImageDetection(null);
                setImageDetectionStatus("idle");
                setImageDetectionError(null);
              }}
            />

            {imagePreviewUrl && (
              <div className={styles.imagePreviewFrame}>
                <img className={styles.previewImage} src={imagePreviewUrl} alt="Text detection source" />
              </div>
            )}

            <button
              className={styles.secondaryBtn}
              type="button"
              onClick={handleAnalyzeImage}
              disabled={!imageFile || imageDetectionStatus === "running"}
            >
              {imageDetectionStatus === "running" ? "Analyzing image..." : "Analyze image text"}
            </button>

            {imageDetection && (
              <div className={styles.metaCard}>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Detected text</span>
                  <span className={styles.metaValue}>{imageDetection.text ?? "None"}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Font guess</span>
                  <span className={styles.metaValue}>{imageDetection.fontFamily ?? "Approximate"}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Candidates</span>
                  <span className={styles.metaValue}>{summarizeFontCandidates(imageDetection)}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Size / angle</span>
                  <span className={styles.metaValue}>
                    {`${imageDetection.estimatedFontSizePx ?? "?"} px / ${formatAngle(imageDetection.angleDeg ?? 0)}`}
                  </span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Confidence</span>
                  <span className={styles.metaValue}>{`${Math.round(imageDetection.confidence * 100)}%`}</span>
                </div>
              </div>
            )}

            {imageDetection?.notes?.length ? (
              <div className={styles.noteList}>
                {imageDetection.notes.map((note) => (
                  <div key={note} className={styles.noteItem}>{note}</div>
                ))}
              </div>
            ) : null}

            {imageDetection && (
              <button
                className={styles.secondaryBtn}
                type="button"
                onClick={handleApplyImageDetection}
              >
                Load detected image style into editor
              </button>
            )}

            {imageDetectionError && <div className={styles.errorText}>{imageDetectionError}</div>}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Replacement Editor</div>
            <input
              className={styles.textInput}
              type="text"
              placeholder="Replacement text"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Font Family</span>
              <input
                className={styles.textInput}
                list="text-tool-fonts"
                value={fontFamily}
                onChange={(event) => setFontFamily(event.target.value)}
              />
              <datalist id="text-tool-fonts">
                {detectedFontOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>

            <div className={styles.row}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Font Size</span>
                <input
                  className={styles.numInput}
                  type="number"
                  min={8}
                  max={400}
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                />
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Letter Spacing</span>
                <input
                  className={styles.numInput}
                  type="number"
                  min={-20}
                  max={80}
                  step={0.5}
                  value={letterSpacing}
                  onChange={(event) => setLetterSpacing(Number(event.target.value))}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Angle</span>
                <input
                  className={styles.numInput}
                  type="number"
                  min={-180}
                  max={180}
                  step={0.5}
                  value={angleDeg}
                  onChange={(event) => setAngleDeg(Number(event.target.value))}
                />
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Anchor</span>
                <select
                  className={styles.select}
                  value={textAnchor}
                  onChange={(event) => setTextAnchor(event.target.value as "start" | "middle" | "end")}
                >
                  <option value="start">Start</option>
                  <option value="middle">Middle</option>
                  <option value="end">End</option>
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Weight</span>
                <select
                  className={styles.select}
                  value={fontWeight}
                  onChange={(event) => setFontWeight(event.target.value)}
                >
                  <option value="normal">Regular</option>
                  <option value="bold">Bold</option>
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Style</span>
                <select
                  className={styles.select}
                  value={fontStyle}
                  onChange={(event) => setFontStyle(event.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </div>

              <div className={styles.fieldGroup} style={{ flex: "0 0 auto", alignItems: "flex-end" }}>
                <span className={styles.fieldLabel}>Fill</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  value={fillColor}
                  onChange={(event) => setFillColor(event.target.value)}
                />
              </div>
            </div>

            <div className={styles.previewBox}>
              {previewUrl ? (
                <img className={styles.previewImage} src={previewUrl} alt="Replacement text preview" />
              ) : (
                <span className={styles.previewPlaceholder}>Preview</span>
              )}
            </div>

            <div className={styles.buttonStack}>
              <button
                className={styles.addBtn}
                disabled={!text.trim()}
                onClick={handleAdd}
                type="button"
              >
                Add replacement as new SVG
              </button>
              <button
                className={styles.secondaryBtn}
                disabled={!selectedAsset || !selectedSvgTextNode || !text.trim()}
                onClick={handleReplace}
                type="button"
              >
                Replace selected SVG text in place
              </button>
            </div>

            {replaceStatus && <div className={styles.statusText}>{replaceStatus}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
