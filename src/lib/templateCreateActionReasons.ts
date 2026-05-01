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
    return "Enter a product URL or exact tumbler name first.";
  }
  return null;
}

export function getTemplateCreateReviewAcceptActionReason(args: {
  hasAcceptedReview: boolean;
  hasLivePipeline: boolean;
}): string | null {
  if (args.hasAcceptedReview) return null;
  if (!args.hasLivePipeline) {
    return "Run lookup or auto-detect before accepting BODY REFERENCE.";
  }
  return null;
}

export function getTemplateCreatePreviewActionReason(args: {
  action: TemplateCreatePreviewAction;
  hasSourceModel: boolean;
  hasQaPreview: boolean;
  hasAcceptedBodyReference?: boolean;
}): string | null {
  if (args.action === "body-cutout-qa") {
    if (!args.hasAcceptedBodyReference) {
      return "Accept BODY REFERENCE first.";
    }
    return args.hasQaPreview
      ? null
      : "Generate reviewed GLB first.";
  }

  if (args.hasSourceModel) {
    return null;
  }

  switch (args.action) {
    case "wrap-export":
      return "Load or generate a model first.";
    case "full-model":
      return "Load or generate a model first.";
    case "source-compare":
      return "Load or generate a model first.";
    default:
      return null;
  }
}

export function getTemplateCreateV2SeedActionReason(args: {
  hasApprovedBodyOutline: boolean;
}): string | null {
  return args.hasApprovedBodyOutline
    ? null
    : "Accept BODY REFERENCE (v1) first.";
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
