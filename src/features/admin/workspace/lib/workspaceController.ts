import { deriveTumblerWorkspaceRuntimeState } from "../../../../lib/tumblerPrintableWorkspace.ts";
import type { ProductTemplate } from "../../../../types/productTemplate.ts";
import type {
  WorkspaceControllerDerivedState,
  WorkspaceControllerInput,
  WorkspaceControllerState,
  WorkspaceSectionState,
  WorkspaceViewMode,
} from "../types.ts";

export type WorkspaceControllerAction =
  | { type: "set-view-mode"; viewMode: WorkspaceViewMode };

export function createInitialWorkspaceControllerState(): WorkspaceControllerState {
  return {
    tumblerViewMode: "grid",
  };
}

export function workspaceControllerReducer(
  state: WorkspaceControllerState,
  action: WorkspaceControllerAction,
): WorkspaceControllerState {
  switch (action.type) {
    case "set-view-mode":
      return { ...state, tumblerViewMode: action.viewMode };
    default:
      return state;
  }
}

export const workspaceControllerActions = {
  setViewMode(viewMode: WorkspaceViewMode): WorkspaceControllerAction {
    return { type: "set-view-mode", viewMode };
  },
};

export function formatPrintableBandLabel(
  printableSurfaceContract?: ProductTemplate["dimensions"]["printableSurfaceContract"] | null,
): string | null {
  if (!printableSurfaceContract) return null;
  const top = printableSurfaceContract.printableTopMm;
  const bottom = printableSurfaceContract.printableBottomMm;
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return `${top.toFixed(2)} -> ${bottom.toFixed(2)}`;
}

export function selectWorkspaceDerivedState(
  state: WorkspaceControllerState,
  input: WorkspaceControllerInput,
): WorkspaceControllerDerivedState {
  const isTumblerMode = input.bedConfig.workspaceMode === "tumbler-wrap";
  const is3DPlacement = isTumblerMode && state.tumblerViewMode === "3d-placement";
  const templateWorkspaceGeometry =
    input.selectedTemplate && isTumblerMode && input.templateEngravableDims
      ? deriveTumblerWorkspaceRuntimeState(input.selectedTemplate, input.templateEngravableDims)
      : null;
  const workspaceEngravableZone = isTumblerMode
    ? templateWorkspaceGeometry?.geometry.workspaceZone ?? null
    : null;
  const frame = templateWorkspaceGeometry?.geometry.frame ?? null;
  const workspaceRenderKey = [
    input.selectedTemplate?.id ?? "no-template",
    input.bedConfig.workspaceMode,
    input.bedConfig.width.toFixed(2),
    input.bedConfig.height.toFixed(2),
    frame?.workspaceTopFromOverallMm.toFixed(2) ?? "no-workspace-top",
    frame?.workspaceBottomFromOverallMm.toFixed(2) ?? "no-workspace-bottom",
    frame?.printableTopFromBodyTopMm.toFixed(2) ?? "no-printable-top",
    frame?.printableBottomFromBodyTopMm.toFixed(2) ?? "no-printable-bottom",
  ].join("|");
  const sectionState: WorkspaceSectionState = {
    visible: !is3DPlacement,
    workspaceMode: input.bedConfig.workspaceMode,
    authority:
      frame?.hasPrintableBand
        ? frame.usesPrintableWorkspace
          ? "body-reference-printable-band"
          : "full-body-shell-fallback"
        : "workspace-runtime",
    summary:
      frame?.usesPrintableWorkspace
        ? "Workspace sized from BODY REFERENCE printable band"
        : isTumblerMode
          ? "Workspace sized from full body shell fallback"
          : "Flat bed workspace",
    printableBandLabel: formatPrintableBandLabel(
      input.selectedTemplate?.dimensions.printableSurfaceContract ??
      input.selectedTemplate?.dimensions.canonicalDimensionCalibration?.printableSurfaceContract,
    ),
    workspaceHeightMm: templateWorkspaceGeometry?.workspaceHeightMm ?? input.bedConfig.height,
    renderKey: workspaceRenderKey,
  };

  return {
    isTumblerMode,
    is3DPlacement,
    templateWorkspaceGeometry,
    workspaceEngravableZone,
    workspaceRenderKey,
    sectionState,
  };
}
