import type {
  LogoPlacementAssistResponse,
  TraceSettingsAssistResponse,
} from "@/types/imageAssist";
import {
  parseLogoPlacementAssistResponse,
  parseTraceSettingsAssistResponse,
} from "@/lib/adminApi.schema";

const logoPlacementCache = new Map<string, LogoPlacementAssistResponse>();
const traceSettingsCache = new Map<string, TraceSettingsAssistResponse>();
const STORAGE_PREFIX = "lt316:image-assist-cache:";

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Could not load image data for image assist.");
  }
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || "image/png",
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function hashStringForCache(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashFileForCache(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readStoredCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeStoredCache<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore storage quota / availability issues and keep the in-memory cache usable.
  }
}

export async function detectLogoPlacementAssist(args: {
  photoDataUrl: string;
  fileName: string;
  brandHint?: string | null;
  traceHeaders?: HeadersInit;
}): Promise<LogoPlacementAssistResponse> {
  const cacheKey = `logo:${await hashStringForCache(`${args.brandHint?.trim() ?? ""}\n${args.photoDataUrl}`)}`;
  const memoryCached = logoPlacementCache.get(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }
  const stored = readStoredCache<LogoPlacementAssistResponse>(cacheKey);
  if (stored) {
    const parsed = parseLogoPlacementAssistResponse(stored);
    if (parsed) {
      logoPlacementCache.set(cacheKey, parsed);
      return parsed;
    }
  }

  const formData = new FormData();
  formData.set("image", await dataUrlToFile(args.photoDataUrl, args.fileName));
  if (args.brandHint?.trim()) {
    formData.set("brandHint", args.brandHint.trim());
  }

  const response = await fetch("/api/admin/image/assist/logo-placement", {
    method: "POST",
    headers: args.traceHeaders,
    body: formData,
  });
  const payload = await readJson<LogoPlacementAssistResponse & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? "Logo placement assist failed.");
  }
  const parsed = parseLogoPlacementAssistResponse(payload);
  if (!parsed) {
    throw new Error("Logo placement assist returned an invalid response.");
  }
  logoPlacementCache.set(cacheKey, parsed);
  writeStoredCache(cacheKey, parsed);
  return parsed;
}

export async function recommendTraceSettingsAssist(
  file: File,
  traceHeaders?: HeadersInit,
): Promise<TraceSettingsAssistResponse> {
  const cacheKey = `trace:${file.type || "image/png"}:${await hashFileForCache(file)}`;
  const memoryCached = traceSettingsCache.get(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }
  const stored = readStoredCache<TraceSettingsAssistResponse>(cacheKey);
  if (stored) {
    const parsed = parseTraceSettingsAssistResponse(stored);
    if (parsed) {
      traceSettingsCache.set(cacheKey, parsed);
      return parsed;
    }
  }

  const formData = new FormData();
  formData.set("image", file);

  const response = await fetch("/api/admin/image/assist/trace-settings", {
    method: "POST",
    headers: traceHeaders,
    body: formData,
  });
  const payload = await readJson<TraceSettingsAssistResponse & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? "Trace settings assist failed.");
  }
  const parsed = parseTraceSettingsAssistResponse(payload);
  if (!parsed) {
    throw new Error("Trace settings assist returned an invalid response.");
  }
  traceSettingsCache.set(cacheKey, parsed);
  writeStoredCache(cacheKey, parsed);
  return parsed;
}
