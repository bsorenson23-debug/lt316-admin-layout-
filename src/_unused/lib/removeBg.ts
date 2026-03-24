/**
 * removeBg.ts — Client-side background removal for product photos.
 *
 * Primary: @imgly/background-removal (runs entirely in browser, no API key).
 * Fallback: POST /api/admin/image/remove-bg (Replicate BiRefNet, needs token).
 * Last resort: returns the original image unchanged.
 *
 * The caller should never block on this — bg removal is a nice-to-have.
 */

export interface RemoveBgResult {
  /** Transparent PNG data URL (bg removed) — or original if removal failed */
  dataUrl: string;
  /** Whether background was actually removed or we fell back to original */
  bgRemoved: boolean;
  /** Which method succeeded */
  method: "imgly" | "replicate" | "original";
}

/**
 * Remove the background from an image file.
 * Tries client-side @imgly first, then server-side Replicate, then gives up gracefully.
 */
export async function removeBg(file: File): Promise<RemoveBgResult> {
  // 1. Try client-side @imgly/background-removal (no API key needed)
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const blob = await removeBackground(file);
    const dataUrl = await blobToDataUrl(blob);
    if (dataUrl) return { dataUrl, bgRemoved: true, method: "imgly" };
  } catch {
    // @imgly failed — try server-side fallback
  }

  // 2. Try server-side Replicate API
  try {
    const formData = new FormData();
    formData.set("image", file);
    const res = await fetch("/api/admin/image/remove-bg", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.dataUrl && typeof data.dataUrl === "string") {
        return { dataUrl: data.dataUrl, bgRemoved: true, method: "replicate" };
      }
    }
  } catch {
    // Server API failed — fall through
  }

  // 3. Give up — return original
  return { dataUrl: await fileToDataUrl(file), bgRemoved: false, method: "original" };
}

/** Convert a Blob to a base64 data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

/** Convert a File to a base64 data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}
