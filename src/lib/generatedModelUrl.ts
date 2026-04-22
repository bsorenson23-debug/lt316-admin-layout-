import type { ProductTemplate } from "@/types/productTemplate";

export const GENERATED_MODEL_ROUTE_PREFIX = "/api/admin/models/generated";
export const GENERATED_MODEL_AUDIT_ROUTE_PREFIX = "/api/admin/models/generated-audit";

const SAFE_GENERATED_MODEL_FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

export function sanitizeGeneratedModelFileName(fileName: string): string | null {
  const basename = fileName
    .split(/[\\/]/)
    .pop()
    ?.trim() ?? "";
  if (!basename || !SAFE_GENERATED_MODEL_FILE_NAME.test(basename)) {
    return null;
  }
  return basename;
}

export function buildGeneratedModelUrl(fileName: string): string {
  const safeName = sanitizeGeneratedModelFileName(fileName);
  if (!safeName) {
    throw new Error(`Invalid generated model file name: ${fileName}`);
  }
  return `${GENERATED_MODEL_ROUTE_PREFIX}/${encodeURIComponent(safeName)}`;
}

export function buildGeneratedModelAuditUrl(fileName: string): string {
  const safeName = sanitizeGeneratedModelFileName(fileName);
  if (!safeName) {
    throw new Error(`Invalid generated model file name: ${fileName}`);
  }
  return `${GENERATED_MODEL_AUDIT_ROUTE_PREFIX}/${encodeURIComponent(safeName)}`;
}

export function isGeneratedModelUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${GENERATED_MODEL_ROUTE_PREFIX}/`);
}

export function isLegacyGeneratedModelPath(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("/models/generated/");
}

export function getGeneratedModelFileNameFromUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !isGeneratedModelUrl(value)) return null;
  const safeValue: string = value;
  const raw = safeValue.slice(GENERATED_MODEL_ROUTE_PREFIX.length + 1);
  return sanitizeGeneratedModelFileName(decodeURIComponent(raw));
}

function stripQueryAndHash(value: string): string {
  const [withoutHash] = value.split("#", 1);
  return (withoutHash ?? value).split("?", 1)[0] ?? value;
}

function getPathname(value: string): string {
  if (/^[a-z]+:\/\//i.test(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return stripQueryAndHash(value);
    }
  }
  return stripQueryAndHash(value);
}

function buildLegacyGeneratedModelAuditUrlFromPath(value: string): string | null {
  if (!isLegacyGeneratedModelPath(value)) return null;
  const parts = value.split("/");
  const rawFileName = parts[parts.length - 1] ?? "";
  const fileName = sanitizeGeneratedModelFileName(decodeURIComponent(rawFileName));
  if (!fileName) return null;
  const extensionIndex = fileName.lastIndexOf(".");
  const auditName = extensionIndex > 0
    ? `${fileName.slice(0, extensionIndex)}.audit.json`
    : `${fileName}.audit.json`;
  const basePath = value.slice(0, value.length - rawFileName.length);
  return `${basePath}${encodeURIComponent(auditName)}`;
}

export function getGeneratedModelAuditUrlFromModelUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const pathname = getPathname(value);
  const generatedFileName = getGeneratedModelFileNameFromUrl(pathname);
  if (generatedFileName) {
    return buildGeneratedModelAuditUrl(generatedFileName);
  }
  return buildLegacyGeneratedModelAuditUrlFromPath(pathname);
}

export interface GeneratedModelAuditRequestPlan {
  auditUrl: string | null;
  expectation: "required" | "none";
  shouldFetch: boolean;
}

export function resolveGeneratedModelAuditRequestPlan(args: {
  modelUrl?: string | null;
  sourceModelStatus?: ProductTemplate["glbStatus"] | null;
}): GeneratedModelAuditRequestPlan {
  if (args.sourceModelStatus !== "generated-reviewed-model") {
    return {
      auditUrl: null,
      expectation: "none",
      shouldFetch: false,
    };
  }

  const auditUrl = getGeneratedModelAuditUrlFromModelUrl(args.modelUrl);
  if (!auditUrl) {
    return {
      auditUrl: null,
      expectation: "none",
      shouldFetch: false,
    };
  }

  return {
    auditUrl,
    expectation: "required",
    shouldFetch: true,
  };
}
