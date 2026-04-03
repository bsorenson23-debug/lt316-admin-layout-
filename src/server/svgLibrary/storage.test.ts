import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { importSvgLibraryEntries, listSvgLibraryEntries } from "./storage.ts";

const SIMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><path d="M5 20 L95 20" stroke="#000" stroke-width="4" fill="none" /></svg>`;

async function withTempLibraryRoot(fn: (root: string) => Promise<void>) {
  const previous = process.env.LT316_SVG_LIBRARY_DIR;
  const root = await mkdtemp(path.join(tmpdir(), "lt316-svg-library-"));
  process.env.LT316_SVG_LIBRARY_DIR = root;

  try {
    await fn(root);
  } finally {
    if (previous == null) {
      delete process.env.LT316_SVG_LIBRARY_DIR;
    } else {
      process.env.LT316_SVG_LIBRARY_DIR = previous;
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("bulk import preserves folder metadata and generates preview assets", async () => {
  await withTempLibraryRoot(async (root) => {
    const result = await importSvgLibraryEntries([
      {
        name: "tumbler-logo.svg",
        originalFileName: "tumbler-logo.svg",
        relativePath: "Acme/Drinkware/tumbler-logo.svg",
        svgText: SIMPLE_SVG,
      },
    ]);

    assert.equal(result.rejected.length, 0);
    assert.equal(result.entries.length, 1);

    const [entry] = result.entries;
    assert.equal(entry.sourceRelativePath, "Acme/Drinkware/tumbler-logo.svg");
    assert.equal(entry.sourceFolderLabel, "Acme / Drinkware");
    assert.equal(entry.classification.businessName, "Acme");
    assert.equal(entry.classification.itemType, "tumbler");
    assert.equal(entry.classification.artworkType, "logo");
    assert.equal(entry.smartNaming.suggestedName, "acme__drinkware__tumbler__unknown-side__logo__v1.svg");
    assert.equal(entry.smartNaming.suggestedFolderPath, "Acme / Tumbler / Drinkware / Unsorted");
    assert.equal(entry.workflowStatus, "needs-review");
    assert.ok(entry.thumbnailPath);
    assert.ok(entry.previewPath);

    await access(path.join(root, entry.originalSvgPath));
    await access(path.join(root, entry.sanitizedSvgPath));
    await access(path.join(root, entry.thumbnailPath ?? ""));
    await access(path.join(root, entry.previewPath ?? ""));

    const listed = await listSvgLibraryEntries();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, entry.id);
    assert.match(listed[0]?.svgText ?? "", /<svg/i);
  });
});

test("listing migrates legacy flat JSON entries into the new storage layout", async () => {
  await withTempLibraryRoot(async (root) => {
    const legacyPath = path.join(root, "legacy-entry.json");
    await writeFile(
      legacyPath,
      JSON.stringify({
        id: "legacy-entry",
        name: "legacy-logo.svg",
        svgText: SIMPLE_SVG,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
      "utf8",
    );

    const entries = await listSvgLibraryEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.id, "legacy-entry");
    assert.equal(entries[0]?.name, "legacy-logo.svg");
    assert.equal(entries[0]?.workflowStatus, "needs-review");
    assert.ok(entries[0]?.smartNaming.suggestedName);

    const migratedRecordPath = path.join(root, "records", "legacy-entry.json");
    await access(migratedRecordPath);
    await access(path.join(root, "originals", "legacy-entry.svg"));
    await access(path.join(root, "sanitized", "legacy-entry.svg"));

    await assert.rejects(() => readFile(legacyPath, "utf8"));
  });
});
