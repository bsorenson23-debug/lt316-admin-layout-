import type {
  BodyReferenceOutlineSeedMode,
  BodyReferenceSourceOrigin,
  BodyReferenceSourceTrust,
  BodyReferenceViewSide,
  ProductReferenceViewClass,
} from "./productTemplate";

export type TemplatePipelineStageId =
  | "source-image"
  | "bg-cleanup"
  | "vectorize"
  | "smart-lookup"
  | "body-reference"
  | "viewer-sync"
  | "template-save"
  | "template-reload";

export type TemplatePipelineStageStatus =
  | "ready"
  | "warning"
  | "action"
  | "error"
  | "skip";

export interface TemplatePipelineStageFallback {
  used: boolean;
  from?: string | null;
  reason?: string | null;
}

export interface TemplatePipelineStageCache {
  hit: boolean;
  key?: string | null;
  scope?: string | null;
}

export interface TemplatePipelineStageRecord {
  id: TemplatePipelineStageId;
  status: TemplatePipelineStageStatus;
  title?: string;
  timingMs?: number;
  authority?: string | null;
  engine?: string | null;
  confidence?: number | null;
  fallback?: TemplatePipelineStageFallback | null;
  cache?: TemplatePipelineStageCache | null;
  warnings: string[];
  errors: string[];
  artifacts?: Record<string, unknown>;
  updatedAt?: string;
}

export interface TemplatePipelineInputFingerprints {
  sourceImage?: string | null;
  workingImage?: string | null;
  svg?: string | null;
  smartLookupInput?: string | null;
  smartLookupResult?: string | null;
  bodyReference?: string | null;
  templateGeometry?: string | null;
}

export interface TemplatePipelineContractVersions {
  bodyReference?: number | null;
  vectorize?: string | null;
  smartLookupCache?: string | null;
}

export interface TemplatePipelineDiagnostics {
  runId: string;
  traceId?: string | null;
  sectionId?: string | null;
  startedAt: string;
  inputFingerprints: TemplatePipelineInputFingerprints;
  stages: TemplatePipelineStageRecord[];
  blockingIssues: string[];
  warnings: string[];
  contractVersions?: TemplatePipelineContractVersions;
}

export interface TemplatePipelineProvenance {
  runId: string;
  traceId?: string | null;
  sectionId?: string | null;
  stageAuthorities: Partial<Record<TemplatePipelineStageId, string>>;
  fallbackFlags: Partial<Record<TemplatePipelineStageId, boolean>>;
  contractVersions?: TemplatePipelineContractVersions;
  blockingIssues: string[];
  bodyReferenceSignature?: string | null;
  templateGeometrySignature?: string | null;
  bodyReferenceViewSide?: BodyReferenceViewSide | null;
  bodyReferenceSourceTrust?: BodyReferenceSourceTrust | null;
  bodyReferenceOutlineSeedMode?: BodyReferenceOutlineSeedMode | null;
  bodyReferenceSourceOrigin?: BodyReferenceSourceOrigin | null;
  bodyReferenceSourceViewClass?: ProductReferenceViewClass | null;
}
