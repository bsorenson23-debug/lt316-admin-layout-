"use client";

import React from "react";
import type {
  RasterBackgroundStrategy,
  RasterBedPreviewTarget,
  RasterPreviewBackground,
  RasterTraceMode,
  RasterTraceRecipe,
  RasterVectorizeBranchPreviews,
  RasterVectorizeResponse,
} from "@/types/rasterVectorize";
import { svgToDataUrl } from "@/utils/svg";
import { despeckleSvgPaths, repairSvgPaths } from "@/utils/svgPathRepair";
import { FileDropZone } from "./shared/FileDropZone";
import styles from "./RasterToSvgPanel.module.css";

interface Props {
  onAddAsset: (svgContent: string, fileName: string) => void;
  openSignal?: number;
  onPreviewChange?: (preview: RasterToSvgPreviewState | null) => void;
}

type Status = "idle" | "running" | "done" | "error";
type ThresholdMode = "auto" | "manual";

export interface RasterToSvgPreviewState {
  sourceFileName: string | null;
  previewSvgText: string | null;
  previewFile: File | null;
  status: Status;
  previewImageUrl?: string | null;
  previewLabel?: string | null;
  previewBackground?: RasterPreviewBackground;
  previewTarget?: RasterBedPreviewTarget;
}

interface RecipeDefinition {
  id: RasterTraceRecipe;
  label: string;
  description: string;
  apply: () => Partial<{
    traceMode: RasterTraceMode;
    thresholdMode: ThresholdMode;
    threshold: number;
    invert: boolean;
    trimWhitespace: boolean;
    normalizeLevels: boolean;
    turdSize: number;
    alphaMax: number;
    optTolerance: number;
    posterizeSteps: number;
    preserveText: boolean;
    backgroundStrategy: RasterBackgroundStrategy;
    previewTarget: RasterBedPreviewTarget;
  }>;
}

interface SvgPaintEntry {
  color: string;
  count: number;
}

function basename(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function normalizeSvgPaintColor(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed === "none" ||
    trimmed === "transparent" ||
    trimmed === "currentcolor" ||
    trimmed === "inherit" ||
    trimmed.startsWith("url(")
  ) {
    return null;
  }

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return `#${hex
        .split("")
        .map((channel) => `${channel}${channel}`)
        .join("")}`;
    }
    if (hex.length === 4) {
      const expanded = hex
        .split("")
        .map((channel) => `${channel}${channel}`)
        .join("");
      if (expanded.slice(6) === "00") return null;
      return `#${expanded.slice(0, 6)}`;
    }
    if (hex.length === 6) return `#${hex}`;
    if (hex.length === 8) {
      if (hex.slice(6) === "00") return null;
      return `#${hex.slice(0, 6)}`;
    }
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const channels = rgbMatch[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (channels.length < 3) return null;
    const alpha = channels[3] !== undefined ? Number.parseFloat(channels[3]) : 1;
    if (Number.isFinite(alpha) && alpha <= 0) return null;

    const rgb = channels
      .slice(0, 3)
      .map((channel) => clampByte(Number.parseFloat(channel.replace("%", ""))));

    if (rgb.some((channel) => !Number.isFinite(channel))) return null;
    return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  return trimmed;
}

function parseStyleDeclarations(styleText: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const entry of styleText.split(";")) {
    const [property, ...rest] = entry.split(":");
    if (!property || rest.length === 0) continue;
    const key = property.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!key || !value) continue;
    declarations.set(key, value);
  }
  return declarations;
}

function serializeStyleDeclarations(declarations: Map<string, string>): string {
  return [...declarations.entries()]
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function collectSvgPaintEntries(svgContent: string): SvgPaintEntry[] {
  if (!svgContent || typeof DOMParser === "undefined") return [];

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svgContent, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) return [];

  const counts = new Map<string, number>();
  const bump = (rawValue: string | null | undefined) => {
    const normalized = normalizeSvgPaintColor(rawValue);
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  };

  documentNode.querySelectorAll("*").forEach((element) => {
    bump(element.getAttribute("fill"));
    bump(element.getAttribute("stroke"));
    bump(element.getAttribute("stop-color"));

    const style = element.getAttribute("style");
    if (!style) return;

    const declarations = parseStyleDeclarations(style);
    bump(declarations.get("fill"));
    bump(declarations.get("stroke"));
    bump(declarations.get("stop-color"));
  });

  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((left, right) => right.count - left.count || left.color.localeCompare(right.color));
}

function filterSvgPaintColors(svgContent: string, hiddenColors: Set<string>): string {
  if (!svgContent || hiddenColors.size === 0 || typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return svgContent;
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svgContent, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) return svgContent;

  const hideAttribute = (element: Element, attributeName: string) => {
    const normalized = normalizeSvgPaintColor(element.getAttribute(attributeName));
    if (!normalized || !hiddenColors.has(normalized)) return;

    if (attributeName === "stop-color") {
      element.setAttribute("stop-color", "#ffffff");
      element.setAttribute("stop-opacity", "0");
      return;
    }

    element.setAttribute(attributeName, "none");
  };

  documentNode.querySelectorAll("*").forEach((element) => {
    hideAttribute(element, "fill");
    hideAttribute(element, "stroke");
    hideAttribute(element, "stop-color");

    const style = element.getAttribute("style");
    if (!style) return;

    const declarations = parseStyleDeclarations(style);
    let changed = false;

    for (const property of ["fill", "stroke", "stop-color"] as const) {
      const normalized = normalizeSvgPaintColor(declarations.get(property));
      if (!normalized || !hiddenColors.has(normalized)) continue;

      if (property === "stop-color") {
        declarations.set("stop-color", "#ffffff");
        declarations.set("stop-opacity", "0");
      } else {
        declarations.set(property, "none");
      }
      changed = true;
    }

    if (!changed) return;
    element.setAttribute("style", serializeStyleDeclarations(declarations));
  });

  return new XMLSerializer().serializeToString(documentNode);
}

async function cleanCutoutBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare a canvas for cutout cleanup");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    if (alpha <= 18) {
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
      continue;
    }

    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

    let nextAlpha = alpha;
    if (alpha < 72) {
      nextAlpha = Math.max(0, Math.round((alpha - 18) * 1.15));
    } else if (alpha < 140) {
      nextAlpha = Math.round(alpha * 0.88);
    }

    if (alpha < 160 && chroma < 24) {
      nextAlpha = Math.round(nextAlpha * 0.72);
    }

    if (nextAlpha <= 12) {
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
      continue;
    }

    pixels[offset + 3] = Math.min(255, Math.max(0, nextAlpha));
  }

  context.putImageData(imageData, 0, 0);

  const cleanedBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Could not encode the cleaned cutout image"));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  return cleanedBlob;
}

function computeLuma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function computeOtsuThreshold(histogram: number[], total: number): number {
  if (total <= 0) return 160;

  let sum = 0;
  for (let index = 0; index < 256; index += 1) {
    sum += index * histogram[index];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 160;

  for (let index = 0; index < 256; index += 1) {
    weightBackground += histogram[index];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const varianceBetween = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      threshold = index;
    }
  }

  return threshold;
}

