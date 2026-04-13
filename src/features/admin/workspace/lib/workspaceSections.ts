import type { SectionDescriptor } from "../../shared/types";

export const WORKSPACE_SECTION_DESCRIPTOR: SectionDescriptor = {
  id: "workspace.placement",
  owner: "workspace",
  title: "Workspace Placement",
  testId: "workspace-placement-section",
  selectStatus: (context) => (context.workspace?.visible ? "ready" : "inactive"),
  selectAuthority: (context) => context.workspace?.authority ?? null,
  selectSummary: (context) => context.workspace?.summary ?? "Workspace unavailable",
  selectDebug: (context) => ({
    workspaceMode: context.workspace?.workspaceMode ?? null,
    printableBandLabel: context.workspace?.printableBandLabel ?? null,
    workspaceHeightMm: context.workspace?.workspaceHeightMm ?? null,
    renderKey: context.workspace?.renderKey ?? null,
  }),
};
