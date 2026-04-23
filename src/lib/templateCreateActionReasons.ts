export type TemplateCreatePreviewAction =
  | "body-cutout-qa"
  | "wrap-export"
  | "full-model"
  | "source-compare";

export interface TemplateCreateDisabledActionReason {
  label: string;
  reason?: string | null;
}

export interface TemplateCreateDisabledActionReasonGroup {
  labels: string[];
  reason: string;
}

export function resolveTemplateCreateBlockedActionReason(args: {
  busy: boolean;
  blockedReason?: string | null;
}): string | null {
  if (args.busy) return null;
  const reason = args.blockedReason?.trim();
  return reason ? reason : null;
}

export function getTemplateCreateLookupActionReason(args: {
  lookupInput: string;
  lookingUp: boolean;
}): string | null {
  if (args.lookingUp) return null;
  if (!args.lookupInput.trim()) {
    return "Paste a product URL or exact tumbler name to enable lookup.";
  }
  return null;
}

export function getTemplateCreateReviewAcceptActionReason(args: {
  hasAcceptedReview: boolean;
  hasLivePipeline: boolean;
}): string | null {
  if (args.hasAcceptedReview) return null;
  if (!args.hasLivePipeline) {
    return "Run lookup or auto-detect first so BODY REFERENCE review has a contour to accept.";
  }
  return null;
}

export function getTemplateCreatePreviewActionReason(args: {
  action: TemplateCreatePreviewAction;
  hasSourceModel: boolean;
  hasQaPreview: boolean;
}): string | null {
  if (args.action === "body-cutout-qa") {
    return args.hasQaPreview
      ? null
      : "Generate the reviewed body-only GLB first to unlock BODY CUTOUT QA.";
  }

  if (args.hasSourceModel) {
    return null;
  }

  switch (args.action) {
    case "wrap-export":
      return "Load a source model first to unlock WRAP / EXPORT preview.";
    case "full-model":
      return "Load a source model first to unlock Full model preview.";
    case "source-compare":
      return "Load a source model first to unlock Source compare preview.";
    default:
      return null;
  }
}

export function getTemplateCreateV2SeedActionReason(args: {
  hasApprovedBodyOutline: boolean;
}): string | null {
  return args.hasApprovedBodyOutline
    ? null
    : "Accept BODY REFERENCE (v1) first, then seed v2 capture from the accepted contour.";
}

export function groupTemplateCreateDisabledActionReasons(
  entries: readonly TemplateCreateDisabledActionReason[],
): TemplateCreateDisabledActionReasonGroup[] {
  const ordered: TemplateCreateDisabledActionReasonGroup[] = [];
  const byReason = new Map<string, TemplateCreateDisabledActionReasonGroup>();

  for (const entry of entries) {
    const label = entry.label.trim();
    const reason = entry.reason?.trim();
    if (!label || !reason) continue;

    const existing = byReason.get(reason);
    if (existing) {
      existing.labels.push(label);
      continue;
    }

    const group = { labels: [label], reason };
    byReason.set(reason, group);
    ordered.push(group);
  }

  return ordered;
}

export function formatTemplateCreateDisabledActionLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
