import type { SectionDescriptor } from "../../shared/types";

export const PREVIEW_SECTION_DESCRIPTOR: SectionDescriptor = {
  id: "workspace.preview",
  owner: "preview",
  title: "Preview",
  testId: "workspace-preview-section",
  selectStatus: (context) => (context.preview?.visible ? "ready" : "inactive"),
  selectAuthority: (context) => context.preview?.authority ?? null,
  selectSummary: (context) => context.preview?.message ?? context.preview?.effectiveMode ?? "Preview unavailable",
  selectDebug: (context) => ({
    requestedMode: context.preview?.requestedMode ?? null,
    effectiveMode: context.preview?.effectiveMode ?? null,
    status: context.preview?.status ?? null,
    reason: context.preview?.reason ?? null,
    sourceModelPath: context.preview?.sourceModelPath ?? null,
  }),
};
