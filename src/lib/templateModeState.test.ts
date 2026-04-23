import assert from "node:assert/strict";
import test from "node:test";

import type { ProductTemplate } from "../types/productTemplate.ts";

import {
  createInactiveTemplateModeState,
  enterCreateTemplateMode,
  enterEditTemplateMode,
  resolveTemplateModeCancelOutcome,
  resolveTemplateModeSaveOutcome,
  resolveTemplateModeWorkspaceArtworkPlacements,
} from "./templateModeState.ts";

function createTemplate(id: string, name: string): ProductTemplate {
  return {
    id,
    name,
    brand: "Test",
    capacity: "20 oz",
    laserType: "fiber",
    productType: "tumbler",
    thumbnailDataUrl: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' />",
    glbPath: "",
    dimensions: {
      diameterMm: 90,
      printHeightMm: 120,
      templateWidthMm: 280,
      handleArcDeg: 0,
      taperCorrection: "none",
    },
    laserSettings: {
      power: 30,
      speed: 1200,
      frequency: 30,
      lineInterval: 0.04,
      materialProfileId: "",
      rotaryPresetId: "",
    },
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z",
    builtIn: false,
  };
}

test("inactive template mode starts empty", () => {
  assert.deepEqual(createInactiveTemplateModeState(), {
    active: false,
    intent: null,
    editingTemplate: null,
    returnTarget: "workspace",
  });
});

test("create mode records a single canonical create intent", () => {
  const state = enterCreateTemplateMode("gallery");
  assert.equal(state.active, true);
  assert.equal(state.intent, "create");
  assert.equal(state.editingTemplate, null);
  assert.equal(state.returnTarget, "gallery");
});

test("edit mode records the template snapshot being edited", () => {
  const template = createTemplate("template-1", "Template One");
  const state = enterEditTemplateMode(template, "gallery");
  assert.equal(state.active, true);
  assert.equal(state.intent, "edit");
  assert.equal(state.editingTemplate?.id, "template-1");
  assert.equal(state.returnTarget, "gallery");
});

test("workspace artwork only bridges into edit mode for the active selected template", () => {
  const placements = [{ id: "art-1" }] as unknown as Array<{ id: string }>;
  const editingTemplate = createTemplate("template-1", "Template One");

  assert.deepEqual(
    resolveTemplateModeWorkspaceArtworkPlacements({
      mode: enterCreateTemplateMode("gallery"),
      selectedTemplateId: null,
      workspaceArtworkPlacements: placements as never,
    }),
    placements,
  );

  assert.equal(
    resolveTemplateModeWorkspaceArtworkPlacements({
      mode: enterEditTemplateMode(editingTemplate, "gallery"),
      selectedTemplateId: "template-2",
      workspaceArtworkPlacements: placements as never,
    }),
    null,
  );

  assert.deepEqual(
    resolveTemplateModeWorkspaceArtworkPlacements({
      mode: enterEditTemplateMode(editingTemplate, "gallery"),
      selectedTemplateId: "template-1",
      workspaceArtworkPlacements: placements as never,
    }),
    placements,
  );
});

test("cancel returns to the gallery only when the mode was entered from there", () => {
  const galleryOutcome = resolveTemplateModeCancelOutcome(enterCreateTemplateMode("gallery"));
  assert.equal(galleryOutcome.reopenGallery, true);
  assert.equal(galleryOutcome.nextState.active, false);

  const workspaceOutcome = resolveTemplateModeCancelOutcome(enterCreateTemplateMode("workspace"));
  assert.equal(workspaceOutcome.reopenGallery, false);
  assert.equal(workspaceOutcome.nextState.active, false);
});

test("save keeps create mode and active-template edits on the workspace, but returns non-active edits to the gallery", () => {
  const createOutcome = resolveTemplateModeSaveOutcome({
    mode: enterCreateTemplateMode("gallery"),
    savedTemplateId: "created-template",
    selectedTemplateId: null,
  });
  assert.equal(createOutcome.selectSavedTemplate, true);
  assert.equal(createOutcome.reopenGallery, false);

  const activeEditOutcome = resolveTemplateModeSaveOutcome({
    mode: enterEditTemplateMode(createTemplate("template-1", "Template One"), "gallery"),
    savedTemplateId: "template-1",
    selectedTemplateId: "template-1",
  });
  assert.equal(activeEditOutcome.selectSavedTemplate, true);
  assert.equal(activeEditOutcome.reopenGallery, false);

  const passiveEditOutcome = resolveTemplateModeSaveOutcome({
    mode: enterEditTemplateMode(createTemplate("template-2", "Template Two"), "gallery"),
    savedTemplateId: "template-2",
    selectedTemplateId: "template-1",
  });
  assert.equal(passiveEditOutcome.selectSavedTemplate, false);
  assert.equal(passiveEditOutcome.reopenGallery, true);
});
