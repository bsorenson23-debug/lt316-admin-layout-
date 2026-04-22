import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildGeneratedModelUrl,
  sanitizeGeneratedModelFileName,
} from "../../lib/generatedModelUrl.ts";
import { buildBodyGeometryAuditAbsolutePath } from "./bodyGeometryAuditArtifact.ts";

export const GENERATED_MODELS_DIR = path.join(
  process.cwd(),
  ".local",
  "generated-models",
);
export const LEGACY_GENERATED_MODELS_DIR = path.join(
  process.cwd(),
  "public",
  "models",
  "generated",
);

export function getGeneratedModelWriteAbsolutePath(fileName: string): string {
  const safeName = sanitizeGeneratedModelFileName(fileName);
  if (!safeName) {
    throw new Error(`Invalid generated model file name: ${fileName}`);
  }
  return path.join(GENERATED_MODELS_DIR, safeName);
}

function getLegacyGeneratedModelAbsolutePath(fileName: string): string {
  const safeName = sanitizeGeneratedModelFileName(fileName);
  if (!safeName) {
    throw new Error(`Invalid generated model file name: ${fileName}`);
  }
  return path.join(LEGACY_GENERATED_MODELS_DIR, safeName);
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveGeneratedModelAbsolutePath(fileName: string): Promise<string> {
  const generatedPath = getGeneratedModelWriteAbsolutePath(fileName);
  if (await pathExists(generatedPath)) {
    return generatedPath;
  }

  const legacyPath = getLegacyGeneratedModelAbsolutePath(fileName);
  if (await pathExists(legacyPath)) {
    return legacyPath;
  }

  const error = new Error(`Generated model not found: ${fileName}`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  throw error;
}

async function resolveGeneratedModelAuditAbsolutePath(fileName: string): Promise<string> {
  const modelAbsolutePath = await resolveGeneratedModelAbsolutePath(fileName);
  const auditAbsolutePath = buildBodyGeometryAuditAbsolutePath(modelAbsolutePath);
  if (await pathExists(auditAbsolutePath)) {
    return auditAbsolutePath;
  }

  const error = new Error(`Generated model audit not found: ${fileName}`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  throw error;
}

export function getGeneratedModelContentType(fileName: string): string {
  return fileName.toLowerCase().endsWith(".gltf")
    ? "model/gltf+json"
    : "model/gltf-binary";
}

export async function generatedModelExists(fileName: string): Promise<boolean> {
  try {
    await resolveGeneratedModelAbsolutePath(fileName);
    return true;
  } catch {
    return false;
  }
}

export async function readGeneratedModel(fileName: string): Promise<Buffer> {
  return readFile(await resolveGeneratedModelAbsolutePath(fileName));
}

export async function statGeneratedModel(fileName: string) {
  return stat(await resolveGeneratedModelAbsolutePath(fileName));
}

export async function generatedModelAuditExists(fileName: string): Promise<boolean> {
  try {
    await resolveGeneratedModelAuditAbsolutePath(fileName);
    return true;
  } catch {
    return false;
  }
}

export async function readGeneratedModelAudit(fileName: string): Promise<string> {
  return readFile(await resolveGeneratedModelAuditAbsolutePath(fileName), "utf8");
}

export async function statGeneratedModelAudit(fileName: string) {
  return stat(await resolveGeneratedModelAuditAbsolutePath(fileName));
}

export async function writeGeneratedModelGlb(
  fileName: string,
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const safeName = sanitizeGeneratedModelFileName(fileName);
  if (!safeName) {
    throw new Error(`Invalid generated model file name: ${fileName}`);
  }
  await mkdir(GENERATED_MODELS_DIR, { recursive: true });
  await writeFile(
    getGeneratedModelWriteAbsolutePath(safeName),
    Buffer.from(arrayBuffer),
  );
  return buildGeneratedModelUrl(safeName);
}