async function buildThresholdPreview(
  blob: Blob,
  options: {
    thresholdMode: ThresholdMode;
    threshold: number;
    invert: boolean;
    normalizeLevels: boolean;
    preserveText: boolean;
    recipe: RasterTraceRecipe;
  },
): Promise<{ blob: Blob; effectiveThreshold: number }> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare a canvas for threshold preview");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const histogram = new Array<number>(256).fill(0);
  const grayscale = new Uint8Array(canvas.width * canvas.height);

  let minLuma = 255;
  let maxLuma = 0;
  let sampleCount = 0;

  for (let offset = 0, index = 0; offset < pixels.length; offset += 4, index += 1) {
    const alpha = pixels[offset + 3];
    if (alpha <= 16) {
      grayscale[index] = 255;
      continue;
    }

    const luma = clampByte(computeLuma(pixels[offset], pixels[offset + 1], pixels[offset + 2]));
    grayscale[index] = luma;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    sampleCount += 1;
  }

  const shouldNormalize = options.normalizeLevels && sampleCount > 0 && maxLuma > minLuma;
  const range = Math.max(1, maxLuma - minLuma);

  for (let index = 0; index < grayscale.length; index += 1) {
    const raw = grayscale[index];
    const alpha = pixels[index * 4 + 3];
    if (alpha <= 16) continue;

    const value = shouldNormalize
      ? clampByte(((raw - minLuma) * 255) / range)
      : raw;
    grayscale[index] = value;
    histogram[value] += 1;
  }

  const effectiveThreshold = options.thresholdMode === "auto"
    ? computeOtsuThreshold(histogram, sampleCount)
    : options.threshold;

  const darkMask = new Uint8Array(canvas.width * canvas.height);
  for (let offset = 0, index = 0; offset < pixels.length; offset += 4, index += 1) {
    const alpha = pixels[offset + 3];
    if (alpha <= 16) {
      continue;
    }

    const isDark = grayscale[index] <= effectiveThreshold;
    darkMask[index] = options.invert ? (isDark ? 0 : 1) : (isDark ? 1 : 0);
  }

  const separationMask = new Uint8Array(darkMask.length);
  const colorDeltaThreshold =
    options.recipe === "line-art"
      ? 16
      : options.recipe === "script-logo" || options.preserveText
        ? 12
        : options.recipe === "stamp"
          ? 20
          : 18;

  const gradientThreshold =
    options.recipe === "line-art"
      ? 8
      : options.recipe === "script-logo" || options.preserveText
        ? 6
        : 10;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = y * canvas.width + x;
      if (darkMask[index] !== 1) {
        continue;
      }

      let markSeparation = false;
      const offset = index * 4;
      const baseRed = pixels[offset];
      const baseGreen = pixels[offset + 1];
      const baseBlue = pixels[offset + 2];
      const baseGray = grayscale[index];

      for (let neighborY = y - 1; neighborY <= y + 1 && !markSeparation; neighborY += 1) {
        for (let neighborX = x - 1; neighborX <= x + 1; neighborX += 1) {
          if (neighborX === x && neighborY === y) {
            continue;
          }

          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= canvas.width ||
            neighborY >= canvas.height
          ) {
            markSeparation = true;
            break;
          }

          const neighborIndex = neighborY * canvas.width + neighborX;
          if (darkMask[neighborIndex] === 0) {
            markSeparation = true;
            break;
          }

          const neighborOffset = neighborIndex * 4;
          const delta = Math.sqrt(
            (pixels[neighborOffset] - baseRed) ** 2 +
            (pixels[neighborOffset + 1] - baseGreen) ** 2 +
            (pixels[neighborOffset + 2] - baseBlue) ** 2,
          );
          const grayscaleDelta = Math.abs(grayscale[neighborIndex] - baseGray);
          if (delta >= colorDeltaThreshold || grayscaleDelta >= gradientThreshold) {
            markSeparation = true;
            break;
          }
        }
      }

      if (markSeparation) {
        separationMask[index] = 1;
      }
    }
  }

  const separationRadius =
    options.recipe === "stamp" ? 2 : options.recipe === "script-logo" || options.preserveText ? 1 : 1;
  if (separationRadius > 1) {
    const grown = new Uint8Array(separationMask.length);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = y * canvas.width + x;
        if (separationMask[index] !== 1) {
          continue;
        }

        for (let neighborY = Math.max(0, y - separationRadius); neighborY <= Math.min(canvas.height - 1, y + separationRadius); neighborY += 1) {
          for (let neighborX = Math.max(0, x - separationRadius); neighborX <= Math.min(canvas.width - 1, x + separationRadius); neighborX += 1) {
            grown[(neighborY * canvas.width) + neighborX] = 1;
          }
        }
      }
    }
    separationMask.set(grown);
  }

  const finalDarkMask = new Uint8Array(darkMask.length);
  for (let offset = 0, index = 0; offset < pixels.length; offset += 4, index += 1) {
    const alpha = pixels[offset + 3];
    if (alpha <= 16) {
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 255;
      continue;
    }

    finalDarkMask[index] = darkMask[index] === 1 && separationMask[index] !== 1 ? 1 : 0;
  }

  const smoothingKernel =
    options.recipe === "line-art"
      ? [
          [0, 1, 0],
          [1, 4, 1],
          [0, 1, 0],
        ]
      : [
          [1, 2, 1],
          [2, 4, 2],
          [1, 2, 1],
        ];

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = y * canvas.width + x;
      const offset = index * 4;
      const alpha = pixels[offset + 3];
      if (alpha <= 16) {
        continue;
      }

      let coverage = 0;
      let weight = 0;
      for (let kernelY = -1; kernelY <= 1; kernelY += 1) {
        for (let kernelX = -1; kernelX <= 1; kernelX += 1) {
          const sampleX = x + kernelX;
          const sampleY = y + kernelY;
          if (sampleX < 0 || sampleY < 0 || sampleX >= canvas.width || sampleY >= canvas.height) {
            continue;
          }

          const kernelValue = smoothingKernel[kernelY + 1][kernelX + 1];
          coverage += finalDarkMask[(sampleY * canvas.width) + sampleX] * kernelValue;
          weight += kernelValue;
        }
      }

      const normalizedCoverage = weight > 0 ? coverage / weight : finalDarkMask[index];
      let value = 255 - Math.round(normalizedCoverage * 255);
      if (normalizedCoverage >= 0.96) value = 0;
      if (normalizedCoverage <= 0.04) value = 255;

      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);

  const previewBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Could not encode threshold preview"));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  return {
    blob: previewBlob,
    effectiveThreshold,
  };
}

function estimateEdgeBackground(pixels: Uint8ClampedArray, width: number, height: number): {
  red: number;
  green: number;
  blue: number;
  luma: number;
} {
  const edge = Math.max(4, Math.min(28, Math.round(Math.min(width, height) * 0.035)));
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isEdge =
        x < edge ||
        y < edge ||
        x >= width - edge ||
        y >= height - edge;
      if (!isEdge) continue;

      const offset = (y * width + x) * 4;
      totalRed += pixels[offset];
      totalGreen += pixels[offset + 1];
      totalBlue += pixels[offset + 2];
      count += 1;
    }
  }

  const red = count > 0 ? totalRed / count : 255;
  const green = count > 0 ? totalGreen / count : 255;
  const blue = count > 0 ? totalBlue / count : 255;
  return {
    red,
    green,
    blue,
    luma: computeLuma(red, green, blue),
  };
}

