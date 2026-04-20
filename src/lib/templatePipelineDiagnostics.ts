import type {
  TemplatePipelineContractVersions,
  TemplatePipelineDiagnostics,
  TemplatePipelineInputFingerprints,
  TemplatePipelineProvenance,
  TemplatePipelineStageId,
  TemplatePipelineStageRecord,
} from "../types/templatePipelineDiagnostics";
import {
  parseTemplatePipelineDiagnostics,
  parseTemplatePipelineProvenance,
  parseTemplatePipelineStageRecord,
} from "./templatePipelineDiagnostics.schema.ts";

const DEFAULT_CONTRACT_VERSION = "2026-04-10-v1";

function dedupeMessages(values: readonly string[] | null | undefined): string[] {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createTemplatePipelineRunId(prefix = "tpl"): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function fingerprintText(value: string | null | undefined): string | null {
  if (!value) return null;
  return `txt:${value.length}:${fnv1a32(value)}`;
}

export function fingerprintBytes(value: Uint8Array | ArrayBuffer | null | undefined): string | null {
  if (!value) return null;
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.byteLength === 0) return null;
  let source = "";
  for (const entry of bytes) {
    source += String.fromCharCode(entry);
  }
  return `bin:${bytes.byteLength}:${fnv1a32(source)}`;
}

export function fingerprintJson(value: unknown): string {
  return `json:${fnv1a32(stableStringify(value))}`;
}

export function createTemplatePipelineDiagnostics(args?: {
  runId?: string;
  traceId?: string | null;
  sectionId?: string | null;
  startedAt?: string;
  inputFingerprints?: TemplatePipelineInputFingerprints;
  contractVersions?: TemplatePipelineContractVersions;
  stages?: TemplatePipelineStageRecord[];
  warnings?: string[];
  blockingIssues?: string[];
}): TemplatePipelineDiagnostics {
  return normalizeTemplatePipelineDiagnostics({
    runId: args?.runId ?? createTemplatePipelineRunId(),
    traceId: args?.traceId ?? null,
    sectionId: args?.sectionId ?? null,
    startedAt: args?.startedAt ?? new Date().toISOString(),
    inputFingerprints: args?.inputFingerprints ?? {},
    stages: args?.stages ?? [],
    warnings: args?.warnings ?? [],
    blockingIssues: args?.blockingIssues ?? [],
    contractVersions: args?.contractVersions ?? {
      vectorize: DEFAULT_CONTRACT_VERSION,
    },
  });
}

