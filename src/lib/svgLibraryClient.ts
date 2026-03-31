import type { SvgAsset } from "@/types/admin";
import type {
  SvgLibraryEntry,
  SvgLibraryEntryImportInput,
  SvgLibraryImportRejected,
} from "@/types/svgLibrary";
import { normalizeSvgToArtworkBounds, parseSvgAsset } from "@/utils/svg";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function svgLibraryEntryToAsset(entry: SvgLibraryEntry): SvgAsset {
  const parsed = parseSvgAsset(entry.id, entry.name, entry.svgText);
  const libraryMeta = {
    originalFileName: entry.originalFileName,
    sourceRelativePath: entry.sourceRelativePath,
    sourceFolderLabel: entry.sourceFolderLabel,
    checksumSha256: entry.checksumSha256,
    thumbnailPath: entry.thumbnailPath,
    previewPath: entry.previewPath,
    tags: entry.tags,
    laserReady: entry.laserReady,
    laserWarnings: entry.laserWarnings,
    classification: entry.classification,
  };

  try {
    const normalized = normalizeSvgToArtworkBounds(parsed.content, parsed.artworkBounds);
    return {
      ...parsed,
      content: normalized.svgText,
      viewBox: `${normalized.documentBounds.x} ${normalized.documentBounds.y} ${normalized.documentBounds.width} ${normalized.documentBounds.height}`,
      naturalWidth: normalized.documentBounds.width,
      naturalHeight: normalized.documentBounds.height,
      documentBounds: normalized.documentBounds,
      artworkBounds: normalized.artworkBounds,
      uploadedAt: new Date(entry.createdAt),
      libraryMeta,
    };
  } catch {
    return {
      ...parsed,
      uploadedAt: new Date(entry.createdAt),
      libraryMeta,
    };
  }
}

export async function fetchSvgLibraryAssets(): Promise<SvgAsset[]> {
  const response = await fetch("/api/admin/svg-library", { cache: "no-store" });
  const payload = await readJson<{ entries?: SvgLibraryEntry[]; error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load SVG library");
  }
  return (payload.entries ?? []).map(svgLibraryEntryToAsset);
}

export async function createSvgLibraryAsset(input: {
  name: string;
  svgText: string;
  relativePath?: string | null;
}): Promise<SvgAsset> {
  const response = await fetch("/api/admin/svg-library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ entry?: SvgLibraryEntry; error?: string }>(response);
  if (!response.ok || !payload.entry) {
    throw new Error(payload.error ?? "Failed to save SVG");
  }
  return svgLibraryEntryToAsset(payload.entry);
}

export async function importSvgLibraryAssets(
  inputs: SvgLibraryEntryImportInput[],
): Promise<{ assets: SvgAsset[]; rejected: SvgLibraryImportRejected[] }> {
  const response = await fetch("/api/admin/svg-library/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: inputs }),
  });
  const payload = await readJson<{
    entries?: SvgLibraryEntry[];
    rejected?: SvgLibraryImportRejected[];
    error?: string;
  }>(response);
  if (!response.ok && !payload.entries?.length) {
    throw new Error(payload.error ?? "Failed to import SVG library entries");
  }

  return {
    assets: (payload.entries ?? []).map(svgLibraryEntryToAsset),
    rejected: payload.rejected ?? [],
  };
}

export async function updateSvgLibraryAsset(input: {
  id: string;
  name?: string;
  svgText?: string;
}): Promise<SvgAsset> {
  const response = await fetch(`/api/admin/svg-library/${input.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      svgText: input.svgText,
    }),
  });
  const payload = await readJson<{ entry?: SvgLibraryEntry; error?: string }>(response);
  if (!response.ok || !payload.entry) {
    throw new Error(payload.error ?? "Failed to update SVG");
  }
  return svgLibraryEntryToAsset(payload.entry);
}

export async function deleteSvgLibraryAsset(id: string): Promise<void> {
  const response = await fetch(`/api/admin/svg-library/${id}`, { method: "DELETE" });
  const payload = await readJson<{ ok?: boolean; error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to delete SVG");
  }
}

export async function clearSvgLibraryAssets(): Promise<void> {
  const response = await fetch("/api/admin/svg-library", { method: "DELETE" });
  const payload = await readJson<{ ok?: boolean; error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to clear SVG library");
  }
}
