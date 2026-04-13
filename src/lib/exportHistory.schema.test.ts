import assert from "node:assert/strict";
import test from "node:test";

import { parseExportHistoryEntries } from "./exportHistory.schema.ts";

test("export history schema filters malformed entries and preserves trace metadata", () => {
  const entries = parseExportHistoryEntries([
    {
      id: "exp-1",
      exportedAt: "2026-04-12T00:00:00.000Z",
      templateWidthMm: 313.6,
      templateHeightMm: 216,
      artworkFingerprint: "abcd1234",
      itemsSnapshot: [
        { name: "Logo", x: 1, y: 2, width: 3, height: 4, rotation: 0 },
      ],
      exportOriginXmm: 0,
      exportOriginYmm: 0,
      traceId: "trace-1",
      sectionId: "export.bundle",
      runId: "run-1",
    },
    {
      id: "bad",
      exportedAt: "2026-04-12T00:00:00.000Z",
      templateWidthMm: "not-a-number",
    },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.traceId, "trace-1");
  assert.equal(entries[0]?.sectionId, "export.bundle");
});
