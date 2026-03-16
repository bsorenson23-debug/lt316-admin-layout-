import { TumblerImageAnalysisResult, TumblerShapeType } from "@/types/tumblerAutoSize";

interface AnalyzeInput {
  fileName: string;
  mimeType: string;
  byteLength: number;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim();
}

function inferBrandAndModel(text: string): { brand: string | null; model: string | null } {
  if (text.includes("yeti")) return { brand: "YETI", model: text.includes("rambler") ? "Rambler" : null };
  if (text.includes("stanley")) {
    return {
      brand: "Stanley",
      model: text.includes("quencher") ? "Quencher H2.0" : null,
    };
  }
  if (text.includes("hydro flask")) return { brand: "Hydro Flask", model: null };
  if (text.includes("ozark")) return { brand: "Ozark Trail", model: null };
  return { brand: null, model: null };
}

function inferCapacity(text: string): number | null {
  const match = text.match(/([0-9]{2})\s*(?:oz|ounce)/i);
  if (match) {
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
  if (text.includes("40")) return 40;
  if (text.includes("30")) return 30;
  if (text.includes("20")) return 20;
  return null;
}

function inferShape(text: string, hasHandle: boolean | null): TumblerShapeType {
  if (text.includes("taper") || text.includes("cup holder")) return "tapered";
  if (hasHandle) return "tapered";
  if (text.includes("straight")) return "straight";
  return "unknown";
}

export async function analyzeTumblerImage(
  input: AnalyzeInput
): Promise<TumblerImageAnalysisResult> {
  const normalizedName = normalizeText(input.fileName);
  const { brand, model } = inferBrandAndModel(normalizedName);
  const capacityOz = inferCapacity(normalizedName);
  const hasHandle = /(handle|mug|quencher)/i.test(normalizedName)
    ? true
    : /(no-handle|without-handle)/i.test(normalizedName)
      ? false
      : null;
  const shapeType = inferShape(normalizedName, hasHandle);

  let confidence = 0.28;
  if (brand) confidence += 0.25;
  if (model) confidence += 0.18;
  if (capacityOz) confidence += 0.14;
  if (hasHandle !== null) confidence += 0.08;
  if (shapeType !== "unknown") confidence += 0.08;
  if (input.mimeType.startsWith("image/")) confidence += 0.05;

  const queryParts = [brand, model, capacityOz ? `${capacityOz} oz` : null, "tumbler dimensions"]
    .filter(Boolean)
    .join(" ");

  const notes: string[] = [];
  if (!brand && !model) {
    notes.push("Brand/model inferred from filename only; confidence may be low.");
  }
  if (input.byteLength <= 0) {
    notes.push("Image payload appears empty; using fallback analysis.");
  }

  return {
    productType: "tumbler",
    brand,
    model,
    capacityOz,
    hasHandle,
    shapeType,
    confidence: Math.min(0.95, confidence),
    searchQuery: queryParts || "stainless tumbler dimensions",
    notes,
  };
}
