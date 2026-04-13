import type { EngravableDimensions } from "../../../lib/engravableDimensions.ts";
import type { TumblerWorkspaceRuntimeState } from "../../../lib/tumblerPrintableWorkspace.ts";
import type { BedConfig, EngravableZone } from "../../../types/admin.ts";
import type { ProductTemplate } from "../../../types/productTemplate.ts";
import type { WorkspaceSectionState } from "../shared/types.ts";

export type { WorkspaceSectionState };

export type WorkspaceViewMode = "grid" | "3d-placement";

export interface WorkspaceControllerState {
  tumblerViewMode: WorkspaceViewMode;
}

export interface WorkspaceControllerInput {
  bedConfig: BedConfig;
  selectedTemplate: ProductTemplate | null;
  templateEngravableDims: EngravableDimensions | null;
}

export interface WorkspaceControllerDerivedState {
  isTumblerMode: boolean;
  is3DPlacement: boolean;
  templateWorkspaceGeometry: TumblerWorkspaceRuntimeState | null;
  workspaceEngravableZone: EngravableZone | null;
  workspaceRenderKey: string;
  sectionState: WorkspaceSectionState;
}
