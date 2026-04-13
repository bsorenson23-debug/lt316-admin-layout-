import test from "node:test";
import assert from "node:assert/strict";
import { deriveTumblerWorkspaceTruthState } from "./tumblerWorkspaceTruth.ts";
import type { TumblerPrintableWorkspaceFrame } from "./tumblerPrintableWorkspace.ts";

function createWorkspaceFrame(
  overrides: Partial<TumblerPrintableWorkspaceFrame> = {},
): TumblerPrintableWorkspaceFrame {
  return {
    hasPrintableBand: true,
    usesPrintableWorkspace: true,
    bodyShellHeightMm: 216,
    printableTopFromBodyTopMm: 19,
    printableBottomFromBodyTopMm: 184,
    printableHeightMm: 165,
    workspaceTopFromBodyTopMm: 19,
    workspaceBottomFromBodyTopMm: 184,
    workspaceHeightMm: 165,
    workspaceTopFromOverallMm: 28,
    workspaceBottomFromOverallMm: 193,
    overallTopMarginMm: 28,
    overallBottomMarginMm: 51,
    printableTopY: 0,
    printableBottomY: 165,
    printableCenterY: 82.5,
    ...overrides,
  };
}

test("deriveTumblerWorkspaceTruthState reports BODY REFERENCE printable-band truth with canonical photo registration", () => {
  const truth = deriveTumblerWorkspaceTruthState({
    workspaceMode: "tumbler-wrap",
    workspaceFrame: createWorkspaceFrame(),
    photoRegistrationMode: "canonical-front",
    hasPhotoOverlay: true,
  });

  assert.equal(truth.printableBandSource, "body-reference-printable-band");
  assert.equal(truth.workspaceHeightSource, "body-reference-printable-band");
  assert.equal(truth.photoRegistrationSource, "canonical-front");
  assert.equal(truth.workspaceTruthLabel, "Workspace sized from BODY REFERENCE printable band");
  assert.equal(truth.previewTruthLabel, "3D model is preview-only");
  assert.equal(truth.photoTruthLabel, "Photo overlay sized from BODY REFERENCE calibration");
});

test("deriveTumblerWorkspaceTruthState falls back to the body shell and legacy photo fit when canonical cropping is unavailable", () => {
  const truth = deriveTumblerWorkspaceTruthState({
    workspaceMode: "tumbler-wrap",
    workspaceFrame: createWorkspaceFrame({
      hasPrintableBand: false,
      usesPrintableWorkspace: false,
    }),
    photoRegistrationMode: "legacy-fit",
    hasPhotoOverlay: true,
  });

  assert.equal(truth.printableBandSource, "body-shell-fallback");
  assert.equal(truth.workspaceHeightSource, "body-shell-fallback");
  assert.equal(truth.photoRegistrationSource, "legacy-fit");
  assert.equal(truth.workspaceTruthLabel, "Workspace sized from full body shell fallback");
  assert.equal(truth.photoTruthLabel, "Photo overlay is using legacy image fit");
});

test("deriveTumblerWorkspaceTruthState keeps BODY REFERENCE printable-band truth when the printable band matches the full body shell", () => {
  const truth = deriveTumblerWorkspaceTruthState({
    workspaceMode: "tumbler-wrap",
    workspaceFrame: createWorkspaceFrame({
      usesPrintableWorkspace: false,
      printableTopFromBodyTopMm: 0,
      printableBottomFromBodyTopMm: 216,
      printableHeightMm: 216,
      workspaceTopFromBodyTopMm: 0,
      workspaceBottomFromBodyTopMm: 216,
      workspaceHeightMm: 216,
      printableTopY: 0,
      printableBottomY: 216,
      printableCenterY: 108,
    }),
    photoRegistrationMode: "canonical-front",
    hasPhotoOverlay: true,
  });

  assert.equal(truth.printableBandSource, "body-reference-printable-band");
  assert.equal(truth.workspaceHeightSource, "body-reference-printable-band");
  assert.equal(truth.workspaceTruthLabel, "Workspace sized from BODY REFERENCE printable band");
  assert.equal(truth.photoTruthLabel, "Photo overlay sized from BODY REFERENCE calibration");
});

test("deriveTumblerWorkspaceTruthState suppresses tumbler-only cues for flat-bed workspaces", () => {
  const truth = deriveTumblerWorkspaceTruthState({
    workspaceMode: "flat-bed",
    workspaceFrame: null,
    photoRegistrationMode: null,
    hasPhotoOverlay: false,
  });

  assert.equal(truth.printableBandSource, "flat-bed");
  assert.equal(truth.workspaceHeightSource, "flat-bed");
  assert.equal(truth.photoRegistrationSource, "off");
  assert.equal(truth.workspaceTruthLabel, null);
  assert.equal(truth.previewTruthLabel, null);
  assert.equal(truth.photoTruthLabel, null);
});
