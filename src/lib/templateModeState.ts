import type { ProductTemplate } from "../types/productTemplate.ts";
import type { LaserBedArtworkPlacement } from "./laserBedSurfaceMapping.ts";

export type TemplateModeIntent = "create" | "edit";
export type TemplateModeReturnTarget = "gallery" | "workspace";

export interface TemplateModeState {
  active: boolean;
  intent: TemplateModeIntent | null;
  editingTemplate: ProductTemplate | null;
  returnTarget: TemplateModeReturnTarget;
}

export interface TemplateModeExitOutcome {
  nextState: TemplateModeState;
  reopenGallery: boolean;
}

export interface TemplateModeSaveOutcome extends TemplateModeExitOutcome {
  selectSavedTemplate: boolean;
}

export function createInactiveTemplateModeState(): TemplateModeState {
  return {
    active: false,
    intent: null,
    editingTemplate: null,
    returnTarget: "workspace",
  };
}

export function enterCreateTemplateMode(
  returnTarget: TemplateModeReturnTarget = "gallery",
): TemplateModeState {
  return {
    active: true,
    intent: "create",
    editingTemplate: null,
    returnTarget,
  };
}

export function enterEditTemplateMode(
  template: ProductTemplate,
  returnTarget: TemplateModeReturnTarget = "gallery",
): TemplateModeState {
  return {
    active: true,
    intent: "edit",
    editingTemplate: template,
    returnTarget,
  };
}

export function resolveTemplateModeWorkspaceArtworkPlacements(args: {
  mode: TemplateModeState;
  selectedTemplateId: string | null | undefined;
  workspaceArtworkPlacements: LaserBedArtworkPlacement[] | null | undefined;
}): LaserBedArtworkPlacement[] | null {
  if (!args.mode.active) return null;
  if (args.mode.intent !== "edit") {
    return args.workspaceArtworkPlacements ?? null;
  }

  const editingTemplateId = args.mode.editingTemplate?.id ?? null;
  if (!editingTemplateId || editingTemplateId !== (args.selectedTemplateId ?? null)) {
    return null;
  }

  return args.workspaceArtworkPlacements ?? null;
}

export function resolveTemplateModeCancelOutcome(
  mode: TemplateModeState,
): TemplateModeExitOutcome {
  return {
    nextState: createInactiveTemplateModeState(),
    reopenGallery: mode.returnTarget === "gallery",
  };
}

export function resolveTemplateModeSaveOutcome(args: {
  mode: TemplateModeState;
  savedTemplateId: string;
  selectedTemplateId: string | null | undefined;
}): TemplateModeSaveOutcome {
  const editingTemplateId = args.mode.editingTemplate?.id ?? null;
  const editingActiveTemplate =
    args.mode.intent === "edit" &&
    editingTemplateId != null &&
    editingTemplateId === (args.selectedTemplateId ?? null);
  const selectSavedTemplate = args.mode.intent === "create" || editingActiveTemplate;
  const reopenGallery =
    !selectSavedTemplate &&
    args.mode.intent === "edit" &&
    args.mode.returnTarget === "gallery";

  return {
    nextState: createInactiveTemplateModeState(),
    reopenGallery,
    selectSavedTemplate,
  };
}
