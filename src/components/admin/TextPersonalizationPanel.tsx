"use client";

import React, { useState, useMemo } from "react";
import JSZip from "jszip";
import styles from "./TextPersonalizationPanel.module.css";

export function TextPersonalizationPanel() {
  const [open, setOpen] = useState(false);
  const [templateText, setTemplateText] = useState("{{NAME}}");
  const [csvText, setCsvText] = useState("");
  const [previewIdx, setPreviewIdx] = useState(0);

  const names = useMemo(() => {
    return csvText
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        const commaIdx = trimmed.indexOf(",");
        if (commaIdx !== -1) {
          return trimmed.substring(0, commaIdx).trim();
        }
        return trimmed;
      })
      .filter((name) => name.length > 0);
  }, [csvText]);

  const previewText =
    names.length > 0
      ? templateText.replace(/\{\{NAME\}\}/g, names[previewIdx])
      : "";

  function handlePrev() {
    setPreviewIdx((i) => Math.max(0, i - 1));
  }

  function handleNext() {
    setPreviewIdx((i) => Math.min(names.length - 1, i + 1));
  }

  async function handleBatchExport() {
    if (names.length === 0 || !templateText.trim()) return;

    const zip = new JSZip();

    names.forEach((name, index) => {
      const substituted = templateText.replace(/\{\{NAME\}\}/g, name);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="40" text-anchor="middle" font-size="32" font-family="Arial" fill="black">${substituted}</text></svg>`;
      const fileName = `${index + 1}-${name.replace(/\s+/g, "-").toLowerCase()}.svg`;
      zip.file(fileName, svg);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "personalized-templates.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        <span className={styles.toggleLabel}>Text Personalization Templates</span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.label}>Template</div>
          <textarea
            className={styles.textarea}
            rows={2}
            placeholder="{{NAME}} — use {{NAME}} for the customer's name"
            value={templateText}
            onChange={(e) => setTemplateText(e.target.value)}
          />

          <div className={styles.label}>Names (one per line or CSV column)</div>
          <textarea
            className={styles.textarea}
            rows={5}
            placeholder={"Alice\nBob\nCharlie"}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreviewIdx(0);
            }}
          />

          {names.length > 0 && (
            <>
              <div className={styles.label}>Preview</div>
              <div className={styles.previewBox}>{previewText}</div>
              <div className={styles.previewNav}>
                <button
                  className={styles.navBtn}
                  onClick={handlePrev}
                  disabled={previewIdx === 0}
                >
                  ◀
                </button>
                <button
                  className={styles.navBtn}
                  onClick={handleNext}
                  disabled={previewIdx === names.length - 1}
                >
                  ▶
                </button>
                <span className={styles.navCount}>
                  {previewIdx + 1} of {names.length}
                </span>
              </div>
            </>
          )}

          <button
            className={styles.exportBtn}
            disabled={names.length === 0 || !templateText.trim()}
            onClick={handleBatchExport}
          >
            Batch Export ZIP
          </button>
        </div>
      )}
    </div>
  );
}
