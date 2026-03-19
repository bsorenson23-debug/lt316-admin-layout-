"use client";

import React from "react";
import type { BedConfig, PlacedItem } from "@/types/admin";
import type { BedMockupConfig } from "./LaserBedWorkspace";
import { svgToDataUrl } from "@/utils/svg";
import styles from "./ProofMockupPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  placedItems: PlacedItem[];
  mockupConfig: BedMockupConfig | null;
}

const CANVAS_MAX_PX = 1200;

export function ProofMockupPanel({ bedConfig, placedItems, mockupConfig }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const generate = React.useCallback(async () => {
    if (!mockupConfig || !canvasRef.current) return;
    setGenerating(true);
    setError(null);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load product image"));
        img.src = mockupConfig.src;
      });

      const scale = Math.min(CANVAS_MAX_PX / img.naturalWidth, CANVAS_MAX_PX / img.naturalHeight, 1);
      const canvasW = Math.round(img.naturalWidth * scale);
      const canvasH = Math.round(img.naturalHeight * scale);

      const canvas = canvasRef.current;
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, canvasW, canvasH);

      const printTopPx    = mockupConfig.printTopPct    * canvasH;
      const printBottomPx = mockupConfig.printBottomPct * canvasH;
      const printHeightPx = printBottomPx - printTopPx;

      if (printHeightPx <= 0 || bedConfig.width <= 0 || bedConfig.height <= 0) {
        throw new Error("Invalid print zone dimensions");
      }

      const scaleX = canvasW / bedConfig.width;
      const scaleY = printHeightPx / bedConfig.height;

      for (const item of placedItems) {
        const dataUrl = svgToDataUrl(item.svgText);
        const artImg = new Image();
        await new Promise<void>((res, rej) => {
          artImg.onload = () => res();
          artImg.onerror = () => rej(new Error(`Failed to load artwork: ${item.name}`));
          artImg.src = dataUrl;
        });

        const dstX = item.x * scaleX;
        const dstY = printTopPx + item.y * scaleY;
        const dstW = item.width  * scaleX;
        const dstH = item.height * scaleY;

        ctx.save();
        if (item.rotation) {
          const cx = dstX + dstW / 2;
          const cy = dstY + dstH / 2;
          ctx.translate(cx, cy);
          ctx.rotate((item.rotation * Math.PI) / 180);
          ctx.drawImage(artImg, -dstW / 2, -dstH / 2, dstW, dstH);
        } else {
          ctx.drawImage(artImg, dstX, dstY, dstW, dstH);
        }
        ctx.restore();
      }

      setPreviewUrl(canvas.toDataURL("image/png"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [mockupConfig, placedItems, bedConfig]);

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `proof-${Date.now()}.png`;
    a.click();
  };

  const handleCopy = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch { /* clipboard API not supported */ }
    });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Proof Mockup</span>
        {previewUrl && (
          <span className={styles.badge}>Ready</span>
        )}
      </div>

      <div className={styles.body}>
        {!mockupConfig && (
          <div className={styles.empty}>
            Load a tumbler photo via Auto-Detect to enable proof generation.
          </div>
        )}

        {mockupConfig && (
          <>
            <div className={styles.btnRow}>
              <button
                className={styles.primaryBtn}
                onClick={generate}
                disabled={generating || placedItems.length === 0}
              >
                {generating ? "Generating…" : "Generate Proof"}
              </button>
              {previewUrl && (
                <>
                  <button className={styles.secondaryBtn} onClick={handleDownload} title="Download PNG">
                    ↓ PNG
                  </button>
                  <button className={styles.secondaryBtn} onClick={handleCopy} title="Copy to clipboard">
                    {copied ? "✓" : "Copy"}
                  </button>
                </>
              )}
            </div>

            {placedItems.length === 0 && (
              <div className={styles.hint}>Place artwork on the bed first.</div>
            )}

            {error && (
              <div className={styles.errorMsg}>{error}</div>
            )}

            {previewUrl && (
              <div className={styles.previewWrap}>
                <img src={previewUrl} alt="Proof mockup" className={styles.previewImg} />
              </div>
            )}
          </>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} aria-hidden="true" />
    </section>
  );
}
