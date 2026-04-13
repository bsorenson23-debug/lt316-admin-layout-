export type AdminFeatureOwner =
  | "template-editor"
  | "workspace"
  | "preview"
  | "job-readiness";

export type AdminSectionId =
  | "template.source"
  | "template.detect"
  | "template.review"
  | "workspace.placement"
  | "workspace.preview"
  | "job.readiness"
  | "export.bundle";

export type AdminSectionStatus =
  | "ready"
  | "action"
  | "review"
  | "inactive";

export interface AdminTraceEnvelope {
  traceId: string;
  runId: string | null;
  sectionId: AdminSectionId | null;
  templateId: string | null;
  selectedItemId: string | null;
  sourceFingerprints: Record<string, string | null>;
  authority: string | null;
  warnings: string[];
  errors: string[];
}

export interface AdminSectionSnapshot {
  id: AdminSectionId;
  owner: AdminFeatureOwner;
  title: string;
  status: AdminSectionStatus;
  authority: string | null;
  summary: string;
  testId: string;
  debug: Record<string, unknown>;
}

export interface TemplateEditorSectionState {
  open: boolean;
  activeStep: "source" | "detect" | "review";
  reviewAccepted: boolean;
  stagedDetectionPending: boolean;
  saveGateReason: string | null;
  runId: string | null;
  authority: string | null;
  warnings: string[];
  errors: string[];
  sourceFingerprints: Record<string, string | null>;
}

export interface WorkspaceSectionState {
  visible: boolean;
  workspaceMode: "flat-bed" | "tumbler-wrap";
  authority: string | null;
  summary: string;
  printableBandLabel: string | null;
  workspaceHeightMm: number | null;
  renderKey: string;
}

export interface PreviewSectionState {
  visible: boolean;
  requestedMode: string | null;
  effectiveMode: string | null;
  status: string | null;
  reason: string | null;
  message: string | null;
  sourceModelPath: string | null;
  authority: string | null;
}

export interface JobReadinessSectionState {
  visible: boolean;
  blockerCount: number;
  warningCount: number;
  nextAction: string;
  actionLabel: string;
}

export interface ExportBundleSectionState {
  visible: boolean;
  printableBandLabel: string | null;
  outputFolderPath: string | null;
  selectedPresetLabel: string | null;
  rotaryEnabled: boolean;
}

export interface AdminSectionRegistryContext {
  selection: {
    templateId: string | null;
    selectedItemId: string | null;
  };
  templateEditor: TemplateEditorSectionState | null;
  workspace: WorkspaceSectionState | null;
  preview: PreviewSectionState | null;
  readiness: JobReadinessSectionState | null;
  exportBundle: ExportBundleSectionState | null;
}

export interface SectionDescriptor {
  id: AdminSectionId;
  owner: AdminFeatureOwner;
  title: string;
  testId: string;
  selectStatus: (context: AdminSectionRegistryContext) => AdminSectionStatus;
  selectAuthority: (context: AdminSectionRegistryContext) => string | null;
  selectSummary: (context: AdminSectionRegistryContext) => string;
  selectDebug: (context: AdminSectionRegistryContext) => Record<string, unknown>;
}
