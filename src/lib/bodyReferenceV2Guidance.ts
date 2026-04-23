import type { BodyReferenceV2ScaleSource } from "./bodyReferenceV2Layers.ts";

export interface BodyReferenceV2GuidanceMessage {
  level: "error" | "warning";
  message: string;
}

export function formatBodyReferenceV2ScaleSourceLabel(
  source: BodyReferenceV2ScaleSource | null | undefined,
): string {
  switch (source) {
    case "lookup-diameter":
      return "Lookup diameter";
    case "manual-diameter":
      return "Manual diameter";
    case "svg-viewbox":
      return "SVG viewBox";
    default:
      return "Unknown";
  }
}

export function getBodyReferenceV2CurrentQaSourceLabel(isCurrentGenerationSource: boolean): string {
  return isCurrentGenerationSource
    ? "v2 mirrored profile"
    : "v1 approved contour";
}

export function getBodyReferenceV2AcceptDraftReason(args: {
  hasCenterline: boolean;
  hasBodyLeft: boolean;
}): string | null {
  if (args.hasCenterline || args.hasBodyLeft) {
    return null;
  }
  return "Capture a centerline axis or a body-left outline before accepting the v2 draft.";
}

export function getBodyReferenceV2GenerateGateReason(args: {
  hasPendingV1FineTune: boolean;
  accepted: boolean;
  hasDraftChanges: boolean;
  generationReady: boolean;
}): string | null {
  if (args.hasPendingV1FineTune) {
    return "Accept corrected v1 cutout changes first. v2 generation only runs from the current accepted v1 review.";
  }
  if (!args.accepted) {
    return "Accept the current v2 draft first. v2 generation only uses the accepted v2 capture.";
  }
  if (args.hasDraftChanges) {
    return "Accept or reset pending v2 draft changes. Generation still points at the last accepted v2 capture.";
  }
  if (!args.generationReady) {
    return "v2 generation stays disabled until centerline, body-left, lookup-diameter scale, and mirror validation all pass.";
  }
  return null;
}

export function getBodyReferenceV2ReferenceOnlyNote(): string {
  return "Lid references, handle references, blocked regions, product appearance layers, engraving overlay previews, and saved artwork placements stay out of BODY CUTOUT QA body_mesh.";
}

export function getBodyReferenceV2WrapExportDistinctionNote(): string {
  return "WRAP / EXPORT stays separate. It previews saved millimeter artwork placement and printable-surface readiness, but it never proves BODY CUTOUT QA geometry.";
}

export function getBodyReferenceV2SourceAuthorityNote(args: {
  isCurrentGenerationSource: boolean;
  hasDraftChanges: boolean;
}): string {
  if (args.isCurrentGenerationSource) {
    return "Current BODY CUTOUT QA source authority: BODY REFERENCE v2 mirrored profile.";
  }
  if (args.hasDraftChanges) {
    return "Pending v2 draft changes are not active yet. BODY CUTOUT QA stays on the last accepted source until you accept and regenerate.";
  }
  return "Current BODY CUTOUT QA source authority: v1 approved contour. v2 stays optional until you explicitly generate from the accepted v2 capture.";
}

export function humanizeBodyReferenceV2GuidanceMessage(message: string): string {
  switch (message.trim()) {
    case "BODY REFERENCE v2 centerline is not configured.":
    case "BODY REFERENCE v2 centerline is not captured for scale calibration.":
      return "Capture the centerline axis. It is the mirror axis used to build the v2 right side.";
    case "BODY REFERENCE v2 body-left layer is not configured.":
    case "BODY REFERENCE v2 body-left outline is not captured for mirror preview.":
      return "Capture the body-left outline. This is the operator-reviewed left side that v2 mirrors into the right side.";
    case "BODY REFERENCE v2 body-left cannot be checked for centerline crossing until a centerline is configured.":
      return "Capture the centerline axis before checking whether the body-left outline stays on the left side.";
    case "BODY REFERENCE v2 body-left crosses the centerline.":
      return "Move the body-left outline so every point stays left of the centerline before v2 generation.";
    case "BODY REFERENCE v2 lookup diameter is not configured.":
    case "BODY REFERENCE v2 lookup diameter is not configured for scale calibration.":
      return "Lookup diameter is required for v2 scale. Full product height stays context-only.";
    case "BODY REFERENCE v2 mmPerPx must resolve from the lookup diameter.":
      return "v2 scale could not resolve from the lookup diameter. Recheck the lookup variant and centerline/body-left capture.";
    case "BODY REFERENCE v2 wrapWidthMm must resolve from the lookup diameter.":
      return "Wrap width could not resolve from the lookup diameter, so v2 generation stays disabled.";
    case "BODY REFERENCE v2 mirrored-right preview is not available.":
      return "The mirrored right side appears automatically after centerline and body-left are valid.";
    case "BODY REFERENCE v2 mirror preview cannot validate symmetry until a centerline is captured.":
      return "Mirror validation is waiting for the centerline axis.";
    case "BODY REFERENCE v2 mirror preview cannot validate symmetry until a body-left outline is captured.":
      return "Mirror validation is waiting for the body-left outline.";
    case "BODY REFERENCE v2 lid-reference layer is missing.":
      return "No lid reference is captured yet. That is optional and stays reference-only.";
    case "BODY REFERENCE v2 handle-reference layer is missing.":
      return "No handle reference is captured yet. That is optional and stays reference-only.";
    case "BODY REFERENCE v2 draft is not accepted yet.":
      return "The current v2 capture is still a draft. Accept it before v2 generation can unlock.";
    case "Full product height is stored for context and ignored for lookup-based body contour scale.":
      return "Full product height is context only. Lookup diameter remains the scale authority for v2.";
    default:
      return message.trim();
  }
}

export function buildBodyReferenceV2GuidanceMessages(args: {
  errors?: readonly string[] | null;
  warnings?: readonly string[] | null;
}): BodyReferenceV2GuidanceMessage[] {
  const ordered: BodyReferenceV2GuidanceMessage[] = [];
  const seen = new Set<string>();

  for (const error of args.errors ?? []) {
    const message = humanizeBodyReferenceV2GuidanceMessage(error);
    const key = `error:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ level: "error", message });
  }

  for (const warning of args.warnings ?? []) {
    const message = humanizeBodyReferenceV2GuidanceMessage(warning);
    const warningKey = `warning:${message}`;
    const errorKey = `error:${message}`;
    if (seen.has(warningKey) || seen.has(errorKey)) continue;
    seen.add(warningKey);
    ordered.push({ level: "warning", message });
  }

  return ordered;
}
