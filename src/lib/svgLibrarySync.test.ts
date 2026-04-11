import assert from "node:assert/strict";
import test from "node:test";

import {
  SVG_LIBRARY_SYNC_STORAGE_KEY,
  buildSvgLibrarySyncValue,
  isSvgLibrarySyncStorageKey,
  publishSvgLibrarySync,
} from "./svgLibrarySync.ts";

test("buildSvgLibrarySyncValue normalizes the timestamp into a storage-safe string", () => {
  assert.equal(buildSvgLibrarySyncValue(1234.9), "1234");
  assert.equal(buildSvgLibrarySyncValue(-50), "0");
});

test("isSvgLibrarySyncStorageKey only matches the SVG library sync key", () => {
  assert.equal(isSvgLibrarySyncStorageKey(SVG_LIBRARY_SYNC_STORAGE_KEY), true);
  assert.equal(isSvgLibrarySyncStorageKey("lt316_other"), false);
  assert.equal(isSvgLibrarySyncStorageKey(null), false);
});

test("publishSvgLibrarySync writes the generated value to storage", () => {
  const writes: Array<{ key: string; value: string }> = [];
  const storage = {
    setItem(key: string, value: string) {
      writes.push({ key, value });
    },
  };

  const publishedValue = publishSvgLibrarySync(storage);

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {
    key: SVG_LIBRARY_SYNC_STORAGE_KEY,
    value: publishedValue,
  });
});
