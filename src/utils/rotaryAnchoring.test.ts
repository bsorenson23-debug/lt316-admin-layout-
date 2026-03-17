import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRotaryFootprintFromAnchor,
  isManualRotaryOverrideActive,
  resolveRotaryAxisFromAnchor,
  selectRotaryAnchorHole,
  toBedHoleReference,
  type RotaryHoleAnchorSelection,
} from "./rotaryAnchoring.ts";

test("clicking a bed hole selects primary anchor with row/col and mm coordinates", () => {
  const holeRef = toBedHoleReference({
    rowIndex: 2,
    columnIndex: 4,
    xMm: 112.5,
    yMm: 50,
  });
  const selection = selectRotaryAnchorHole({
    current: {},
    hole: holeRef,
  });

  assert.deepEqual(selection.primaryHole, {
    row: 2,
    col: 4,
    xMm: 112.5,
    yMm: 50,
  });
});

test("shift-select sets secondary anchor hole without replacing primary", () => {
  const primary = toBedHoleReference({
    rowIndex: 1,
    columnIndex: 2,
    xMm: 62.5,
    yMm: 25,
  });
  const secondary = toBedHoleReference({
    rowIndex: 2,
    columnIndex: 2,
    xMm: 50,
    yMm: 50,
  });

  const selection = selectRotaryAnchorHole({
    current: { primaryHole: primary },
    hole: secondary,
    asSecondary: true,
  });

  assert.equal(selection.primaryHole?.row, 1);
  assert.equal(selection.secondaryHole?.row, 2);
});

test("rotary axis is derived from anchor hole plus reference offsets", () => {
  const selection: RotaryHoleAnchorSelection = {
    primaryHole: {
      row: 0,
      col: 3,
      xMm: 75,
      yMm: 0,
    },
  };

  const resolved = resolveRotaryAxisFromAnchor({
    selection,
    referenceToAxisOffsetXmm: 37.5,
    referenceToAxisOffsetYmm: 50,
  });

  assert.equal(resolved.isResolved, true);
  assert.equal(resolved.rotaryAxisXmm, 112.5);
  assert.equal(resolved.rotaryAxisYmm, 50);
});

test("missing offsets falls back cleanly with missing warnings", () => {
  const resolved = resolveRotaryAxisFromAnchor({
    selection: {
      primaryHole: {
        row: 0,
        col: 0,
        xMm: 0,
        yMm: 0,
      },
    },
    referenceToAxisOffsetXmm: undefined,
    referenceToAxisOffsetYmm: undefined,
  });

  assert.equal(resolved.isResolved, false);
  assert.equal(resolved.rotaryAxisXmm, undefined);
  assert.equal(
    resolved.missing.includes("Reference-to-axis offset X is missing."),
    true
  );
  assert.equal(
    resolved.missing.includes("Reference-to-axis offset Y is missing."),
    true
  );
});

test("mount footprint can be anchored from a front-left bolt reference", () => {
  const footprint = buildRotaryFootprintFromAnchor({
    selection: {
      primaryHole: { row: 0, col: 0, xMm: 25, yMm: 50 },
    },
    mountReferenceMode: "front-left-bolt",
    mountPatternXmm: 75,
    mountPatternYmm: 100,
  });

  assert.deepEqual(footprint, {
    xMm: 25,
    yMm: 50,
    widthMm: 75,
    heightMm: 100,
  });
});

test("manual override helper reports active only when enabled with valid value", () => {
  assert.equal(
    isManualRotaryOverrideActive({
      manualOverrideEnabled: true,
      manualRotaryCenterXmm: 145,
    }),
    true
  );
  assert.equal(
    isManualRotaryOverrideActive({
      manualOverrideEnabled: true,
      manualRotaryCenterXmm: null,
    }),
    false
  );
});