export function normalizeTemplatePipelineStageRecord(value: unknown): TemplatePipelineStageRecord | null {
  const parsed = parseTemplatePipelineStageRecord(value);
  if (parsed) {
    return parsed;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<TemplatePipelineStageRecord>;
  if (typeof record.id !== "string") return null;
  return {
    id: record.id as TemplatePipelineStageId,
    status: record.status ?? "ready",
    title: typeof record.title === "string" ? record.title : undefined,
    timingMs: typeof record.timingMs === "number" && Number.isFinite(record.timingMs)
      ? record.timingMs
      : undefined,
    authority: typeof record.authority === "string" && record.authority.trim().length > 0
      ? record.authority
      : null,
    engine: typeof record.engine === "string" && record.engine.trim().length > 0
      ? record.engine
      : null,
    confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? record.confidence
      : null,
    fallback: record.fallback && typeof record.fallback === "object"
      ? {
          used: Boolean(record.fallback.used),
          from: typeof record.fallback.from === "string" ? record.fallback.from : null,
          reason: typeof record.fallback.reason === "string" ? record.fallback.reason : null,
        }
      : null,
    cache: record.cache && typeof record.cache === "object"
      ? {
          hit: Boolean(record.cache.hit),
          key: typeof record.cache.key === "string" ? record.cache.key : null,
          scope: typeof record.cache.scope === "string" ? record.cache.scope : null,
        }
      : null,
    warnings: dedupeMessages(record.warnings),
    errors: dedupeMessages(record.errors),
    artifacts:
      record.artifacts && typeof record.artifacts === "object"
        ? record.artifacts as Record<string, unknown>
        : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

export function normalizeTemplatePipelineDiagnostics(value: unknown): TemplatePipelineDiagnostics {
  const parsed = parseTemplatePipelineDiagnostics(value);
  if (parsed) {
    return parsed;
  }
  if (!value || typeof value !== "object") {
    return createTemplatePipelineDiagnostics();
  }

  const record = value as Partial<TemplatePipelineDiagnostics>;
  const stages = Array.isArray(record.stages)
    ? record.stages
        .map((stage) => normalizeTemplatePipelineStageRecord(stage))
        .filter((stage): stage is TemplatePipelineStageRecord => Boolean(stage))
    : [];

  return {
    runId: typeof record.runId === "string" && record.runId.trim().length > 0
      ? record.runId
      : createTemplatePipelineRunId(),
    traceId: typeof record.traceId === "string" && record.traceId.trim().length > 0
      ? record.traceId
      : null,
    sectionId: typeof record.sectionId === "string" && record.sectionId.trim().length > 0
      ? record.sectionId
      : null,
    startedAt: typeof record.startedAt === "string" && record.startedAt.trim().length > 0
      ? record.startedAt
      : new Date().toISOString(),
    inputFingerprints:
      record.inputFingerprints && typeof record.inputFingerprints === "object"
        ? record.inputFingerprints as TemplatePipelineInputFingerprints
        : {},
    stages,
    blockingIssues: dedupeMessages(record.blockingIssues),
    warnings: dedupeMessages(record.warnings),
    contractVersions:
      record.contractVersions && typeof record.contractVersions === "object"
        ? record.contractVersions as TemplatePipelineContractVersions
        : undefined,
  };
}

export function templatePipelineDiagnosticsEqual(
  left: TemplatePipelineDiagnostics | null | undefined,
  right: TemplatePipelineDiagnostics | null | undefined,
): boolean {
  if (!left || !right) return left == null && right == null;
  return fingerprintJson(left) === fingerprintJson(right);
}

export function upsertTemplatePipelineStage(
  diagnostics: TemplatePipelineDiagnostics,
  stage: TemplatePipelineStageRecord,
): TemplatePipelineDiagnostics {
  const normalized = normalizeTemplatePipelineStageRecord(stage);
  if (!normalized) return diagnostics;

  const nextStages = diagnostics.stages.filter((entry) => entry.id !== normalized.id);
  nextStages.push({
    ...normalized,
    updatedAt: normalized.updatedAt ?? new Date().toISOString(),
  });
  const nextWarnings = dedupeMessages([
    ...diagnostics.warnings,
    ...normalized.warnings,
  ]);

  return normalizeTemplatePipelineDiagnostics({
    ...diagnostics,
    stages: nextStages.sort((left, right) => left.id.localeCompare(right.id)),
    warnings: nextWarnings,
  });
}

export function mergeTemplatePipelineDiagnostics(
  base: TemplatePipelineDiagnostics,
  incoming: TemplatePipelineDiagnostics | null | undefined,
): TemplatePipelineDiagnostics {
  if (!incoming) return base;
  let next = normalizeTemplatePipelineDiagnostics({
    ...base,
    inputFingerprints: {
      ...base.inputFingerprints,
      ...incoming.inputFingerprints,
    },
    warnings: dedupeMessages([...base.warnings, ...incoming.warnings]),
    blockingIssues: dedupeMessages([...base.blockingIssues, ...incoming.blockingIssues]),
    contractVersions: {
      ...base.contractVersions,
      ...incoming.contractVersions,
    },
  });
  for (const stage of incoming.stages) {
    next = upsertTemplatePipelineStage(next, stage);
  }
  return next;
}

export function setTemplatePipelineWarnings(
  diagnostics: TemplatePipelineDiagnostics,
  warnings: readonly string[],
): TemplatePipelineDiagnostics {
  return normalizeTemplatePipelineDiagnostics({
    ...diagnostics,
    warnings: dedupeMessages(warnings),
  });
}

export function setTemplatePipelineBlockingIssues(
  diagnostics: TemplatePipelineDiagnostics,
  blockingIssues: readonly string[],
): TemplatePipelineDiagnostics {
  return normalizeTemplatePipelineDiagnostics({
    ...diagnostics,
    blockingIssues: dedupeMessages(blockingIssues),
  });
}

export function updateTemplatePipelineInputFingerprints(
  diagnostics: TemplatePipelineDiagnostics,
  fingerprints: Partial<TemplatePipelineInputFingerprints>,
): TemplatePipelineDiagnostics {
  return normalizeTemplatePipelineDiagnostics({
    ...diagnostics,
    inputFingerprints: {
      ...diagnostics.inputFingerprints,
      ...fingerprints,
    },
  });
}

export function buildTemplatePipelineProvenance(
  diagnostics: TemplatePipelineDiagnostics,
  details?: {
    bodyReferenceViewSide?: TemplatePipelineProvenance["bodyReferenceViewSide"];
    bodyReferenceSourceTrust?: TemplatePipelineProvenance["bodyReferenceSourceTrust"];
    bodyReferenceOutlineSeedMode?: TemplatePipelineProvenance["bodyReferenceOutlineSeedMode"];
    bodyReferenceSourceOrigin?: TemplatePipelineProvenance["bodyReferenceSourceOrigin"];
    bodyReferenceSourceViewClass?: TemplatePipelineProvenance["bodyReferenceSourceViewClass"];
  },
): TemplatePipelineProvenance {
  const stageAuthorities: TemplatePipelineProvenance["stageAuthorities"] = {};
  const fallbackFlags: TemplatePipelineProvenance["fallbackFlags"] = {};

  for (const stage of diagnostics.stages) {
    if (stage.authority) {
      stageAuthorities[stage.id] = stage.authority;
    }
    fallbackFlags[stage.id] = Boolean(stage.fallback?.used);
  }

  return {
    runId: diagnostics.runId,
    traceId: diagnostics.traceId ?? null,
    sectionId: diagnostics.sectionId ?? null,
    stageAuthorities,
    fallbackFlags,
    contractVersions: diagnostics.contractVersions,
    blockingIssues: [...diagnostics.blockingIssues],
    bodyReferenceSignature: diagnostics.inputFingerprints.bodyReference ?? null,
    templateGeometrySignature: diagnostics.inputFingerprints.templateGeometry ?? null,
    bodyReferenceViewSide: details?.bodyReferenceViewSide ?? null,
    bodyReferenceSourceTrust: details?.bodyReferenceSourceTrust ?? null,
    bodyReferenceOutlineSeedMode: details?.bodyReferenceOutlineSeedMode ?? null,
    bodyReferenceSourceOrigin: details?.bodyReferenceSourceOrigin ?? null,
    bodyReferenceSourceViewClass: details?.bodyReferenceSourceViewClass ?? null,
  };
}

export function buildTemplateReloadVerificationStage(args: {
  provenance: TemplatePipelineProvenance | null | undefined;
  currentDiagnostics: TemplatePipelineDiagnostics;
}): TemplatePipelineStageRecord {
  const issues: string[] = [];
  const saved = parseTemplatePipelineProvenance(args.provenance) ?? args.provenance;
  if (!saved) {
    return {
      id: "template-reload",
      status: "skip",
      authority: "runtime-only",
      warnings: [],
      errors: [],
      artifacts: {
        reason: "No saved pipeline provenance was present.",
      },
    };
  }

  if (
    saved.contractVersions?.bodyReference != null &&
    saved.contractVersions.bodyReference !== args.currentDiagnostics.contractVersions?.bodyReference
  ) {
    issues.push("Saved BODY REFERENCE contract version differs from the current runtime contract.");
  }
  if (
    saved.bodyReferenceSignature &&
    args.currentDiagnostics.inputFingerprints.bodyReference &&
    saved.bodyReferenceSignature !== args.currentDiagnostics.inputFingerprints.bodyReference
  ) {
    issues.push("Saved BODY REFERENCE signature drifted after reload.");
  }
  if (
    saved.templateGeometrySignature &&
    args.currentDiagnostics.inputFingerprints.templateGeometry &&
    saved.templateGeometrySignature !== args.currentDiagnostics.inputFingerprints.templateGeometry
  ) {
    issues.push("Saved template geometry signature drifted after reload.");
  }

  const currentBodyStage = args.currentDiagnostics.stages.find((stage) => stage.id === "body-reference");
  if (
    saved.stageAuthorities["body-reference"] &&
    currentBodyStage?.authority &&
    saved.stageAuthorities["body-reference"] !== currentBodyStage.authority
  ) {
    issues.push("Saved BODY REFERENCE authority differs from the current recomputed authority.");
  }
  if (
    typeof saved.fallbackFlags["body-reference"] === "boolean" &&
    saved.fallbackFlags["body-reference"] !== Boolean(currentBodyStage?.fallback?.used)
  ) {
    issues.push("Saved BODY REFERENCE fallback mode differs from the current recomputed fallback mode.");
  }
  const currentTrust =
    currentBodyStage?.artifacts &&
    typeof currentBodyStage.artifacts["sourceTrust"] === "string"
      ? currentBodyStage.artifacts["sourceTrust"]
      : null;
  if (
    saved.bodyReferenceSourceTrust &&
    currentTrust &&
    saved.bodyReferenceSourceTrust !== currentTrust
  ) {
    issues.push("Saved BODY REFERENCE trust state differs from the current recomputed trust state.");
  }

  return {
    id: "template-reload",
    status: issues.length > 0 ? "warning" : "ready",
    authority: "persisted-provenance",
    warnings: issues,
    errors: [],
    artifacts: {
      savedRunId: saved.runId,
      savedBodyReferenceSignature: saved.bodyReferenceSignature ?? null,
      currentBodyReferenceSignature: args.currentDiagnostics.inputFingerprints.bodyReference ?? null,
      savedTemplateGeometrySignature: saved.templateGeometrySignature ?? null,
      currentTemplateGeometrySignature: args.currentDiagnostics.inputFingerprints.templateGeometry ?? null,
      savedBodyReferenceSourceTrust: saved.bodyReferenceSourceTrust ?? null,
      currentBodyReferenceSourceTrust: currentTrust,
    },
  };
}
