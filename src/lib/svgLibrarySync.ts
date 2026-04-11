export const SVG_LIBRARY_SYNC_STORAGE_KEY = "lt316_svg_library_changed";

export function buildSvgLibrarySyncValue(timestamp = Date.now()): string {
  return `${Math.max(0, Math.trunc(timestamp))}`;
}

export function isSvgLibrarySyncStorageKey(key: string | null | undefined): boolean {
  return key === SVG_LIBRARY_SYNC_STORAGE_KEY;
}

export function publishSvgLibrarySync(storage?: Pick<Storage, "setItem"> | null): string {
  const value = buildSvgLibrarySyncValue();

  if (storage) {
    try {
      storage.setItem(SVG_LIBRARY_SYNC_STORAGE_KEY, value);
    } catch {
      // Ignore storage write failures so SVG saves still succeed.
    }
  }

  return value;
}
