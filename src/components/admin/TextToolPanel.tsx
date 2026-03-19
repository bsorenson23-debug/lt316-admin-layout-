"use client";
import React from "react";
import styles from "./TextToolPanel.module.css";

interface Props {
  onAddAsset: (svgContent: string, fileName: string) => void;
}

export function TextToolPanel({ onAddAsset }: Props) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [fontSize, setFontSize] = React.useState(48);
  const [fontFamily, setFontFamily] = React.useState("Arial");
  const [bold, setBold] = React.useState(false);
  const [italic, setItalic] = React.useState(false);
  const [fillColor, setFillColor] = React.useState("#000000");
  const [letterSpacing, setLetterSpacing] = React.useState(0);

  const svgWidth = text.length * fontSize * 0.6 + 20;
  const svgHeight = fontSize * 1.4;

  function handleAdd() {
    if (!text.trim()) return;
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}"><text x="10" y="${fontSize * 1.1}" font-size="${fontSize}" font-family="${fontFamily}" font-weight="${bold ? "bold" : "normal"}" font-style="${italic ? "italic" : "normal"}" fill="${fillColor}" letter-spacing="${letterSpacing}">${text}</text></svg>`;
    const fileName = `${text.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}-text.svg`;
    onAddAsset(svgString, fileName);
  }

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((o) => !o)}>
        <span className={styles.toggleLabel}>Built-in Text Tool</span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <input
            className={styles.textInput}
            type="text"
            placeholder="Enter text…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Font Family</span>
            <select
              className={styles.select}
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            >
              <option>Arial</option>
              <option>Verdana</option>
              <option>Georgia</option>
              <option>Courier New</option>
              <option>Impact</option>
              <option>Tahoma</option>
            </select>
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
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </div>

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Letter Spacing</span>
              <input
                className={styles.numInput}
                type="number"
                min={-10}
                max={50}
                step={0.5}
                value={letterSpacing}
                onChange={(e) => setLetterSpacing(Number(e.target.value))}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.checkRow}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={bold}
                  onChange={(e) => setBold(e.target.checked)}
                />
                Bold
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={italic}
                  onChange={(e) => setItalic(e.target.checked)}
                />
                Italic
              </label>
            </div>

            <div className={styles.fieldGroup} style={{ flex: "0 0 auto", alignItems: "flex-end" }}>
              <span className={styles.fieldLabel}>Fill</span>
              <input
                className={styles.colorInput}
                type="color"
                value={fillColor}
                onChange={(e) => setFillColor(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.previewBox}>
            {text ? (
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                width="100%"
                style={{ maxHeight: 80 }}
              >
                <text
                  x="10"
                  y={fontSize * 1.1}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  fontWeight={bold ? "bold" : "normal"}
                  fontStyle={italic ? "italic" : "normal"}
                  fill={fillColor}
                  letterSpacing={letterSpacing}
                >
                  {text}
                </text>
              </svg>
            ) : (
              <span style={{ fontSize: 11, color: "#aaa" }}>Preview</span>
            )}
          </div>

          <button
            className={styles.addBtn}
            disabled={!text.trim()}
            onClick={handleAdd}
          >
            Add to Bed
          </button>
        </div>
      )}
    </div>
  );
}
