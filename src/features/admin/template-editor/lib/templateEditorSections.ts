import type { AdminSectionRegistryContext, SectionDescriptor } from "../../shared/types";

function selectTemplateStatus(
  context: AdminSectionRegistryContext,
  step: "source" | "detect" | "review",
) {
  const editor = context.templateEditor;
  if (!editor?.open) return "inactive" as const;
  if (editor.activeStep === step) {
    if (step === "review") {
      return editor.reviewAccepted ? "ready" : editor.stagedDetectionPending ? "action" : "review";
    }
    if (step === "detect") {
      return editor.stagedDetectionPending ? "ready" : "action";
    }
    return "action";
  }
  if (step === "source") return "ready" as const;
  if (step === "detect") return editor.stagedDetectionPending || editor.reviewAccepted ? "ready" as const : "review" as const;
  return editor.reviewAccepted ? "ready" as const : editor.stagedDetectionPending ? "action" as const : "review" as const;
}

function selectTemplateSummary(
  context: AdminSectionRegistryContext,
  step: "source" | "detect" | "review",
): string {
  const editor = context.templateEditor;
  if (!editor?.open) return "Editor closed";
  if (step === "source") return editor.saveGateReason ?? "Source inputs are ready";
  if (step === "detect") return editor.stagedDetectionPending ? "Detection proposal staged locally" : "Run auto-detect to stage a proposal";
  return editor.reviewAccepted ? "Detected body reference accepted" : editor.saveGateReason ?? "Review the staged body reference";
}

function selectTemplateDebug(
  context: AdminSectionRegistryContext,
  step: "source" | "detect" | "review",
): Record<string, unknown> {
  const editor = context.templateEditor;
  return {
    open: editor?.open ?? false,
    activeStep: editor?.activeStep ?? null,
    requestedStep: step,
    stagedDetectionPending: editor?.stagedDetectionPending ?? false,
    reviewAccepted: editor?.reviewAccepted ?? false,
    saveGateReason: editor?.saveGateReason ?? null,
    runId: editor?.runId ?? null,
    warnings: editor?.warnings ?? [],
    errors: editor?.errors ?? [],
  };
}

function createTemplateSectionDescriptor(
  id: "template.source" | "template.detect" | "template.review",
  title: string,
  step: "source" | "detect" | "review",
): SectionDescriptor {
  return {
    id,
    owner: "template-editor",
    title,
    testId: `${id}-section`,
    selectStatus: (context) => selectTemplateStatus(context, step),
    selectAuthority: (context) => context.templateEditor?.authority ?? null,
    selectSummary: (context) => selectTemplateSummary(context, step),
    selectDebug: (context) => selectTemplateDebug(context, step),
  };
}

export const TEMPLATE_SOURCE_SECTION_DESCRIPTOR = createTemplateSectionDescriptor(
  "template.source",
  "Template Source",
  "source",
);

export const TEMPLATE_DETECT_SECTION_DESCRIPTOR = createTemplateSectionDescriptor(
  "template.detect",
  "Template Detect",
  "detect",
);

export const TEMPLATE_REVIEW_SECTION_DESCRIPTOR = createTemplateSectionDescriptor(
  "template.review",
  "Template Review",
  "review",
);
