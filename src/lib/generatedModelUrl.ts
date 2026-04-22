export const GENERATED_MODEL_ROUTE_PREFIX = "/api/admin/models/generated";

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

export function isGeneratedModelUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${GENERATED_MODEL_ROUTE_PREFIX}/`);
}

export function isLegacyGeneratedModelPath(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("/models/generated/");
}
