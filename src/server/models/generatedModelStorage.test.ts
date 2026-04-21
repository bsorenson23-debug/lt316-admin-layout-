import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_MODELS_DIR,
  LEGACY_GENERATED_MODELS_DIR,
  generatedModelExists,
  generatedModelAuditExists,
  readGeneratedModel,
  readGeneratedModelAudit,
  statGeneratedModel,
  statGeneratedModelAudit,
} from "./generatedModelStorage.ts";
import { buildBodyGeometryAuditAbsolutePath } from "./bodyGeometryAuditArtifact.ts";

async function removeIfExists(targetPath: string): Promise<void> {
  await rm(targetPath, { force: true });
}

test("generated model storage falls back to legacy public assets when .local is missing", async () => {
  const fileName = `legacy-generated-model-${Date.now()}.glb`;
  const localPath = path.join(GENERATED_MODELS_DIR, fileName);
  const legacyPath = path.join(LEGACY_GENERATED_MODELS_DIR, fileName);
  const fixture = Buffer.from("legacy-generated-model-fixture");

  await mkdir(LEGACY_GENERATED_MODELS_DIR, { recursive: true });
  await removeIfExists(localPath);
  await removeIfExists(legacyPath);

  try {
    await writeFile(legacyPath, fixture);

    assert.equal(await generatedModelExists(fileName), true);
    assert.deepEqual(await readGeneratedModel(fileName), fixture);

    const expectedStat = await stat(legacyPath);
    const actualStat = await statGeneratedModel(fileName);
    assert.equal(actualStat.size, expectedStat.size);
  } finally {
    await removeIfExists(localPath);
    await removeIfExists(legacyPath);
  }
});

test("generated model storage prefers .local assets over legacy public copies", async () => {
  const fileName = `generated-model-priority-${Date.now()}.glb`;
  const localPath = path.join(GENERATED_MODELS_DIR, fileName);
  const legacyPath = path.join(LEGACY_GENERATED_MODELS_DIR, fileName);
  const localFixture = Buffer.from("local-generated-model");
  const legacyFixture = Buffer.from("legacy-generated-model");

  await mkdir(GENERATED_MODELS_DIR, { recursive: true });
  await mkdir(LEGACY_GENERATED_MODELS_DIR, { recursive: true });
  await removeIfExists(localPath);
  await removeIfExists(legacyPath);

  try {
    await writeFile(localPath, localFixture);
    await writeFile(legacyPath, legacyFixture);

    assert.deepEqual(await readGeneratedModel(fileName), localFixture);
    assert.equal((await readFile(localPath)).toString("utf8"), "local-generated-model");
  } finally {
    await removeIfExists(localPath);
    await removeIfExists(legacyPath);
  }
});

test("generated model storage resolves companion audit sidecars for local and legacy generated models", async () => {
  const fileName = `generated-model-audit-${Date.now()}.glb`;
  const localPath = path.join(GENERATED_MODELS_DIR, fileName);
  const legacyPath = path.join(LEGACY_GENERATED_MODELS_DIR, fileName);
  const localAuditPath = buildBodyGeometryAuditAbsolutePath(localPath);
  const legacyAuditPath = buildBodyGeometryAuditAbsolutePath(legacyPath);
  const localFixture = Buffer.from("local-generated-model-audit-target");
  const localAuditFixture = '{"mode":"body-cutout-qa"}';
  const legacyFixture = Buffer.from("legacy-generated-model-audit-target");
  const legacyAuditFixture = '{"mode":"hybrid-preview"}';

  await mkdir(GENERATED_MODELS_DIR, { recursive: true });
  await mkdir(LEGACY_GENERATED_MODELS_DIR, { recursive: true });
  await removeIfExists(localPath);
  await removeIfExists(legacyPath);
  await removeIfExists(localAuditPath);
  await removeIfExists(legacyAuditPath);

  try {
    await writeFile(localPath, localFixture);
    await writeFile(localAuditPath, localAuditFixture, "utf8");
    await writeFile(legacyPath, legacyFixture);
    await writeFile(legacyAuditPath, legacyAuditFixture, "utf8");

    assert.equal(await generatedModelAuditExists(fileName), true);
    assert.equal(await readGeneratedModelAudit(fileName), localAuditFixture);
    assert.equal((await statGeneratedModelAudit(fileName)).size, Buffer.byteLength(localAuditFixture));

    await removeIfExists(localPath);
    await removeIfExists(localAuditPath);

    assert.equal(await generatedModelAuditExists(fileName), true);
    assert.equal(await readGeneratedModelAudit(fileName), legacyAuditFixture);
    assert.equal((await statGeneratedModelAudit(fileName)).size, Buffer.byteLength(legacyAuditFixture));
  } finally {
    await removeIfExists(localPath);
    await removeIfExists(legacyPath);
    await removeIfExists(localAuditPath);
    await removeIfExists(legacyAuditPath);
  }
});
