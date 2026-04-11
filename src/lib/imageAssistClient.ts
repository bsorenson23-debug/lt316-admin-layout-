import type {
  LogoPlacementAssistResponse,
  TraceSettingsAssistResponse,
} from "@/types/imageAssist";

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
}): Promise<LogoPlacementAssistResponse> {
  const cacheKey = `logo:${await hashStringForCache(`${args.brandHint?.trim() ?? ""}\n${args.photoDataUrl}`)}`;
  const memoryCached = logoPlacementCache.get(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }
  const stored = readStoredCache<LogoPlacementAssistResponse>(cacheKey);
  if (stored) {
    logoPlacementCache.set(cacheKey, stored);
    return stored;
  }

  const formData = new FormData();
  formData.set("image", await dataUrlToFile(args.photoDataUrl, args.fileName));
  if (args.brandHint?.trim()) {
    formData.set("brandHint", args.brandHint.trim());
  }

  const response = await fetch("/api/admin/image/assist/logo-placement", {
    method: "POST",
    body: formData,
  });
  const payload = await readJson<LogoPlacementAssistResponse & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? "Logo placement assist failed.");
  }
  logoPlacementCache.set(cacheKey, payload);
  writeStoredCache(cacheKey, payload);
  return payload;
}

export async function recommendTraceSettingsAssist(file: File): Promise<TraceSettingsAssistResponse> {
  const cacheKey = `trace:${file.type || "image/png"}:${await hashFileForCache(file)}`;
  const memoryCached = traceSettingsCache.get(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }
  const stored = readStoredCache<TraceSettingsAssistResponse>(cacheKey);
  if (stored) {
    traceSettingsCache.set(cacheKey, stored);
    return stored;
  }

  const formData = new FormData();
  formData.set("image", file);

  const response = await fetch("/api/admin/image/assist/trace-settings", {
    method: "POST",
    body: formData,
  });
  const payload = await readJson<TraceSettingsAssistResponse & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? "Trace settings assist failed.");
  }
  traceSettingsCache.set(cacheKey, payload);
  writeStoredCache(cacheKey, payload);
  return payload;
}
