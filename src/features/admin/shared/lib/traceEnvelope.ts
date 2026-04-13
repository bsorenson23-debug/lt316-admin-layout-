import type {
  AdminSectionId,
  AdminSectionRegistryContext,
  AdminTraceEnvelope,
} from "../types";

function sanitizeFingerprintMap(
  value: Record<string, string | null> | null | undefined,
): Record<string, string | null> {
  if (!value) return {};
  const entries = Object.entries(value).map(([key, fingerprint]) => [
    key,
    typeof fingerprint === "string" && fingerprint.trim().length > 0 ? fingerprint : null,
  ]);
  return Object.fromEntries(entries);
}

export function createAdminTraceEnvelope(args: {
  traceId: string;
  currentSectionId: AdminSectionId | null;
  context: AdminSectionRegistryContext;
}): AdminTraceEnvelope {
  const templateEditor = args.context.templateEditor;
  const activeSection =
    args.currentSectionId == null
      ? null
      : args.currentSectionId === "template.source" ||
          args.currentSectionId === "template.detect" ||
          args.currentSectionId === "template.review"
        ? templateEditor
        : null;

  return {
    traceId: args.traceId,
    runId: templateEditor?.runId ?? null,
    sectionId: args.currentSectionId,
    templateId: args.context.selection.templateId,
    selectedItemId: args.context.selection.selectedItemId,
    sourceFingerprints: sanitizeFingerprintMap(templateEditor?.sourceFingerprints),
    authority:
      activeSection?.authority ??
      args.context.workspace?.authority ??
      args.context.preview?.authority ??
      null,
    warnings: [
      ...(templateEditor?.warnings ?? []),
    ],
    errors: [
      ...(templateEditor?.errors ?? []),
    ],
  };
}

export function buildAdminTraceHeaders(
  trace: Pick<AdminTraceEnvelope, "traceId" | "runId" | "sectionId"> | null | undefined,
): HeadersInit {
  if (!trace) return {};

  const headers: Record<string, string> = {
    "x-admin-trace-id": trace.traceId,
  };
  if (trace.runId) headers["x-admin-run-id"] = trace.runId;
  if (trace.sectionId) headers["x-admin-section-id"] = trace.sectionId;
  return headers;
}
