import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDefaultCalibrationWorkspaceState,
  loadCalibrationWorkspaceState,
  resetCalibrationWorkspaceState,
  saveCalibrationWorkspaceState,
} from "./calibrationWorkspaceState.ts";

type MemoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function createMemoryStorage(seed?: Record<string, string>): MemoryStorage {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

test("no saved workspace state falls back to rotary mode defaults", () => {
  const storage = createMemoryStorage();
  const loaded = loadCalibrationWorkspaceState(storage);
  assert.equal(loaded.activeCalibrationMode, "rotary");
  assert.equal(loaded.selectedRotaryPresetId, null);
  assert.equal(loaded.anchorMode, "physical-top");
  assert.equal(loaded.overlayStateByMode.export.showExportPreview, true);
});

test("selected rotary preset restores after reload", () => {
  const storage = createMemoryStorage();
  const base = buildDefaultCalibrationWorkspaceState();
  saveCalibrationWorkspaceState(
    {
      ...base,
      selectedRotaryPresetId: "d80c-chuck",
    },
    storage
  );
  const restored = loadCalibrationWorkspaceState(storage);
  assert.equal(restored.selectedRotaryPresetId, "d80c-chuck");
});

test("active calibration mode restores after reload", () => {
  const storage = createMemoryStorage();
  const base = buildDefaultCalibrationWorkspaceState();
  saveCalibrationWorkspaceState(
    {
      ...base,
      activeCalibrationMode: "export",
      selectedRotaryPresetId: "d100c-chuck",
    },
    storage
  );
  const restored = loadCalibrationWorkspaceState(storage);
  assert.equal(restored.activeCalibrationMode, "export");
  assert.equal(restored.selectedRotaryPresetId, "d100c-chuck");
});

test("overlay toggles restore cleanly after reload", () => {
  const storage = createMemoryStorage();
  const base = buildDefaultCalibrationWorkspaceState();
  saveCalibrationWorkspaceState(
    {
      ...base,
      overlayStateByMode: {
        ...base.overlayStateByMode,
        rotary: {
          ...base.overlayStateByMode.rotary,
          showHoleGrid: false,
          showCenterline: false,
        },
      },
    },
    storage
  );

  const restored = loadCalibrationWorkspaceState(storage);
  assert.equal(restored.overlayStateByMode.rotary.showHoleGrid, false);
  assert.equal(restored.overlayStateByMode.rotary.showCenterline, false);
});

test("rotary anchor selection and manual override restore after reload", () => {
  const storage = createMemoryStorage();
  const base = buildDefaultCalibrationWorkspaceState();
  saveCalibrationWorkspaceState(
    {
      ...base,
      rotaryAnchorSelection: {
        primaryHole: { row: 1, col: 3, xMm: 87.5, yMm: 25 },
      },
      manualRotaryOverrideEnabled: true,
    },
    storage
  );

  const restored = loadCalibrationWorkspaceState(storage);
  assert.equal(restored.manualRotaryOverrideEnabled, true);
  assert.equal(restored.rotaryAnchorSelection?.primaryHole?.row, 1);
  assert.equal(restored.rotaryAnchorSelection?.primaryHole?.col, 3);
});

test("export preview toggle and anchor mode restore after reload", () => {
  const storage = createMemoryStorage();
  const base = buildDefaultCalibrationWorkspaceState();
  saveCalibrationWorkspaceState(
    {
      ...base,
      anchorMode: "printable-top",
      overlayStateByMode: {
        ...base.overlayStateByMode,
        export: {
          ...base.overlayStateByMode.export,
          showExportPreview: false,
        },
      },
    },
    storage
  );

  const restored = loadCalibrationWorkspaceState(storage);
  assert.equal(restored.anchorMode, "printable-top");
  assert.equal(restored.overlayStateByMode.export.showExportPreview, false);
});

test("reset clears persisted workspace state back to defaults", () => {
  const storage = createMemoryStorage();
  const base = buildDefaultCalibrationWorkspaceState();
  saveCalibrationWorkspaceState(
    {
      ...base,
      activeCalibrationMode: "lens",
      selectedRotaryPresetId: "rotoboss-talon",
      anchorMode: "printable-top",
    },
    storage
  );

  const reset = resetCalibrationWorkspaceState(storage);
  const restored = loadCalibrationWorkspaceState(storage);
  assert.equal(reset.activeCalibrationMode, "rotary");
  assert.equal(restored.activeCalibrationMode, "rotary");
  assert.equal(restored.selectedRotaryPresetId, null);
  assert.equal(restored.anchorMode, "physical-top");
});
