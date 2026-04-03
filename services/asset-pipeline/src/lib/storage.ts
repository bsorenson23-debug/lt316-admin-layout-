import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobManifest } from "../types/manifest";

const JOB_STORAGE_ROOT = process.env.JOB_STORAGE_ROOT || "/data/jobs";
const MANIFEST_FILE = "manifest.json";
const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PLACEHOLDER_DIR_NAME = "_placeholder";

export class InvalidJobIdError extends Error {
  constructor(jobId: string) {
    super(`Job id "${jobId}" is not valid for storage access.`);
    this.name = "InvalidJobIdError";
  }
}

export class StorageScopeError extends Error {
  constructor(targetPath: string) {
    super(`Resolved path "${targetPath}" escapes the configured job storage root.`);
    this.name = "StorageScopeError";
  }
}

export function getStorageRoot(): string {
  return JOB_STORAGE_ROOT;
}

function getResolvedStorageRoot(): string {
  return path.resolve(JOB_STORAGE_ROOT);
}

function assertValidJobId(jobId: string): string {
  const normalizedJobId = jobId.trim();

  if (!JOB_ID_PATTERN.test(normalizedJobId)) {
    throw new InvalidJobIdError(jobId);
  }

  return normalizedJobId;
}

function resolveScopedPath(...segments: string[]): string {
  const storageRoot = getResolvedStorageRoot();
  const candidatePath = path.resolve(storageRoot, ...segments);
  const relativePath = path.relative(storageRoot, candidatePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new StorageScopeError(candidatePath);
  }

  return candidatePath;
}

export function getJobDir(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId));
}

export function getPlaceholderDir(): string {
  return resolveScopedPath(PLACEHOLDER_DIR_NAME);
}

export function getPlaceholderFilePath(fileName: string): string {
  return resolveScopedPath(PLACEHOLDER_DIR_NAME, fileName);
}

export function getPlaceholderMetadataPath(): string {
  return resolveScopedPath(PLACEHOLDER_DIR_NAME, "placeholder.json");
}

export function getManifestPath(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId), MANIFEST_FILE);
}

export function getProductPath(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId), "product.json");
}

export function getDebugDir(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId), "debug");
}

export function getDebugFilePath(jobId: string, fileName: string): string {
  return resolveScopedPath(assertValidJobId(jobId), "debug", fileName);
}

export function getImagesDir(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId), "images");
}

export function getRawImagesDir(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId), "images", "raw");
}

export function getCleanImagesDir(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId), "images", "clean");
}

export function getRegionImagesDir(jobId: string): string {
  return resolveScopedPath(assertValidJobId(jobId), "images", "regions");
}

export function getJobFilePath(jobId: string, ...segments: string[]): string {
  return resolveScopedPath(assertValidJobId(jobId), ...segments);
}

export async function ensureStorageRoot(): Promise<void> {
  await ensureDirectories([getResolvedStorageRoot(), getPlaceholderDir()]);
}

export async function createJobDirectories(jobId: string): Promise<void> {
  await ensureDirectories([
    getJobDir(jobId),
    getImagesDir(jobId),
    getRawImagesDir(jobId),
    getCleanImagesDir(jobId),
    getRegionImagesDir(jobId),
    getDebugDir(jobId),
  ]);
}

export async function ensureDirectories(paths: string[]): Promise<void> {
  await Promise.all(paths.map((dirPath) => mkdir(dirPath, { recursive: true })));
}

export async function readManifest(jobId: string): Promise<JobManifest> {
  const data = await readFile(getManifestPath(jobId), "utf8");
  return JSON.parse(data) as JobManifest;
}

export async function saveManifest(manifest: JobManifest): Promise<void> {
  await writeJson(getManifestPath(manifest.jobId), manifest);
}

export async function writeDebugFile(
  jobId: string,
  stage: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const filePath = getDebugFilePath(jobId, `${stage}.json`);
  await writeJson(filePath, payload);
}

export async function writeJobJson(
  jobId: string,
  segments: string[],
  payload: unknown,
): Promise<void> {
  const filePath = getJobFilePath(jobId, ...segments);
  await writeJson(filePath, payload);
}

export async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
