import type { BodyGeometryContract } from "./bodyGeometryContract.ts";
import type { parseBodyGeometryAuditArtifact } from "./adminApi.schema";
import type { WrapExportProductionReadinessSummary } from "./wrapExportProductionValidation.ts";

export const BODY_GEOMETRY_DEBUG_REPORT_VERSION = "2026-04-20-v1";

export type BodyGeometryAuditArtifactLike = NonNullable<
  ReturnType<typeof parseBodyGeometryAuditArtifact>
>;

export interface BodyGeometryDebugReportEnvironment {
  appVersion?: string | null;
  gitCommit?: string | null;
  pathname?: string | null;
  href?: string | null;
  page?: string | null;
  userAgent?: string | null;
  featureFlags?: Record<string, boolean | string | null | undefined>;
}

export interface BodyGeometryDebugReport {
  reportVersion: string;
  contractVersion: string | null;
  timestamp: string;
  application: {
    version: string | null;
    gitCommit: string | null;
  };
  route: {
    pathname: string | null;
    href: string | null;
    page: string | null;
  };
  userAgent: string | null;
  featureFlags: Record<string, boolean | string | null>;
  summary: {
    mode: string;
    validationStatus: BodyGeometryContract["validation"]["status"] | "unknown";
    sourceType: BodyGeometryContract["source"]["type"] | "unknown";
    fallbackDetected: boolean;
    glbFreshRelativeToSource: boolean | undefined;
    hasAuditArtifact: boolean;
    auditArtifactPresent: boolean;
    auditArtifactOptionalMissing: boolean;
    auditArtifactRequiredMissing: boolean;
  };
  wrapExport?: WrapExportProductionReadinessSummary | null;
  contract: BodyGeometryContract | null;
  auditArtifact: BodyGeometryAuditArtifactLike | null;
}

function sanitizeFileStem(value: string | undefined): string | null {
  if (!value) return null;
  const basename = value.split(/[\\/]/).pop()?.trim();
  if (!basename) return null;
  const stem = basename.replace(/\.[^.]+$/, "");
  const safe = stem.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return safe || null;
}

export function buildBodyGeometryDebugReport(args: {
  contract: BodyGeometryContract | null;
  auditArtifact?: BodyGeometryAuditArtifactLike | null;
  wrapExport?: WrapExportProductionReadinessSummary | null;
  exportedAt?: string;
  environment?: BodyGeometryDebugReportEnvironment;
}): BodyGeometryDebugReport {
  const contract = args.contract ?? null;
  const auditArtifact = args.auditArtifact ?? null;
  const environment = args.environment ?? {};
  const timestamp = args.exportedAt ?? new Date().toISOString();
  return {
    reportVersion: BODY_GEOMETRY_DEBUG_REPORT_VERSION,
    contractVersion: contract?.contractVersion ?? auditArtifact?.contractVersion ?? null,
    timestamp,
    application: {
      version: environment.appVersion ?? null,
      gitCommit: environment.gitCommit ?? null,
    },
    route: {
      pathname: environment.pathname ?? null,
      href: environment.href ?? null,
      page: environment.page ?? environment.pathname ?? null,
    },
    userAgent: environment.userAgent ?? null,
    featureFlags: Object.fromEntries(
      Object.entries(environment.featureFlags ?? {}).map(([key, value]) => [key, value ?? null]),
    ),
    summary: {
      mode: contract?.mode ?? auditArtifact?.mode ?? "unknown",
      validationStatus: contract?.validation.status ?? auditArtifact?.validation.status ?? "unknown",
      sourceType: contract?.source.type ?? auditArtifact?.source.type ?? "unknown",
      fallbackDetected:
        contract?.meshes.fallbackDetected ??
        auditArtifact?.meshes.fallbackDetected ??
        false,
      glbFreshRelativeToSource:
        contract?.glb.freshRelativeToSource ??
        auditArtifact?.glb.freshRelativeToSource,
      hasAuditArtifact: Boolean(auditArtifact),
      auditArtifactPresent:
        contract?.runtimeInspection?.auditArtifactPresent ??
        Boolean(auditArtifact),
      auditArtifactOptionalMissing:
        contract?.runtimeInspection?.auditArtifactOptionalMissing ?? false,
      auditArtifactRequiredMissing:
        contract?.runtimeInspection?.auditArtifactRequiredMissing ?? false,
    },
    wrapExport: args.wrapExport ?? null,
    contract,
    auditArtifact,
  };
}

export function buildBodyGeometryDebugReportFileName(args: {
  exportedAt?: string;
}): string {
  const timestamp = (args.exportedAt ?? new Date().toISOString())
    .replace(/\.\d{3}Z$/, "")
    .replace(/[:T]/g, "-");
  const safeTimestamp = sanitizeFileStem(timestamp) ?? "unknown-time";
  return `body-contract-debug-${safeTimestamp}.json`;
}