function buildLumaMap(pixels: Uint8ClampedArray, width: number, height: number): Float32Array {
  const lumaMap = new Float32Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    lumaMap[index] = computeLuma(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }
  return lumaMap;
}

function sampleEdgeStrength(lumaMap: Float32Array, width: number, height: number, x: number, y: number): number {
  const center = lumaMap[(y * width) + x];
  let strongestDelta = 0;

  for (let neighborY = Math.max(0, y - 1); neighborY <= Math.min(height - 1, y + 1); neighborY += 1) {
    for (let neighborX = Math.max(0, x - 1); neighborX <= Math.min(width - 1, x + 1); neighborX += 1) {
      if (neighborX === x && neighborY === y) {
        continue;
      }

      const delta = Math.abs(center - lumaMap[(neighborY * width) + neighborX]);
      if (delta > strongestDelta) {
        strongestDelta = delta;
      }
    }
  }

  return strongestDelta;
}

async function repairCutoutWithSource(sourceBlob: Blob, cutoutBlob: Blob): Promise<Blob> {
  const [sourceBitmap, cutoutBitmap] = await Promise.all([
    createImageBitmap(sourceBlob),
    createImageBitmap(cutoutBlob),
  ]);

  const width = cutoutBitmap.width;
  const height = cutoutBitmap.height;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });

  if (!sourceContext || !outputContext) {
    sourceBitmap.close();
    cutoutBitmap.close();
    throw new Error("Could not prepare canvases for cutout repair");
  }

  sourceContext.clearRect(0, 0, width, height);
  sourceContext.drawImage(sourceBitmap, 0, 0, width, height);
  outputContext.clearRect(0, 0, width, height);
  outputContext.drawImage(cutoutBitmap, 0, 0, width, height);
  sourceBitmap.close();
  cutoutBitmap.close();

  const sourceImageData = sourceContext.getImageData(0, 0, width, height);
  const outputImageData = outputContext.getImageData(0, 0, width, height);
  const sourcePixels = sourceImageData.data;
  const outputPixels = outputImageData.data;
  const background = estimateEdgeBackground(sourcePixels, width, height);
  const darkBackground = background.luma <= 96;
  const sourceLumaMap = buildLumaMap(sourcePixels, width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      const offset = index * 4;
      const sourceRed = sourcePixels[offset];
      const sourceGreen = sourcePixels[offset + 1];
      const sourceBlue = sourcePixels[offset + 2];
      const cutoutAlpha = outputPixels[offset + 3];
      const sourceLuma = sourceLumaMap[index];
      const lumaDelta = Math.abs(sourceLuma - background.luma);
      const chroma = Math.max(sourceRed, sourceGreen, sourceBlue) - Math.min(sourceRed, sourceGreen, sourceBlue);
      const colorDistance = Math.sqrt(
        (sourceRed - background.red) ** 2 +
        (sourceGreen - background.green) ** 2 +
        (sourceBlue - background.blue) ** 2,
      );
      const edgeStrength = sampleEdgeStrength(sourceLumaMap, width, height, x, y);
      const structuredPixel = edgeStrength >= (darkBackground ? 18 : 14);
      const crispPixel = edgeStrength >= (darkBackground ? 28 : 22);
      const likelyShadow =
        cutoutAlpha < 168 &&
        chroma < 18 &&
        edgeStrength < (darkBackground ? 12 : 10) &&
        colorDistance < (darkBackground ? 46 : 54) &&
        lumaDelta < (darkBackground ? 58 : 64);

      if (likelyShadow) {
        if (cutoutAlpha <= 48) {
          outputPixels[offset] = 0;
          outputPixels[offset + 1] = 0;
          outputPixels[offset + 2] = 0;
          outputPixels[offset + 3] = 0;
        } else {
          outputPixels[offset + 3] = Math.round(cutoutAlpha * 0.38);
        }
        continue;
      }

      const mediumForeground =
        chroma > 30 ||
        colorDistance > (darkBackground ? 34 : 42) ||
        (lumaDelta > (darkBackground ? 18 : 26) && structuredPixel);
      const strongForeground =
        chroma > 42 ||
        colorDistance > (darkBackground ? 46 : 56) ||
        (lumaDelta > (darkBackground ? 28 : 36) && crispPixel);

      if (cutoutAlpha <= 18) {
        if (!strongForeground) {
          outputPixels[offset] = 0;
          outputPixels[offset + 1] = 0;
          outputPixels[offset + 2] = 0;
          outputPixels[offset + 3] = 0;
          continue;
        }

        outputPixels[offset] = sourceRed;
        outputPixels[offset + 1] = sourceGreen;
        outputPixels[offset + 2] = sourceBlue;
        outputPixels[offset + 3] = Math.min(
          220,
          Math.max(
            darkBackground ? 110 : 96,
            Math.round(colorDistance * 1.85 + chroma * 0.9 + edgeStrength * 0.85),
          ),
        );
        continue;
      }

      if (cutoutAlpha < 180 && mediumForeground) {
        outputPixels[offset] = sourceRed;
        outputPixels[offset + 1] = sourceGreen;
        outputPixels[offset + 2] = sourceBlue;
        outputPixels[offset + 3] = Math.max(
          cutoutAlpha,
          Math.min(
            235,
            Math.round((darkBackground ? 96 : 84) + colorDistance * 1.45 + chroma * 0.45 + edgeStrength * 0.75),
          ),
        );
      }
    }
  }

  outputContext.putImageData(outputImageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Could not encode repaired cutout image"));
        return;
      }
      resolve(result);
    }, "image/png");
  });
}

