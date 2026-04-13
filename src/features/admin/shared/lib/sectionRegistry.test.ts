import test from "node:test";
import assert from "node:assert/strict";

import { ADMIN_SECTION_REGISTRY, buildAdminSectionSnapshots } from "./sectionRegistry.ts";
import type { AdminSectionRegistryContext } from "../types";

test("admin section registry ids are unique", () => {
  const ids = ADMIN_SECTION_REGISTRY.map((descriptor) => descriptor.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("buildAdminSectionSnapshots returns stable snapshots for visible sections", () => {
  const context: AdminSectionRegistryContext = {
    selection: {
      templateId: "template-1",
      selectedItemId: "item-1",
    },
    templateEditor: {
      open: true,
      activeStep: "detect",
      reviewAccepted: false,
      stagedDetectionPending: false,
      saveGateReason: "Run auto-detect to continue",
      runId: "run-1",
      authority: "guided-template-editor",
      warnings: [],
      errors: [],
      sourceFingerprints: {},
    },
    workspace: {
      visible: true,
      workspaceMode: "tumbler-wrap",
      authority: "body-reference-printable-band",
      summary: "Workspace sized from BODY REFERENCE printable band",
      printableBandLabel: "28.00 -> 244.00",
      workspaceHeightMm: 216,
      renderKey: "workspace-key",
    },
    preview: null,
    readiness: {
      visible: true,
      blockerCount: 1,
      warningCount: 0,
      nextAction: "Resolve the remaining blocker",
      actionLabel: "Open blocker",
    },
    exportBundle: {
      visible: true,
      printableBandLabel: "28.00 -> 244.00",
      outputFolderPath: "C:/exports",
      selectedPresetLabel: "D100C",
      rotaryEnabled: true,
    },
  };

  const snapshots = buildAdminSectionSnapshots(context);
  assert.ok(snapshots.some((snapshot) => snapshot.id === "template.detect" && snapshot.status === "action"));
  assert.ok(snapshots.some((snapshot) => snapshot.id === "workspace.placement" && snapshot.authority === "body-reference-printable-band"));
  assert.ok(snapshots.some((snapshot) => snapshot.id === "job.readiness" && snapshot.status === "action"));
});
