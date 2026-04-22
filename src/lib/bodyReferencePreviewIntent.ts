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
    return "ALIGNMENT MODEL · REVIEW";
  }
  if (args.mode === "body-cutout-qa") {
    return "BODY CUTOUT QA · BODY ONLY";
  }
  if (args.mode === "full-model") {
    return "FULL MODEL · GEOMETRY REFERENCE";
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
    return "Alignment keeps the source-model review visible while BODY REFERENCE approval and BODY CUTOUT QA stay separate.";
  }
  if (args.mode === "body-cutout-qa") {
    return "BODY CUTOUT QA renders the reviewed body-only GLB and validates the loaded geometry against audit/runtime truth.";
  }
  if (args.mode === "full-model") {
    return "Full model keeps the product preview available alongside BODY CUTOUT QA without treating it as body-only proof.";
  }
  return "Source compare keeps the reviewed model flow anchored to the current product source.";
}

export function isBodyCutoutQaPreviewAvailable(
  status: ProductTemplate["glbStatus"] | null | undefined,
): boolean {
  return status === "generated-reviewed-model";
}
