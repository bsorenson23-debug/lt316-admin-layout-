import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDefaultLightBurnPathValidationResult,
  hasAnyLightBurnPath,
  loadLightBurnPathSettings,
  resetLightBurnPathSettings,
  saveLightBurnPathSettings,
} from "./lightBurnPathSettings.ts";

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

test("settings persist after save and reload", () => {
  const storage = createMemoryStorage();

  saveLightBurnPathSettings(
    {
      templateProjectPath: "C:\\LightBurn\\Templates\\default.lbrn2",
      outputFolderPath: "C:\\LightBurn\\LT316\\jobs",
      deviceBundlePath: "C:\\LightBurn\\Devices\\machine.lbzip",
    },
    storage
  );

  const loaded = loadLightBurnPathSettings(storage);
  assert.equal(loaded.templateProjectPath, "C:\\LightBurn\\Templates\\default.lbrn2");
  assert.equal(loaded.outputFolderPath, "C:\\LightBurn\\LT316\\jobs");
  assert.equal(loaded.deviceBundlePath, "C:\\LightBurn\\Devices\\machine.lbzip");
});

test("save trims whitespace and reset clears persisted settings", () => {
  const storage = createMemoryStorage();

  const saved = saveLightBurnPathSettings(
    {
      templateProjectPath: "  C:\\A\\template.lbrn  ",
      outputFolderPath: "  ",
      deviceBundlePath: " C:\\A\\device.lbzip ",
    },
    storage
  );

  assert.equal(saved.templateProjectPath, "C:\\A\\template.lbrn");
  assert.equal(saved.outputFolderPath, undefined);
  assert.equal(saved.deviceBundlePath, "C:\\A\\device.lbzip");

  const reset = resetLightBurnPathSettings(storage);
  assert.deepEqual(reset, {});
  assert.deepEqual(loadLightBurnPathSettings(storage), {});
});

test("default validation result starts in missing state", () => {
  const defaults = buildDefaultLightBurnPathValidationResult();
  assert.equal(defaults.templateProjectPath.status, "missing");
  assert.equal(defaults.outputFolderPath.status, "missing");
  assert.equal(defaults.deviceBundlePath.status, "missing");
});

test("hasAnyLightBurnPath detects any configured path", () => {
  assert.equal(hasAnyLightBurnPath({}), false);
  assert.equal(
    hasAnyLightBurnPath({ templateProjectPath: "C:\\LightBurn\\template.lbrn2" }),
    true
  );
});

