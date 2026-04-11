"use client";

export interface RemoveBgResult {
  dataUrl: string;
  bgRemoved: boolean;
  method: "replicate" | "imgly" | "original";
  model?: string;
}

interface RemoveBgOptions {
  file: File;
  preferServer?: boolean;
  localModel?: "isnet" | "isnet_fp16" | "isnet_quint8";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string" && reader.result.length > 0) {
        resolve(reader.result);
        return;
      }
      reject(new Error("Background removal did not return a usable image."));
    };
    reader.onerror = () => reject(new Error("Background removal output could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function tryServerRemoveBg(file: File): Promise<RemoveBgResult | null> {
  const formData = new FormData();
  formData.set("image", file);

  const response = await fetch("/api/admin/image/remove-bg", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => null) as
    | { dataUrl?: string; model?: string }
    | null;

  if (!response.ok || typeof payload?.dataUrl !== "string" || payload.dataUrl.length === 0) {
    return null;
  }

  return {
    dataUrl: payload.dataUrl,
    bgRemoved: true,
    method: "replicate",
    model: payload.model,
  };
}

async function tryLocalRemoveBg(
  file: File,
  model: "isnet" | "isnet_fp16" | "isnet_quint8",
): Promise<RemoveBgResult | null> {
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const blob = await removeBackground(file, { model, proxyToWorker: false });
    return {
      dataUrl: await blobToDataUrl(blob),
      bgRemoved: true,
      method: "imgly",
      model: "Local AI Cutout",
    };
  } catch {
    return null;
  }
}

export async function removeBackgroundWithFallback({
  file,
  preferServer = true,
  localModel = "isnet_quint8",
}: RemoveBgOptions): Promise<RemoveBgResult> {
  if (preferServer) {
    const serverResult = await tryServerRemoveBg(file).catch(() => null);
    if (serverResult) return serverResult;
  }

  const localResult = await tryLocalRemoveBg(file, localModel);
  if (localResult) return localResult;

  return {
    dataUrl: await blobToDataUrl(file),
    bgRemoved: false,
    method: "original",
    model: "Original image",
  };
}
