import { createHash } from "crypto";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const SMART_TEMPLATE_LOOKUP_CACHE_VERSION = "2026-04-09-v3";

type SmartTemplateLookupCacheBucket = "results" | "text" | "image";

interface SmartTemplateLookupCacheRecord<T> {
  version: string;
  key: string;
  createdAt: string;
  updatedAt: string;
  payload: T;
}

interface SmartTemplateLookupCacheKeyInput {
  lookupInput?: string;
  imageBytes?: Uint8Array;
  mimeType?: string | null;
  fileName?: string | null;
  laserTypeOverride?: string | null;
  finishTypeOverride?: string | null;
}

function normalizeLookupInput(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildCacheRoot() {
  return path.join(process.cwd(), "storage", "smart-template-lookup-cache");
}

function buildBucketDir(bucket: SmartTemplateLookupCacheBucket) {
  return path.join(buildCacheRoot(), bucket);
}

function buildCacheFilePath(bucket: SmartTemplateLookupCacheBucket, key: string) {
  return path.join(buildBucketDir(bucket), `${key}.json`);
}

function buildImageFingerprint(
  imageBytes: Uint8Array | undefined,
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): string {
  if (!imageBytes || imageBytes.byteLength === 0) return "no-image";
  return [
    mimeType ?? "unknown-mime",
    fileName ?? "unknown-file",
    imageBytes.byteLength,
    sha256(imageBytes),
  ].join(":");
}

async function ensureBucketDir(bucket: SmartTemplateLookupCacheBucket) {
  await mkdir(buildBucketDir(bucket), { recursive: true });
}

export function buildSmartTemplateLookupResultCacheKey(input: SmartTemplateLookupCacheKeyInput): string {
  return sha256([
    SMART_TEMPLATE_LOOKUP_CACHE_VERSION,
    "result",
    normalizeLookupInput(input.lookupInput),
    buildImageFingerprint(input.imageBytes, input.mimeType, input.fileName),
    input.laserTypeOverride ?? "no-laser-override",
    input.finishTypeOverride ?? "no-finish-override",
  ].join("|"));
}

export function buildSmartTemplateLookupTextCacheKey(lookupInput: string): string {
  return sha256([
    SMART_TEMPLATE_LOOKUP_CACHE_VERSION,
    "text",
    normalizeLookupInput(lookupInput),
  ].join("|"));
}

export function buildSmartTemplateLookupImageCacheKey(input: Pick<SmartTemplateLookupCacheKeyInput, "imageBytes" | "mimeType" | "fileName">): string {
  return sha256([
    SMART_TEMPLATE_LOOKUP_CACHE_VERSION,
    "image",
    buildImageFingerprint(input.imageBytes, input.mimeType, input.fileName),
  ].join("|"));
}

export async function readSmartTemplateLookupCache<T>(
  bucket: SmartTemplateLookupCacheBucket,
  key: string,
): Promise<T | null> {
  try {
    const raw = await readFile(buildCacheFilePath(bucket, key), "utf8");
    const record = JSON.parse(raw) as SmartTemplateLookupCacheRecord<T>;
    if (record.version !== SMART_TEMPLATE_LOOKUP_CACHE_VERSION || record.key !== key) {
      return null;
    }
    return record.payload;
  } catch {
    return null;
  }
}

export async function writeSmartTemplateLookupCache<T>(
  bucket: SmartTemplateLookupCacheBucket,
  key: string,
  payload: T,
): Promise<void> {
  await ensureBucketDir(bucket);
  const filePath = buildCacheFilePath(bucket, key);
  const now = new Date().toISOString();
  const record: SmartTemplateLookupCacheRecord<T> = {
    version: SMART_TEMPLATE_LOOKUP_CACHE_VERSION,
    key,
    createdAt: now,
    updatedAt: now,
    payload,
  };
  await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
}

export async function localPublicAssetExists(assetPath: string | null | undefined): Promise<boolean> {
  if (!assetPath || !assetPath.startsWith("/")) return false;
  const absolutePath = path.join(process.cwd(), "public", assetPath.replace(/^\/+/, ""));
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}
