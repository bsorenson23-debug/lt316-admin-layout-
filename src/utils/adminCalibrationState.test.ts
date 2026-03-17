import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ROTARY_PLACEMENT_PRESETS } from "../data/rotaryPlacementPresets.ts";
import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import { getBedCenterXmm } from "./rotaryCenter.ts";
import {
  deleteRotaryPreset,
  getCalibrationToolsVisible,
  getRotaryPresets,
  isSeededRotaryPresetId,
  resetRotaryPresetToDefault,
  saveRotaryPreset,
  saveRotaryPresetAsCustom,
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

test("default preset seeds include D80C, D100C, and RotoBoss Talon", () => {
  const ids = DEFAULT_ROTARY_PLACEMENT_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, ["d80c-chuck", "d100c-chuck", "rotoboss-talon"]);
});

test("D80C and D100C mount + axis metadata is seeded", () => {
  const d80c = DEFAULT_ROTARY_PLACEMENT_PRESETS.find(
    (preset) => preset.id === "d80c-chuck"
  );
  const d100c = DEFAULT_ROTARY_PLACEMENT_PRESETS.find(
    (preset) => preset.id === "d100c-chuck"
  );

  assert.ok(d80c);
  assert.equal(d80c?.mountPatternXmm, 75);
  assert.equal(d80c?.mountPatternYmm, 100);
  assert.equal(d80c?.axisHeightMm, 129);

  assert.ok(d100c);
  assert.equal(d100c?.mountPatternXmm, 75);
  assert.equal(d100c?.mountPatternYmm, 100);
  assert.equal(d100c?.axisHeightMm, 129);
});

test("Talon preset keeps unverified mount pattern and axis height unset", () => {
  const talon = DEFAULT_ROTARY_PLACEMENT_PRESETS.find(
    (preset) => preset.id === "rotoboss-talon"
  );
  assert.ok(talon);
  assert.equal(talon?.mountPatternXmm, undefined);
  assert.equal(talon?.mountPatternYmm, undefined);
  assert.equal(talon?.axisHeightMm, undefined);
});

test("all default presets use bed-center axis center", () => {
  const bedCenterXmm = getBedCenterXmm(DEFAULT_BED_CONFIG.flatWidth);
  for (const preset of DEFAULT_ROTARY_PLACEMENT_PRESETS) {
    assert.equal(preset.rotaryCenterXmm, bedCenterXmm);
    assert.equal(preset.axisCenterXmm, bedCenterXmm);
  }
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

test("editing a seeded preset persists updated rotary values", () => {
  const storage = createMemoryStorage();
  const updated = updateRotaryPreset(
    "d80c-chuck",
    {
      rotaryCenterXmm: 161.5,
      mountPatternXmm: 77,
      notes: "Measured centerline and mount spacing",
    },
    storage
  );

  const d80c = updated.find((preset) => preset.id === "d80c-chuck");
  assert.ok(d80c);
  assert.equal(d80c?.rotaryCenterXmm, 161.5);
  assert.equal(d80c?.mountPatternXmm, 77);
  assert.equal(d80c?.notes, "Measured centerline and mount spacing");

  const reloaded = getRotaryPresets(storage).find(
    (preset) => preset.id === "d80c-chuck"
  );
  assert.ok(reloaded);
  assert.equal(reloaded?.rotaryCenterXmm, 161.5);
});

test("save as custom preserves seeded preset and creates editable custom copy", () => {
  const storage = createMemoryStorage();
  const seedBefore = getRotaryPresets(storage).find((preset) => preset.id === "d80c-chuck");
  assert.ok(seedBefore);

  const next = saveRotaryPresetAsCustom(
    {
      name: "D80C Custom",
      family: "d80c",
      bedOrigin: "top-left",
      rotaryCenterXmm: 172.4,
      rotaryTopYmm: 31.6,
      chuckOrRoller: "chuck",
      notes: "Custom copy for machine A",
    },
    storage
  );

  const custom = next.find((preset) => preset.name === "D80C Custom");
  const seedAfter = next.find((preset) => preset.id === "d80c-chuck");
  assert.ok(custom);
  assert.equal(custom?.family, "custom");
  assert.equal(custom?.rotaryCenterXmm, 172.4);
  assert.ok(seedAfter);
  assert.equal(seedAfter?.rotaryCenterXmm, seedBefore?.rotaryCenterXmm);
});

test("reset seeded preset restores default seeded values", () => {
  const storage = createMemoryStorage();
  updateRotaryPreset(
    "d100c-chuck",
    {
      rotaryCenterXmm: 166.2,
      rotaryTopYmm: 28.7,
      notes: "Modified in calibration",
    },
    storage
  );

  const reset = resetRotaryPresetToDefault("d100c-chuck", storage);
  const d100c = reset.find((preset) => preset.id === "d100c-chuck");
  assert.ok(d100c);
  assert.equal(d100c?.rotaryCenterXmm, getBedCenterXmm(DEFAULT_BED_CONFIG.flatWidth));
  assert.equal(d100c?.rotaryTopYmm, undefined);
  assert.match(d100c?.notes ?? "", /Top anchor should be calibrated on machine/i);
});

test("seeded id detection returns true only for bundled preset ids", () => {
  assert.equal(isSeededRotaryPresetId("d80c-chuck"), true);
  assert.equal(isSeededRotaryPresetId("d100c-chuck"), true);
  assert.equal(isSeededRotaryPresetId("rotoboss-talon"), true);
  assert.equal(isSeededRotaryPresetId("custom-preset-1"), false);
});

test("invalid stored preset payload falls back to defaults", () => {
  const storage = createMemoryStorage({
    "lt316.admin.calibration.rotaryPresets": "not-valid-json",
  });
  const presets = getRotaryPresets(storage);
  assert.equal(presets.length, DEFAULT_ROTARY_PLACEMENT_PRESETS.length);
});

test("preset payload with incomplete optional fields still loads", () => {
  const storage = createMemoryStorage({
    "lt316.admin.calibration.rotaryPresets": JSON.stringify([
      {
        id: "rotoboss-talon",
        name: "RotoBoss Talon / Talon Pro",
        bedOrigin: "top-left",
        rotaryCenterXmm: 150,
        chuckOrRoller: "chuck",
      },
    ]),
  });

  const presets = getRotaryPresets(storage);
  assert.equal(presets.length, 1);
  assert.equal(presets[0].id, "rotoboss-talon");
  assert.equal(presets[0].rotaryTopYmm, undefined);
  assert.equal(presets[0].mountPatternXmm, undefined);
  assert.equal(presets[0].axisHeightMm, undefined);
});

test("explicitly saved empty preset list is respected for empty-state UI", () => {
  const storage = createMemoryStorage({
    "lt316.admin.calibration.rotaryPresets": "[]",
  });
  const presets = getRotaryPresets(storage);
  assert.equal(presets.length, 0);
});
