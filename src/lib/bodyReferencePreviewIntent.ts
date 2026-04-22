import type { ProductTemplate } from "@/types/productTemplate";
import type { PreviewModelMode } from "./tumblerPreviewModelState.ts";

export function getDrinkwareGlbStatusLabel(
  status: ProductTemplate["glbStatus"] | null | undefined,
): string | null {
  switch (status) {
    case "verified-product-model":
      return "Verified product model";
    case "generated-reviewed-model":
      return "Reviewed cutout-generated model";
    case "placeholder-model":
      return "Placeholder model";
    case "missing-model":
      return "Missing model";
    default:
      return null;
  }
}

export function getBodyReferencePreviewModeLabel(args: {
  productType: ProductTemplate["productType"] | "" | null;
  mode: PreviewModelMode;
  glbStatus?: ProductTemplate["glbStatus"] | null;
}): string {
  if (args.productType === "flat") {
    return "SOURCE MODEL";
  }
  if (args.mode === "alignment-model") {
    return "ALIGNMENT MODEL · REVIEW SCAFFOLD";
  }
  if (args.mode === "body-cutout-qa") {
    return "BODY CUTOUT QA · RESERVED";
  }
  if (args.mode === "full-model") {
    return "FULL MODEL · REVIEW SCAFFOLD";
  }
  if (args.glbStatus === "generated-reviewed-model") {
    return "REVIEWED MODEL · SOURCE COMPARE";
  }
  if (args.glbStatus === "placeholder-model") {
    return "PLACEHOLDER MODEL · SOURCE COMPARE";
  }
  return "SOURCE MODEL · REVIEW COMPARE";
}

export function getBodyReferencePreviewModeHint(args: {
  productType: ProductTemplate["productType"] | "" | null;
  mode: PreviewModelMode;
}): string | null {
  if (args.productType === "flat") {
    return null;
  }
  if (args.mode === "alignment-model") {
    return "Alignment is the stable scaffold mount for the later canonical BODY REFERENCE preview.";
  }
  if (args.mode === "body-cutout-qa") {
    return "BODY CUTOUT QA is reserved here for the later reviewed body-only GLB and runtime-truth checks.";
  }
  if (args.mode === "full-model") {
    return "Full model remains a scaffold seam in this PR; later runtime-truth work will attach geometry-aware review state here.";
  }
  return "Source compare stays available as a review seam for later traced or reviewed BODY REFERENCE previews.";
}

export function isBodyCutoutQaPreviewAvailable(
  status: ProductTemplate["glbStatus"] | null | undefined,
): boolean {
  return status === "generated-reviewed-model";
}
