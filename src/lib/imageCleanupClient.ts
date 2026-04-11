"use client";

export interface ImageCleanupResult {
  dataUrl: string;
  cleaned: boolean;
  method: "openai" | "original";
  model?: string;
}

const cleanupResultCache = new Map<string, ImageCleanupResult>();

async function hashFileForCache(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function cleanupImageForTracing(file: File): Promise<ImageCleanupResult> {
  const cacheKey = `${file.type || "image/png"}:${await hashFileForCache(file)}`;
  const cached = cleanupResultCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const formData = new FormData();
  formData.set("image", file);

  const response = await fetch("/api/admin/image/cleanup", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => null) as
    | (ImageCleanupResult & { error?: string })
    | null;

  if (!response.ok || !payload?.dataUrl) {
    throw new Error(payload?.error ?? "Image cleanup failed.");
  }

  const result: ImageCleanupResult = {
    dataUrl: payload.dataUrl,
    cleaned: Boolean(payload.cleaned),
    method: payload.method === "openai" ? "openai" : "original",
    model: payload.model,
  };
  cleanupResultCache.set(cacheKey, result);
  return result;
}