async function buildHybridTextPreserveRaster(sourceBlob: Blob, cutoutBlob: Blob): Promise<Blob> {
  const [sourceBitmap, cutoutBitmap] = await Promise.all([
    createImageBitmap(sourceBlob),
    createImageBitmap(cutoutBlob),
  ]);

  const width = cutoutBitmap.width;
  const height = cutoutBitmap.height;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });

  if (!sourceContext || !outputContext) {
    sourceBitmap.close();
    cutoutBitmap.close();
    throw new Error("Could not prepare canvases for hybrid cutout composition");
  }

  sourceContext.clearRect(0, 0, width, height);
  sourceContext.drawImage(sourceBitmap, 0, 0, width, height);
  outputContext.clearRect(0, 0, width, height);
  outputContext.drawImage(cutoutBitmap, 0, 0, width, height);
  sourceBitmap.close();
  cutoutBitmap.close();

  const sourceImageData = sourceContext.getImageData(0, 0, width, height);
  const outputImageData = outputContext.getImageData(0, 0, width, height);
  const sourcePixels = sourceImageData.data;
  const outputPixels = outputImageData.data;
  const background = estimateEdgeBackground(sourcePixels, width, height);
  const darkBackground = background.luma <= 96;
  const sourceLumaMap = buildLumaMap(sourcePixels, width, height);

  for (let y = 0; y < height; y += 1) {
    const topRatio = y / Math.max(1, height - 1);
    const textBandBias = topRatio <= 0.26 ? 1 : topRatio <= 0.44 ? 1 - (topRatio - 0.26) / 0.18 : 0;

    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const sourceRed = sourcePixels[offset];
      const sourceGreen = sourcePixels[offset + 1];
      const sourceBlue = sourcePixels[offset + 2];
      const cutoutAlpha = outputPixels[offset + 3];
      const sourceLuma = sourceLumaMap[(y * width) + x];
      const lumaDelta = Math.abs(sourceLuma - background.luma);
      const chroma = Math.max(sourceRed, sourceGreen, sourceBlue) - Math.min(sourceRed, sourceGreen, sourceBlue);
      const colorDistance = Math.sqrt(
        (sourceRed - background.red) ** 2 +
        (sourceGreen - background.green) ** 2 +
        (sourceBlue - background.blue) ** 2,
      );
      const edgeStrength = sampleEdgeStrength(sourceLumaMap, width, height, x, y);
      const structuredPixel = edgeStrength >= (darkBackground ? 16 : 12);
      const crispTextPixel = edgeStrength >= (darkBackground ? 22 : 18);

      const likelyForeground =
        colorDistance > (darkBackground ? 28 : 36) ||
        chroma > 20 ||
        (lumaDelta > (darkBackground ? 15 : 22) && structuredPixel);
      const likelyTextStroke =
        textBandBias > 0 &&
        crispTextPixel &&
        (colorDistance > (darkBackground ? 18 : 26) || chroma > 10 || lumaDelta > (darkBackground ? 12 : 18));
      const likelyTextShadow =
        textBandBias > 0 &&
        cutoutAlpha < 200 &&
        chroma < 14 &&
        edgeStrength < (darkBackground ? 14 : 11) &&
        colorDistance < (darkBackground ? 42 : 50);

      if (likelyTextShadow) {
        if (cutoutAlpha <= 36) {
          outputPixels[offset] = 0;
          outputPixels[offset + 1] = 0;
          outputPixels[offset + 2] = 0;
          outputPixels[offset + 3] = 0;
        } else {
          outputPixels[offset + 3] = Math.round(cutoutAlpha * 0.42);
        }
        continue;
      }

      if (!likelyForeground && !likelyTextStroke) {
        continue;
      }

      if (likelyTextStroke && cutoutAlpha < 220) {
        const blendStrength = Math.max(0.25, Math.min(0.92, textBandBias * 0.9 + edgeStrength / 64));
        outputPixels[offset] = Math.round(outputPixels[offset] * (1 - blendStrength) + sourceRed * blendStrength);
        outputPixels[offset + 1] = Math.round(outputPixels[offset + 1] * (1 - blendStrength) + sourceGreen * blendStrength);
        outputPixels[offset + 2] = Math.round(outputPixels[offset + 2] * (1 - blendStrength) + sourceBlue * blendStrength);
        outputPixels[offset + 3] = Math.max(
          cutoutAlpha,
          Math.min(255, Math.round(132 + colorDistance * 0.9 + chroma * 0.8 + edgeStrength * 0.9)),
        );
        continue;
      }

      if (cutoutAlpha <= 24 && likelyForeground) {
        outputPixels[offset] = sourceRed;
        outputPixels[offset + 1] = sourceGreen;
        outputPixels[offset + 2] = sourceBlue;
        outputPixels[offset + 3] = Math.min(210, Math.max(84, Math.round(102 + colorDistance * 1.05 + edgeStrength * 0.65)));
      }
    }
  }

  outputContext.putImageData(outputImageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Could not encode hybrid cutout image"));
        return;
      }
      resolve(result);
    }, "image/png");
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Could not decode background-removal output");
  }
  return response.blob();
}

