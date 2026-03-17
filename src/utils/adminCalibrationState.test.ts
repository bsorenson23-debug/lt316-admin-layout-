import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ROTARY_PLACEMENT_PRESETS } from "../data/rotaryPlacementPresets.ts";
import {
  deleteRotaryPreset,
  getCalibrationToolsVisible,
  getRotaryPresets,
  saveRotaryPreset,
  setCalibrationToolsVisible,
  updateRotaryPreset,
} from "./adminCalibrationState.ts";

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

test("calibration visibility defaults to false and persists toggle", () => {
  const storage = createMemoryStorage();
  assert.equal(getCalibrationToolsVisible(storage), false);

  setCalibrationToolsVisible(true, storage);
  assert.equal(getCalibrationToolsVisible(storage), true);

  setCalibrationToolsVisible(false, storage);
  assert.equal(getCalibrationToolsVisible(storage), false);
});

test("rotary presets default to bundled presets when storage is empty", () => {
  const storage = createMemoryStorage();
  const presets = getRotaryPresets(storage);
  assert.equal(presets.length, DEFAULT_ROTARY_PLACEMENT_PRESETS.length);
  assert.equal(presets[0].id, DEFAULT_ROTARY_PLACEMENT_PRESETS[0].id);
});

test("rotary preset create, update, and delete flow works", () => {
  const storage = createMemoryStorage();
  const createdList = saveRotaryPreset(
    {
      name: "QA Preset",
      bedOrigin: "top-left",
      rotaryCenterXmm: 182.5,
      rotaryTopYmm: 27.25,
      chuckOrRoller: "roller",
      notes: "Test note",
    },
    storage
  );

  const created = createdList.find((preset) => preset.name === "QA Preset");
  assert.ok(created);
  assert.equal(created?.rotaryCenterXmm, 182.5);
  assert.equal(created?.rotaryTopYmm, 27.25);

  const updatedList = updateRotaryPreset(
    created!.id,
    { rotaryCenterXmm: 191.2, chuckOrRoller: "chuck" },
    storage
  );
  const updated = updatedList.find((preset) => preset.id === created!.id);
  assert.ok(updated);
  assert.equal(updated?.rotaryCenterXmm, 191.2);
  assert.equal(updated?.chuckOrRoller, "chuck");

  const afterDelete = deleteRotaryPreset(created!.id, storage);
  assert.equal(afterDelete.some((preset) => preset.id === created!.id), false);
});

test("invalid stored preset payload falls back to defaults", () => {
  const storage = createMemoryStorage({
    "lt316.admin.calibration.rotaryPresets": "not-valid-json",
  });
  const presets = getRotaryPresets(storage);
  assert.equal(presets.length, DEFAULT_ROTARY_PLACEMENT_PRESETS.length);
});

test("explicitly saved empty preset list is respected for empty-state UI", () => {
  const storage = createMemoryStorage({
    "lt316.admin.calibration.rotaryPresets": "[]",
  });
  const presets = getRotaryPresets(storage);
  assert.equal(presets.length, 0);
});
