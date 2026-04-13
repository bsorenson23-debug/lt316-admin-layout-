import type { AutoDetectResult } from "../../../lib/autoDetect.ts";
import type { TemplateCreateWorkflowStep } from "../../../lib/templateCreateFlow.ts";
import type { TemplateEditorSectionState } from "../shared/types.ts";

export type { TemplateEditorSectionState };

export interface TemplateEditorDetectDraftSnapshot {
  name: string;
  brand: string;
  capacity: string;
  laserType: "fiber" | "co2" | "diode" | "";
  productType: "tumbler" | "mug" | "bottle" | "flat" | "";
  flatFamilyKey: string;
  resolvedMaterialSlug: string;
  resolvedMaterialLabel: string;
  materialProfileId: string;
  power: number;
  speed: number;
  frequency: number;
  lineInterval: number;
  materialProfileTouched: boolean;
  diameterMm: number;
  wrapWidthInputMm: number;
  topOuterDiameterMm: number;
  baseDiameterMm: number;
  printHeightMm: number;
  handleArcDeg: number;
  taperCorrection: "none" | "top-narrow" | "bottom-narrow";
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
  detectError: string | null;
  acceptedDetectResult: AutoDetectResult | null;
  workflowStep: TemplateCreateWorkflowStep;
  reviewAccepted: boolean;
}

export interface TemplateEditorControllerState {
  workflowStep: TemplateCreateWorkflowStep;
  reviewAccepted: boolean;
  stagedDetectResult: AutoDetectResult | null;
  acceptedDetectResult: AutoDetectResult | null;
  detectError: string | null;
  detectDraftSnapshot: TemplateEditorDetectDraftSnapshot | null;
}

export interface TemplateEditorWorkflowContext {
  open: boolean;
  productType: string | null | undefined;
  hasProductImage: boolean;
  hasCanonicalBodyProfile: boolean;
  hasCanonicalDimensionCalibration: boolean;
  runId: string | null;
  warnings: string[];
  errors: string[];
  sourceFingerprints: Record<string, string | null>;
}

export interface TemplateEditorWorkflowState {
  usesGuidedReviewFlow: boolean;
  workflowSteps: Array<{
    step: TemplateCreateWorkflowStep;
    label: string;
    status: "ready" | "action" | "review";
    detail: string;
  }>;
  derivedWorkflowStep: TemplateCreateWorkflowStep;
  effectiveWorkflowStep: TemplateCreateWorkflowStep;
  reviewFlowSaveGateReason: string | null;
  stagedDetectionPending: boolean;
  activeSectionId: "template.source" | "template.detect" | "template.review";
}

export type TemplateEditorControllerAction =
  | { type: "set-workflow-step"; step: TemplateCreateWorkflowStep }
  | { type: "set-review-accepted"; value: boolean }
  | { type: "set-staged-detect-result"; value: AutoDetectResult | null }
  | { type: "set-accepted-detect-result"; value: AutoDetectResult | null }
  | { type: "set-detect-error"; value: string | null }
  | { type: "set-detect-draft-snapshot"; value: TemplateEditorDetectDraftSnapshot | null }
  | {
      type: "restore-detect-draft-snapshot";
      snapshot: TemplateEditorDetectDraftSnapshot;
    };
