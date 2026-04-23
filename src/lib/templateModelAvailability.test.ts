import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplateModelAvailabilitySeed,
  clearTemplateModelAvailabilityCache,
  getCachedTemplateModelAvailability,
  getTemplatesRequiringAvailabilityProbe,
  isKnownMissingTemplatePlaceholder,
  setCachedTemplateModelAvailability,
} from "./templateModelAvailability.ts";

test("known missing placeholder templates are seeded unavailable without probing", () => {
  clearTemplateModelAvailabilityCache();

  const templates = [
    {
      id: "tumbler-20oz-skinny",
      glbPath: "/models/templates/tumbler-20oz-skinny.glb",
      availabilityPolicy: "known-missing-placeholder" as const,
    },
    {
      id: "tumbler-40oz",
      glbPath: "/models/templates/yeti-40oz-body.glb",
      availabilityPolicy: "probe" as const,
    },
  ];

  assert.equal(isKnownMissingTemplatePlaceholder(templates[0]), true);
  assert.equal(isKnownMissingTemplatePlaceholder(templates[1]), false);
  assert.deepEqual(buildTemplateModelAvailabilitySeed(templates), {
    "tumbler-20oz-skinny": false,
  });
  assert.deepEqual(
    getTemplatesRequiringAvailabilityProbe(templates).map((template) => template.id),
    ["tumbler-40oz"],
  );
});

test("cached availability results are reused for later template mounts", () => {
  clearTemplateModelAvailabilityCache();

  setCachedTemplateModelAvailability("/models/templates/yeti-40oz-body.glb", true);
  setCachedTemplateModelAvailability("/models/templates/custom-missing.glb", false);

  const templates = [
    {
      id: "tumbler-40oz",
      glbPath: "/models/templates/yeti-40oz-body.glb",
      availabilityPolicy: "probe" as const,
    },
    {
      id: "custom-missing",
      glbPath: "/models/templates/custom-missing.glb",
      availabilityPolicy: "probe" as const,
    },
  ];

  assert.equal(getCachedTemplateModelAvailability("/models/templates/yeti-40oz-body.glb"), true);
  assert.equal(getCachedTemplateModelAvailability("/models/templates/custom-missing.glb"), false);
  assert.deepEqual(buildTemplateModelAvailabilitySeed(templates), {
    "tumbler-40oz": true,
    "custom-missing": false,
  });
  assert.deepEqual(getTemplatesRequiringAvailabilityProbe(templates), []);
});

test("uncached probe templates still request availability checks", () => {
  clearTemplateModelAvailabilityCache();

  const templates = [
    {
      id: "custom-probe",
      glbPath: "/models/templates/custom-probe.glb",
      availabilityPolicy: "probe" as const,
    },
  ];

  assert.deepEqual(buildTemplateModelAvailabilitySeed(templates), {});
  assert.deepEqual(
    getTemplatesRequiringAvailabilityProbe(templates).map((template) => template.glbPath),
    ["/models/templates/custom-probe.glb"],
  );
});
