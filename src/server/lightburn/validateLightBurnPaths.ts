import { access, mkdir, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { extname } from "node:path";
import type {
  LightBurnPathSettings,
  LightBurnPathValidationItem,
  LightBurnPathValidationResult,
} from "../../types/export.ts";

type PathKind = "file" | "directory";

interface StatLike {
  isFile(): boolean;
  isDirectory(): boolean;
}

interface LightBurnPathValidationFs {
  stat(path: string): Promise<StatLike>;
  mkdir(path: string): Promise<void>;
  accessWrite(path: string): Promise<void>;
}

const DEFAULT_FS: LightBurnPathValidationFs = {
  stat: (path) => stat(path),
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
  accessWrite: (path) => access(path, fsConstants.W_OK),
};

function normalizePath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildResult(
  status: LightBurnPathValidationItem["status"],
  message: string
): LightBurnPathValidationItem {
  return { status, message };
}

function hasAllowedExtension(pathValue: string, allowed: string[]): boolean {
  const extension = extname(pathValue).toLowerCase();
  return allowed.includes(extension);
}

function isNotFoundError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function isPermissionError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    ((error as { code?: string }).code === "EACCES" ||
      (error as { code?: string }).code === "EPERM")
  );
}

async function validateExistingPath(
  pathValue: string,
  kind: PathKind,
  fsApi: LightBurnPathValidationFs
): Promise<LightBurnPathValidationItem> {
  try {
    const stats = await fsApi.stat(pathValue);
    if (kind === "file" && !stats.isFile()) {
      return buildResult("not-found", "Not found");
    }
    if (kind === "directory" && !stats.isDirectory()) {
      return buildResult("not-found", "Not found");
    }
    return buildResult("valid", "Valid");
  } catch (error) {
    if (isNotFoundError(error)) {
      return buildResult("not-found", "Not found");
    }
    return buildResult("error", "Validation error");
  }
}

export async function validateLightBurnTemplatePath(
  pathValue: string | undefined,
  fsApi: LightBurnPathValidationFs = DEFAULT_FS
): Promise<LightBurnPathValidationItem> {
  const normalized = normalizePath(pathValue);
  if (!normalized) {
    return buildResult("missing", "Missing");
  }

  if (!hasAllowedExtension(normalized, [".lbrn2", ".lbrn"])) {
    return buildResult("invalid-extension", "Invalid extension");
  }

  return validateExistingPath(normalized, "file", fsApi);
}

export async function validateLightBurnOutputFolderPath(
  pathValue: string | undefined,
  fsApi: LightBurnPathValidationFs = DEFAULT_FS
): Promise<LightBurnPathValidationItem> {
  const normalized = normalizePath(pathValue);
  if (!normalized) {
    return buildResult("missing", "Missing");
  }

  try {
    const stats = await fsApi.stat(normalized);
    if (!stats.isDirectory()) {
      return buildResult("not-found", "Not found");
    }
  } catch (error) {
    if (isNotFoundError(error)) {
      try {
        await fsApi.mkdir(normalized);
      } catch (mkdirError) {
        if (isPermissionError(mkdirError)) {
          return buildResult("not-writable", "Not writable");
        }
        return buildResult("not-found", "Not found");
      }
    } else {
      return buildResult("error", "Validation error");
    }
  }

  try {
    await fsApi.accessWrite(normalized);
  } catch (error) {
    if (isPermissionError(error)) {
      return buildResult("not-writable", "Not writable");
    }
    return buildResult("error", "Validation error");
  }

  return buildResult("valid", "Valid");
}

export async function validateLightBurnDeviceBundlePath(
  pathValue: string | undefined,
  fsApi: LightBurnPathValidationFs = DEFAULT_FS
): Promise<LightBurnPathValidationItem> {
  const normalized = normalizePath(pathValue);
  if (!normalized) {
    return buildResult("missing", "Missing");
  }

  if (!hasAllowedExtension(normalized, [".lbzip"])) {
    return buildResult("invalid-extension", "Invalid extension");
  }

  return validateExistingPath(normalized, "file", fsApi);
}

export async function validateLightBurnPathSettings(
  settings: LightBurnPathSettings,
  fsApi: LightBurnPathValidationFs = DEFAULT_FS
): Promise<LightBurnPathValidationResult> {
  const [templateProjectPath, outputFolderPath, deviceBundlePath] =
    await Promise.all([
      validateLightBurnTemplatePath(settings.templateProjectPath, fsApi),
      validateLightBurnOutputFolderPath(settings.outputFolderPath, fsApi),
      validateLightBurnDeviceBundlePath(settings.deviceBundlePath, fsApi),
    ]);

  return {
    templateProjectPath,
    outputFolderPath,
    deviceBundlePath,
  };
}
