import { z } from "zod";
import type {
  TemplatePipelineDiagnostics,
  TemplatePipelineProvenance,
  TemplatePipelineStageRecord,
} from "@/types/templatePipelineDiagnostics";

const finiteNumber = z.number().finite();

export const templatePipelineStageRecordSchema = z.object({
  id: z.enum([
    "source-image",
    "bg-cleanup",
    "vectorize",
    "smart-lookup",
    "body-reference",
    "viewer-sync",
    "template-save",
    "template-reload",
  ]),
  status: z.enum(["ready", "warning", "action", "error", "skip"]),
  title: z.string().optional(),
  timingMs: finiteNumber.optional(),
  authority: z.string().nullable().optional(),
  engine: z.string().nullable().optional(),
  confidence: finiteNumber.nullable().optional(),
  fallback: z.object({
    used: z.boolean(),
    from: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  }).nullable().optional(),
  cache: z.object({
    hit: z.boolean(),
    key: z.string().nullable().optional(),
    scope: z.string().nullable().optional(),
  }).nullable().optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  artifacts: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const templatePipelineDiagnosticsSchema = z.object({
  runId: z.string().min(1),
  traceId: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  startedAt: z.string().min(1),
  inputFingerprints: z.record(z.string(), z.string().nullable().optional()),
  stages: z.array(templatePipelineStageRecordSchema),
  blockingIssues: z.array(z.string()),
  warnings: z.array(z.string()),
  contractVersions: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
}).passthrough();

export const templatePipelineProvenanceSchema = z.object({
  runId: z.string().min(1),
  traceId: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  stageAuthorities: z.record(z.string(), z.string()).optional().default({}),
  fallbackFlags: z.record(z.string(), z.boolean()).optional().default({}),
  contractVersions: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  blockingIssues: z.array(z.string()).optional().default([]),
  bodyReferenceSignature: z.string().nullable().optional(),
  templateGeometrySignature: z.string().nullable().optional(),
  bodyReferenceViewSide: z.enum(["front", "back"]).nullable().optional(),
  bodyReferenceSourceTrust: z.string().nullable().optional(),
  bodyReferenceOutlineSeedMode: z.string().nullable().optional(),
  bodyReferenceSourceOrigin: z.string().nullable().optional(),
  bodyReferenceSourceViewClass: z.string().nullable().optional(),
}).passthrough();

export function parseTemplatePipelineStageRecord(value: unknown): TemplatePipelineStageRecord | null {
  const parsed = templatePipelineStageRecordSchema.safeParse(value);
  return parsed.success ? parsed.data as TemplatePipelineStageRecord : null;
}

export function parseTemplatePipelineDiagnostics(value: unknown): TemplatePipelineDiagnostics | null {
  const parsed = templatePipelineDiagnosticsSchema.safeParse(value);
  return parsed.success ? parsed.data as TemplatePipelineDiagnostics : null;
}

export function parseTemplatePipelineProvenance(value: unknown): TemplatePipelineProvenance | null {
  const parsed = templatePipelineProvenanceSchema.safeParse(value);
  return parsed.success ? parsed.data as TemplatePipelineProvenance : null;
}