export function RasterToSvgPanel({ onAddAsset, openSignal = 0, onPreviewChange }: Props) {
  const vectorizeRequestIdRef = React.useRef(0);
  const [open, setOpen] = React.useState(false);
  const [sourceFile, setSourceFile] = React.useState<File | null>(null);
  const [workingFile, setWorkingFile] = React.useState<File | null>(null);
  const [hybridFile, setHybridFile] = React.useState<File | null>(null);
  const [traceMode, setTraceMode] = React.useState<RasterTraceMode>("trace");
  const [traceRecipe, setTraceRecipe] = React.useState<RasterTraceRecipe>("badge");
  const [thresholdMode, setThresholdMode] = React.useState<ThresholdMode>("auto");
  const [threshold, setThreshold] = React.useState(160);
  const [invert, setInvert] = React.useState(false);
  const [trimWhitespace, setTrimWhitespace] = React.useState(true);
  const [normalizeLevels, setNormalizeLevels] = React.useState(true);
  const [turdSize, setTurdSize] = React.useState(0);
  const [alphaMax, setAlphaMax] = React.useState(0.35);
  const [optTolerance, setOptTolerance] = React.useState(0.05);
  const [posterizeSteps, setPosterizeSteps] = React.useState(4);
  const [preserveText, setPreserveText] = React.useState(true);
  const [backgroundStrategy, setBackgroundStrategy] = React.useState<RasterBackgroundStrategy>("original");
  const [outputColor, setOutputColor] = React.useState("#000000");
  const [previewBackground, setPreviewBackground] = React.useState<RasterPreviewBackground>("light");
  const [bedPreviewTarget, setBedPreviewTarget] = React.useState<RasterBedPreviewTarget>("result");
  const [bgStatus, setBgStatus] = React.useState<Status>("idle");
  const [traceStatus, setTraceStatus] = React.useState<Status>("idle");
  const [traceError, setTraceError] = React.useState<string | null>(null);
  const [svgText, setSvgText] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<{ pathCount: number; width: number; height: number } | null>(null);
  const [traceEngine, setTraceEngine] = React.useState<"potrace" | "asset-pipeline" | null>(null);
  const [branchPreviews, setBranchPreviews] = React.useState<RasterVectorizeBranchPreviews | null>(null);
  const [hiddenSvgColors, setHiddenSvgColors] = React.useState<string[]>([]);
  const [bgEngine, setBgEngine] = React.useState<string | null>(null);
  const [despeckleLevel, setDespeckleLevel] = React.useState(1);

  const activeFile = React.useMemo(() => {
    if (backgroundStrategy === "cutout" && workingFile) return workingFile;
    if (backgroundStrategy === "hybrid" && hybridFile) return hybridFile;
    if (backgroundStrategy === "hybrid" && workingFile) return workingFile;
    return sourceFile;
  }, [backgroundStrategy, hybridFile, sourceFile, workingFile]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = React.useState<string | null>(null);
  const [workingPreviewUrl, setWorkingPreviewUrl] = React.useState<string | null>(null);
  const [hybridPreviewUrl, setHybridPreviewUrl] = React.useState<string | null>(null);
  const [thresholdPreviewUrl, setThresholdPreviewUrl] = React.useState<string | null>(null);
  const [effectiveThreshold, setEffectiveThreshold] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!sourceFile) {
      setSourcePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourcePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  React.useEffect(() => {
    if (!workingFile) {
      setWorkingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(workingFile);
    setWorkingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [workingFile]);

  React.useEffect(() => {
    if (!hybridFile) {
      setHybridPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(hybridFile);
    setHybridPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [hybridFile]);

  React.useEffect(() => {
    if (!sourceFile || !workingFile) {
      setHybridFile(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const hybridBlob = await buildHybridTextPreserveRaster(sourceFile, workingFile);
        if (cancelled) return;
        setHybridFile(
          new File([hybridBlob], `${basename(sourceFile.name)}-hybrid.png`, { type: "image/png" }),
        );
      } catch {
        if (cancelled) return;
        setHybridFile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceFile, workingFile]);

  React.useEffect(() => {
    if (!activeFile) {
      setThresholdPreviewUrl(null);
      setEffectiveThreshold(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const preview = await buildThresholdPreview(activeFile, {
          thresholdMode,
          threshold,
          invert,
          normalizeLevels,
          preserveText,
          recipe: traceRecipe,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(preview.blob);
        setThresholdPreviewUrl(objectUrl);
        setEffectiveThreshold(preview.effectiveThreshold);
      } catch {
        if (cancelled) return;
        setThresholdPreviewUrl(null);
        setEffectiveThreshold(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeFile, invert, normalizeLevels, preserveText, threshold, thresholdMode, traceRecipe]);

  React.useEffect(() => {
    if (traceMode === "trace") {
      return;
    }

    setBedPreviewTarget((current) => {
      if (current === "thresholdPreview") {
        return branchPreviews?.colorPreview ? "colorPreview" : "result";
      }
      return current;
    });
  }, [branchPreviews?.colorPreview, traceMode]);

  const hiddenSvgColorSet = React.useMemo(() => new Set(hiddenSvgColors), [hiddenSvgColors]);
  const posterizedPaintEntries = React.useMemo(
    () => (traceMode === "posterize" && svgText ? collectSvgPaintEntries(svgText) : []),
    [svgText, traceMode],
  );
  const filteredSvgText = React.useMemo(() => {
    if (!svgText) return null;
    if (traceMode !== "posterize" || hiddenSvgColors.length === 0) return svgText;
    return filterSvgPaintColors(svgText, hiddenSvgColorSet);
  }, [hiddenSvgColorSet, hiddenSvgColors.length, svgText, traceMode]);
  const cleanedSvgResult = React.useMemo(() => {
    if (!filteredSvgText) return null;

    const repairedSvgText = repairSvgPaths(filteredSvgText).fixed;
    if (despeckleLevel <= 0) {
      return { cleaned: repairedSvgText, removedPathCount: 0 };
    }

    return despeckleSvgPaths(repairedSvgText, { level: despeckleLevel });
  }, [despeckleLevel, filteredSvgText]);
  const cleanedSvgText = cleanedSvgResult?.cleaned ?? null;
  const svgPreviewUrl = React.useMemo(
    () => (cleanedSvgText ? svgToDataUrl(cleanedSvgText) : null),
    [cleanedSvgText],
  );
  const bedPreviewImageUrl = React.useMemo(() => {
    switch (bedPreviewTarget) {
      case "source":
        if (backgroundStrategy === "hybrid" && hybridPreviewUrl) return hybridPreviewUrl;
        if (backgroundStrategy === "cutout" && workingPreviewUrl) return workingPreviewUrl;
        return sourcePreviewUrl;
      case "thresholdPreview":
        return thresholdPreviewUrl;
      case "colorPreview":
      case "textPreview":
      case "arcTextPreview":
      case "scriptTextPreview":
      case "shapePreview":
      case "contourPreview":
        return branchPreviews?.[bedPreviewTarget] ?? null;
      case "result":
      default:
        return null;
    }
  }, [backgroundStrategy, bedPreviewTarget, branchPreviews, hybridPreviewUrl, sourcePreviewUrl, thresholdPreviewUrl, workingPreviewUrl]);

  React.useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
    }
  }, [openSignal]);

  const bedPreviewLabel = React.useMemo(() => {
    if (bedPreviewTarget === "result") return "Smart trace result";
    if (bedPreviewTarget === "source") {
      if (backgroundStrategy === "hybrid" && hybridFile) return "Hybrid raster review";
      if (backgroundStrategy === "cutout" && workingFile) return "Cutout raster review";
      return "Original raster review";
    }
    if (bedPreviewTarget === "thresholdPreview") {
      return `Threshold preview${effectiveThreshold !== null ? ` • ${effectiveThreshold}` : ""}`;
    }
    switch (bedPreviewTarget) {
      case "colorPreview":
        return "Color map";
      case "textPreview":
        return "Text branch";
      case "arcTextPreview":
        return "Arc text";
      case "scriptTextPreview":
        return "Script text";
      case "shapePreview":
        return "Shape branch";
      case "contourPreview":
        return "Contour branch";
      default:
        return "Branch review";
    }
  }, [backgroundStrategy, bedPreviewTarget, effectiveThreshold, hybridFile, workingFile]);

  React.useEffect(() => {
    if (!onPreviewChange) return;
    if (!open || (!activeFile && !cleanedSvgText)) {
      onPreviewChange(null);
      return;
    }

    onPreviewChange({
      sourceFileName: activeFile?.name ?? sourceFile?.name ?? null,
      previewSvgText: cleanedSvgText,
      previewFile: activeFile,
      status: traceStatus,
      previewImageUrl: bedPreviewImageUrl,
      previewLabel: bedPreviewLabel,
      previewBackground,
      previewTarget: bedPreviewTarget,
    });
  }, [
    activeFile,
    bedPreviewLabel,
    bedPreviewImageUrl,
    bedPreviewTarget,
    onPreviewChange,
    open,
    previewBackground,
    sourceFile,
    cleanedSvgText,
    traceStatus,
  ]);

  React.useEffect(() => {
    return () => onPreviewChange?.(null);
  }, [onPreviewChange]);

  const resetTrace = React.useCallback(() => {
    setSvgText(null);
    setStats(null);
    setTraceError(null);
    setTraceStatus("idle");
    setTraceEngine(null);
    setBranchPreviews(null);
    setHiddenSvgColors([]);
    setBgEngine(null);
  }, []);

  const handleFileSelected = React.useCallback((file: File) => {
    setSourceFile(file);
    setWorkingFile(null);
    setHybridFile(null);
    setBackgroundStrategy("original");
    setBedPreviewTarget("source");
    setBgStatus("idle");
    resetTrace();
  }, [resetTrace]);

  const handleClear = React.useCallback(() => {
    setSourceFile(null);
    setWorkingFile(null);
    setHybridFile(null);
    setBackgroundStrategy("original");
    setBedPreviewTarget("result");
    setBgStatus("idle");
    resetTrace();
  }, [resetTrace]);

  const handleResetRaster = React.useCallback(() => {
    setBackgroundStrategy("original");
    setBedPreviewTarget("source");
    resetTrace();
  }, [resetTrace]);

  const handleRemoveBackground = React.useCallback(async () => {
    if (!sourceFile) return;
    setBgStatus("running");
    setTraceError(null);
    try {
      let cutoutBlob: Blob | null = null;
      let engineLabel = "AI Cutout";

      const formData = new FormData();
      formData.set("image", sourceFile);
      const remoteResponse = await fetch("/api/admin/image/remove-bg", {
        method: "POST",
        body: formData,
      });

      if (remoteResponse.ok) {
        const payload = (await remoteResponse.json()) as { dataUrl?: string; model?: string };
        if (typeof payload.dataUrl === "string" && payload.dataUrl.length > 0) {
          cutoutBlob = await dataUrlToBlob(payload.dataUrl);
          engineLabel = payload.model ?? "BiRefNet";
        }
      }

      if (!cutoutBlob) {
        const { removeBackground } = await import("@imgly/background-removal");
        cutoutBlob = await removeBackground(sourceFile);
        engineLabel = "Local AI Cutout";
      }

      const repairedBlob = await repairCutoutWithSource(sourceFile, cutoutBlob);
      const cleanedBlob = await cleanCutoutBlob(repairedBlob);
      const cutoutFile = new File([cleanedBlob], `${basename(sourceFile.name)}-cutout.png`, { type: "image/png" });
      setWorkingFile(cutoutFile);
      setBackgroundStrategy("cutout");
      setBedPreviewTarget("source");
      setBgStatus("done");
      resetTrace();
      setBgEngine(engineLabel);
    } catch (error) {
      setBgStatus("error");
      setTraceError(error instanceof Error ? error.message : "Background removal failed");
    }
  }, [sourceFile, resetTrace]);

  const handleVectorize = React.useCallback(async () => {
    if (!activeFile) return;
    const requestId = vectorizeRequestIdRef.current + 1;
    vectorizeRequestIdRef.current = requestId;
    setTraceStatus("running");
    setTraceError(null);
    try {
      const formData = new FormData();
      formData.set("image", activeFile);
      formData.set("mode", traceMode);
      formData.set("thresholdMode", thresholdMode);
      formData.set("threshold", String(threshold));
      formData.set("invert", String(invert));
      formData.set("trimWhitespace", String(trimWhitespace));
      formData.set("normalizeLevels", String(normalizeLevels));
      formData.set("turdSize", String(turdSize));
      formData.set("alphaMax", String(alphaMax));
      formData.set("optTolerance", String(optTolerance));
      formData.set("posterizeSteps", String(posterizeSteps));
      formData.set("outputColor", outputColor);
      formData.set("preserveText", String(preserveText));
      formData.set("recipe", traceRecipe);
      formData.set("backgroundStrategy", backgroundStrategy);
      formData.set("maxDimension", "6144");

      const response = await fetch("/api/admin/image/vectorize", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as RasterVectorizeResponse | { error?: string };
      if (!response.ok || !("svg" in payload)) {
        throw new Error((payload as { error?: string }).error ?? "Vectorization failed");
      }
      if (requestId !== vectorizeRequestIdRef.current) {
        return;
      }

      setSvgText(payload.svg);
      setStats({
        pathCount: payload.pathCount,
        width: payload.width,
        height: payload.height,
      });
      setTraceEngine(payload.engine ?? null);
      setBranchPreviews(payload.branchPreviews ?? null);
      setHiddenSvgColors([]);
      setTraceStatus("done");
      if (bedPreviewTarget === "result" || bedPreviewTarget === "source") {
        setBedPreviewTarget("result");
      }
    } catch (error) {
      if (requestId !== vectorizeRequestIdRef.current) {
        return;
      }
      setTraceStatus("error");
      setTraceError(
        error instanceof Error
          ? error.message
          : "Vectorization failed",
      );
    }
  }, [
    activeFile,
    alphaMax,
    backgroundStrategy,
    bedPreviewTarget,
    invert,
    normalizeLevels,
    optTolerance,
    outputColor,
    posterizeSteps,
    preserveText,
    threshold,
    thresholdMode,
    traceMode,
    traceRecipe,
    trimWhitespace,
    turdSize,
  ]);

  const handleAddSvg = React.useCallback(() => {
    if (!cleanedSvgText || !sourceFile) return;
    const filteredSuffix = traceMode === "posterize" && hiddenSvgColors.length > 0 ? "-filtered" : "";
    const fileName = `${basename(sourceFile.name)}-${traceMode}${filteredSuffix}.svg`;
    onAddAsset(cleanedSvgText, fileName);
  }, [cleanedSvgText, hiddenSvgColors.length, sourceFile, traceMode, onAddAsset]);

  const toggleSvgColor = React.useCallback((color: string) => {
    setHiddenSvgColors((current) =>
      current.includes(color)
        ? current.filter((entry) => entry !== color)
        : [...current, color],
    );
  }, []);

  const applyRecipe = React.useCallback((recipeId: RasterTraceRecipe) => {
    setTraceRecipe(recipeId);
    if (recipeId === "badge") {
      setTraceMode("trace");
      setThresholdMode("auto");
      setThreshold(160);
      setInvert(false);
      setTrimWhitespace(true);
      setNormalizeLevels(true);
      setTurdSize(0);
      setAlphaMax(0.35);
      setOptTolerance(0.05);
      setPosterizeSteps(4);
      setPreserveText(true);
      setBackgroundStrategy((current) => (current === "cutout" || current === "hybrid" ? current : "original"));
      return;
    }

    if (recipeId === "line-art") {
      setTraceMode("trace");
      setThresholdMode("manual");
      setThreshold(176);
      setInvert(false);
      setTrimWhitespace(true);
      setNormalizeLevels(true);
      setTurdSize(2);
      setAlphaMax(0.55);
      setOptTolerance(0.2);
      setPosterizeSteps(4);
      setPreserveText(false);
      setBackgroundStrategy("original");
      return;
    }

    if (recipeId === "script-logo") {
      setTraceMode("trace");
      setThresholdMode("auto");
      setThreshold(152);
      setInvert(false);
      setTrimWhitespace(true);
      setNormalizeLevels(true);
      setTurdSize(0);
      setAlphaMax(0.2);
      setOptTolerance(0.08);
      setPosterizeSteps(4);
      setPreserveText(true);
      setBackgroundStrategy((current) => (workingFile ? "hybrid" : current === "cutout" ? "cutout" : "original"));
      return;
    }

    setTraceMode("trace");
    setThresholdMode("manual");
    setThreshold(186);
    setInvert(false);
    setTrimWhitespace(true);
    setNormalizeLevels(true);
    setTurdSize(4);
    setAlphaMax(0.72);
    setOptTolerance(0.28);
    setPosterizeSteps(3);
    setPreserveText(false);
    setBackgroundStrategy("original");
  }, [workingFile]);

  const branchPreviewCards = React.useMemo(
    () =>
      [
        { key: "colorPreview", label: "Color map", src: branchPreviews?.colorPreview ?? null },
        { key: "textPreview", label: "Text branch", src: branchPreviews?.textPreview ?? null },
        { key: "arcTextPreview", label: "Arc text", src: branchPreviews?.arcTextPreview ?? null },
        { key: "scriptTextPreview", label: "Script text", src: branchPreviews?.scriptTextPreview ?? null },
        { key: "shapePreview", label: "Shape branch", src: branchPreviews?.shapePreview ?? null },
        { key: "contourPreview", label: "Contour branch", src: branchPreviews?.contourPreview ?? null },
      ].filter((entry) => Boolean(entry.src)),
    [branchPreviews],
  );

  const activityState = React.useMemo(() => {
    if (traceStatus === "running") {
      return {
        title: "Smart trace running",
        detail: "Cleaning the image, separating branches, and building the SVG preview.",
      };
    }

    if (bgStatus === "running") {
      return {
        title: "Background removal running",
        detail: "Generating the cutout and restoring thin details before the trace starts.",
      };
    }

    return null;
  }, [bgStatus, traceStatus]);

  const activeRasterPreviewSrc = React.useMemo(() => {
    if (backgroundStrategy === "hybrid" && hybridPreviewUrl) return hybridPreviewUrl;
    if (backgroundStrategy === "cutout" && workingPreviewUrl) return workingPreviewUrl;
    return sourcePreviewUrl;
  }, [backgroundStrategy, hybridPreviewUrl, sourcePreviewUrl, workingPreviewUrl]);

  const activeRasterLabel = React.useMemo(() => {
    if (backgroundStrategy === "hybrid" && hybridFile) return "Hybrid Raster";
    if (backgroundStrategy === "cutout" && workingFile) return "Cutout Raster";
    return "Original Raster";
  }, [backgroundStrategy, hybridFile, workingFile]);

  const previewFocusCard = React.useMemo(() => {
    if (traceMode === "trace") {
      return {
        key: "thresholdPreview" as RasterBedPreviewTarget,
        label: `Threshold Preview${effectiveThreshold !== null ? ` • ${effectiveThreshold}` : ""}`,
        src: thresholdPreviewUrl,
        alt: "Threshold preview",
        placeholder: "Upload an image to generate a threshold preview.",
        disabled: !thresholdPreviewUrl,
      };
    }

    return {
      key: "colorPreview" as RasterBedPreviewTarget,
      label: "Posterize Color Map",
      src: branchPreviews?.colorPreview ?? null,
      alt: "Posterize color map",
      placeholder: "Run the trace to preview the color map used for posterized output.",
      disabled: !branchPreviews?.colorPreview,
    };
  }, [branchPreviews?.colorPreview, effectiveThreshold, thresholdPreviewUrl, traceMode]);

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((value) => !value)}>
        <span className={styles.toggleLabel}>Premium Raster to SVG</span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <p className={styles.note}>
            High-quality PNG/JPEG tracing for logos, line art, and cleaned product graphics. Best results come from clean images or a quick cutout first.
          </p>
          <p className={styles.note}>
            Small text will not survive a low-resolution trace cleanly. If lettering matters, start from the original vector or a much higher-resolution raster.
          </p>
          <p className={styles.note}>
            Detail controls are manual. Adjust the settings, then click the build button to rerun the smart asset pipeline.
          </p>
          <p className={styles.note}>
            {traceMode === "trace"
              ? "Use the threshold preview to inspect the black/white raster before vector conversion. It is a fast approximation for tuning, not the final branch-separated SVG result."
              : "Posterized mode does not use the binary threshold preview as its main output. Use the color map and branch previews to judge whether the separation is working."}
          </p>

          <div className={styles.dropWrap}>
            <FileDropZone
              accept="image/png,image/jpeg,image/webp,image/avif"
              fileName={null}
              label="Drop PNG or JPEG here"
              hint="PNG, JPEG, WEBP, AVIF"
              onFileSelected={handleFileSelected}
              onClear={handleClear}
            />
            {sourceFile && (
              <div className={styles.fileRow}>
                <div className={styles.fileMeta}>
                  <span className={styles.fileName}>{sourceFile.name}</span>
                  <span className={styles.fileHint}>
                    {activeFile
                      ? `Tracing ${activeFile.name}${backgroundStrategy !== "original" ? ` • ${backgroundStrategy}` : ""}${bgEngine ? ` • ${bgEngine}` : ""}`
                      : "Tracing original raster"}
                  </span>
                </div>
                <button type="button" className={styles.clearBtn} onClick={handleClear}>Clear</button>
              </div>
            )}
          </div>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondaryBtn} onClick={handleRemoveBackground} disabled={!sourceFile || bgStatus === "running"}>
              {bgStatus === "running" ? "Removing BG…" : workingFile ? "Re-run Cutout" : "AI Cutout"}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={handleResetRaster} disabled={!workingFile}>
              Use Original
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Trace Recipe</div>
            <div className={styles.recipeGrid}>
              {[
                { id: "badge", label: "Badge", description: "Balanced cleanup for mixed logos." },
                { id: "line-art", label: "Line Art", description: "Stronger edge cleanup for graphic art." },
                { id: "script-logo", label: "Script Logo", description: "Bias toward preserving lettering." },
                { id: "stamp", label: "Stamp", description: "Punchier monochrome for bold marks." },
              ].map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  className={`${styles.recipeBtn} ${traceRecipe === recipe.id ? styles.recipeBtnActive : ""}`}
                  onClick={() => applyRecipe(recipe.id as RasterTraceRecipe)}
                >
                  <span className={styles.recipeLabel}>{recipe.label}</span>
                  <span className={styles.recipeDescription}>{recipe.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Background Strategy</div>
            <div className={styles.segmentedTriple}>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${backgroundStrategy === "original" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setBackgroundStrategy("original")}
              >
                Use Original
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${backgroundStrategy === "cutout" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setBackgroundStrategy("cutout")}
                disabled={!workingFile}
              >
                Use Cutout
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${backgroundStrategy === "hybrid" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setBackgroundStrategy("hybrid")}
                disabled={!workingFile}
              >
                Text + Cutout
              </button>
            </div>
            <p className={styles.helperText}>
              `Text + Cutout` keeps the source lettering stronger while still using the cleaned silhouette for shapes.
            </p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Trace Mode</div>
            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${traceMode === "trace" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setTraceMode("trace")}
              >
                Smart B/W
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${traceMode === "posterize" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setTraceMode("posterize")}
              >
                Posterized
              </button>
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Threshold</span>
                  <span className={styles.value}>{thresholdMode === "auto" ? "Auto" : threshold}</span>
                </div>
                <select className={styles.select} value={thresholdMode} onChange={(e) => setThresholdMode(e.target.value as ThresholdMode)}>
                  <option value="auto">Auto threshold</option>
                  <option value="manual">Manual threshold</option>
                </select>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Noise filter</span>
                  <span className={styles.value}>{turdSize}</span>
                </div>
                <input className={styles.range} type="range" min={0} max={25} step={1} value={turdSize} onChange={(e) => setTurdSize(Number(e.target.value))} />
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Despeckle</span>
                  <span className={styles.value}>{despeckleLevel === 0 ? "Off" : despeckleLevel}</span>
                </div>
                <input
                  className={styles.range}
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={despeckleLevel}
                  onChange={(e) => setDespeckleLevel(Number(e.target.value))}
                />
              </div>

              {thresholdMode === "manual" && (
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Manual threshold</span>
                    <span className={styles.value}>{threshold}</span>
                  </div>
                  <input className={styles.range} type="range" min={0} max={255} step={1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
                </div>
              )}

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Corner smoothing</span>
                  <span className={styles.value}>{alphaMax.toFixed(2)}</span>
                </div>
                <input className={styles.range} type="range" min={0} max={2} step={0.05} value={alphaMax} onChange={(e) => setAlphaMax(Number(e.target.value))} />
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>Curve tolerance</span>
                  <span className={styles.value}>{optTolerance.toFixed(2)}</span>
                </div>
                <input className={styles.range} type="range" min={0.05} max={1} step={0.05} value={optTolerance} onChange={(e) => setOptTolerance(Number(e.target.value))} />
              </div>

              {traceMode === "posterize" ? (
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Posterize layers</span>
                    <span className={styles.value}>{posterizeSteps}</span>
                  </div>
                  <input className={styles.range} type="range" min={2} max={8} step={1} value={posterizeSteps} onChange={(e) => setPosterizeSteps(Number(e.target.value))} />
                </div>
              ) : (
                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Output color</span>
                    <span className={styles.value}>{outputColor}</span>
                  </div>
                  <input className={styles.colorInput} type="color" value={outputColor} onChange={(e) => setOutputColor(e.target.value)} />
                </div>
              )}
            </div>

            <div className={styles.checkboxRow}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                Invert trace
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={trimWhitespace} onChange={(e) => setTrimWhitespace(e.target.checked)} />
                Trim whitespace
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={normalizeLevels} onChange={(e) => setNormalizeLevels(e.target.checked)} />
                Normalize contrast
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={preserveText} onChange={(e) => setPreserveText(e.target.checked)} />
                Preserve text
              </label>
            </div>

            <button type="button" className={styles.primaryBtn} onClick={() => void handleVectorize()} disabled={!activeFile || traceStatus === "running"}>
              {traceStatus === "running" ? "Tracing…" : traceMode === "trace" ? "Build Smart B/W SVG" : "Trace to SVG"}
            </button>

            {activityState && (
              <div className={styles.activityPanel} role="status" aria-live="polite">
                <div className={styles.activityHeader}>
                  <span className={styles.activityTitle}>{activityState.title}</span>
                  <span className={styles.activityMeta}>Working…</span>
                </div>
                <div className={styles.activityTrack}>
                  <div className={styles.activityBar} />
                </div>
                <p className={styles.activityDetail}>{activityState.detail}</p>
              </div>
            )}
          </div>

          <div className={styles.previewGrid}>
            <div className={styles.previewCard}>
              <div className={styles.previewLabel}>{activeRasterLabel}</div>
              <div className={styles.previewFrame}>
                {activeFile && activeRasterPreviewSrc ? (
                  <img className={styles.previewImage} src={activeRasterPreviewSrc ?? undefined} alt="Raster preview" />
                ) : (
                  <div className={styles.previewPlaceholder}>Upload an image to start tracing.</div>
                )}
              </div>
            </div>

            <div className={styles.previewCard}>
              <div className={styles.previewLabel}>{previewFocusCard.label}</div>
              <button
                type="button"
                className={`${styles.previewCardBtn} ${bedPreviewTarget === previewFocusCard.key ? styles.previewCardBtnActive : ""}`}
                onClick={() => setBedPreviewTarget(previewFocusCard.key)}
                disabled={previewFocusCard.disabled}
              >
                <div className={styles.previewFrame}>
                  {previewFocusCard.src ? (
                    <img className={styles.previewImage} src={previewFocusCard.src} alt={previewFocusCard.alt} />
                  ) : (
                    <div className={styles.previewPlaceholder}>{previewFocusCard.placeholder}</div>
                  )}
                </div>
              </button>
            </div>

            <div className={styles.previewCard}>
              <div className={styles.previewLabel}>
                {traceMode === "posterize" && hiddenSvgColors.length > 0 ? "Filtered SVG Preview" : "SVG Preview"}
              </div>
              <div className={styles.previewFrame}>
                {svgPreviewUrl ? (
                  <img className={styles.previewImage} src={svgPreviewUrl} alt="SVG preview" />
                ) : (
                  <div className={styles.previewPlaceholder}>Run the trace to preview the vector result.</div>
                )}
              </div>
            </div>
          </div>

          {traceMode === "posterize" && posterizedPaintEntries.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Posterized Colors</div>
              <p className={styles.helperText}>
                Use the posterized SVG as the master result. Hide colors to simplify the design before reviewing it on the bed or adding it to the library.
              </p>
              <div className={styles.colorToggleGrid}>
                {posterizedPaintEntries.map((entry) => {
                  const hidden = hiddenSvgColorSet.has(entry.color);
                  return (
                    <button
                      key={entry.color}
                      type="button"
                      className={`${styles.colorToggle} ${hidden ? styles.colorToggleHidden : ""}`}
                      onClick={() => toggleSvgColor(entry.color)}
                    >
                      <span className={styles.colorSwatch} style={{ backgroundColor: entry.color }} aria-hidden="true" />
                      <span className={styles.colorToggleMeta}>
                        <span className={styles.colorValue}>{entry.color}</span>
                        <span className={styles.colorCount}>
                          {entry.count} {entry.count === 1 ? "use" : "uses"}
                        </span>
                      </span>
                      <span className={styles.colorToggleState}>{hidden ? "Hidden" : "Shown"}</span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setHiddenSvgColors([])}
                  disabled={hiddenSvgColors.length === 0}
                >
                  Show All Colors
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setBedPreviewTarget("result")}
                  disabled={!cleanedSvgText}
                >
                  Review Filtered SVG
                </button>
              </div>
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Bed Review</div>
            <div className={styles.segmentedTriple}>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${bedPreviewTarget === "result" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setBedPreviewTarget("result")}
              >
                Result
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${bedPreviewTarget === "source" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setBedPreviewTarget("source")}
              >
                Raster
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${bedPreviewTarget === previewFocusCard.key ? styles.segmentedBtnActive : ""}`}
                onClick={() => setBedPreviewTarget(previewFocusCard.key)}
                disabled={previewFocusCard.disabled}
              >
                {traceMode === "trace" ? "Threshold" : "Color Map"}
              </button>
            </div>
            <div className={styles.segmentedTriple}>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${previewBackground === "light" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setPreviewBackground("light")}
              >
                Light
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${previewBackground === "dark" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setPreviewBackground("dark")}
              >
                Dark
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${previewBackground === "checker" ? styles.segmentedBtnActive : ""}`}
                onClick={() => setPreviewBackground("checker")}
              >
                Checker
              </button>
            </div>
            <p className={styles.helperText}>Click any branch card below to throw that layer onto the bed for inspection.</p>
          </div>

          {branchPreviewCards.length > 0 && (
            <div className={styles.branchSection}>
              <div className={styles.sectionTitle}>Pipeline Branches</div>
              <div className={styles.branchGrid}>
                {branchPreviewCards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className={`${styles.previewCardBtn} ${bedPreviewTarget === card.key ? styles.previewCardBtnActive : ""}`}
                    onClick={() => setBedPreviewTarget(card.key as RasterBedPreviewTarget)}
                  >
                    <div className={styles.previewLabel}>{card.label}</div>
                    <div className={styles.previewFrame}>
                      <img className={styles.previewImage} src={card.src ?? undefined} alt={card.label} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.statusRow}>
            <span className={traceStatus === "done" ? styles.statusSuccess : traceStatus === "error" ? styles.statusError : undefined}>
              {traceStatus === "done"
                ? `Ready${traceEngine === "asset-pipeline" ? " • Smart trace" : ""}${stats ? ` • ${stats.pathCount} paths • ${Math.round(stats.width)}×${Math.round(stats.height)}` : ""}${cleanedSvgResult && cleanedSvgResult.removedPathCount > 0 ? ` • ${cleanedSvgResult.removedPathCount} specks removed` : ""}`
                : traceStatus === "running"
                  ? "Vectorizing…"
                  : backgroundStrategy === "hybrid" && hybridFile
                    ? `Hybrid source active${bgEngine ? ` • ${bgEngine}` : ""}`
                    : backgroundStrategy === "cutout" && workingFile
                      ? `Cutout active${bgEngine ? ` • ${bgEngine}` : ""}`
                    : workingFile
                        ? `Using original • cutout ready${bgEngine ? ` • ${bgEngine}` : ""}`
                    : "Awaiting trace"}
            </span>
            <button type="button" className={styles.addBtn} onClick={handleAddSvg} disabled={!cleanedSvgText}>
              Add SVG to Library
            </button>
          </div>

          {traceError && <p className={styles.errorText}>{traceError}</p>}
        </div>
      )}
    </div>
  );
}
