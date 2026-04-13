import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplatePipelineProvenance,
  buildTemplateReloadVerificationStage,
  createTemplatePipelineDiagnostics,
  mergeTemplatePipelineDiagnostics,
  setTemplatePipelineBlockingIssues,
  setTemplatePipelineWarnings,
  updateTemplatePipelineInputFingerprints,
  upsertTemplatePipelineStage,
} from "./templatePipelineDiagnostics.ts";

test("synthetic Stanley replay keeps diagnostics, blockers, and provenance aligned", () => {
  let diagnostics = createTemplatePipelineDiagnostics({
    runId: "tpl-stanley-replay",
    startedAt: "2026-04-10T12:00:00.000Z",
    contractVersions: {
      vectorize: "2026-04-10-v1",
      smartLookupCache: "smart-cache-v1",
      bodyReference: 1,
    },
  });

  diagnostics = updateTemplatePipelineInputFingerprints(diagnostics, {
    sourceImage: "img:stanley-front",
    workingImage: "img:stanley-cutout",
    svg: "svg:stanley-body",
    smartLookupInput: "txt:stanley quencher 40",
    smartLookupResult: "lookup:matched-profile",
    bodyReference: "bodyref:stanley-v1",
    templateGeometry: "geometry:stanley-v1",
  });

  diagnostics = upsertTemplatePipelineStage(diagnostics, {
    id: "source-image",
    status: "ready",
    authority: "template-reference-photo",
    warnings: [],
    errors: [],
    artifacts: {
      hasReferencePhoto: true,
    },
  });
  diagnostics = upsertTemplatePipelineStage(diagnostics, {
    id: "vectorize",
    status: "warning",
    authority: "server-vectorize",
    engine: "potrace",
    fallback: {
      used: true,
      from: "asset-pipeline",
      reason: "asset pipeline unavailable",
    },
    warnings: ["Asset pipeline fallback used: asset pipeline unavailable"],
    errors: [],
    artifacts: {
      branchPreviewsAvailable: true,
      outputFingerprint: "svg:stanley-body",
    },
  });
  diagnostics = upsertTemplatePipelineStage(diagnostics, {
    id: "smart-lookup",
    status: "ready",
    authority: "matched-profile",
    engine: "smart-template-lookup",
    cache: {
      hit: true,
      key: "smart:stanley",
      scope: "result-cache",
    },
    warnings: [],
    errors: [],
    artifacts: {
      branchChosen: "tumbler",
      matchedProfileId: "stanley-quencher-40",
      glbSource: "verified-product-model",
      dimensionsSource: "matched-profile",
    },
  });
  diagnostics = upsertTemplatePipelineStage(diagnostics, {
    id: "body-reference",
    status: "action",
    authority: "outline-profile",
    engine: "validated-midband-ratio",
    fallback: {
      used: false,
      from: "deriveBodyReferencePipeline",
      reason: null,
    },
    warnings: ["Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry."],
    errors: [],
    artifacts: {
      acceptedRowCount: 131,
      rejectedRowCount: 2,
      printableTopMm: 28,
      printableBottomMm: 244,
    },
  });
  diagnostics = setTemplatePipelineWarnings(diagnostics, [
    "Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry.",
  ]);
  diagnostics = setTemplatePipelineBlockingIssues(diagnostics, [
    "Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry.",
  ]);
  diagnostics = upsertTemplatePipelineStage(diagnostics, {
    id: "template-save",
    status: "ready",
    authority: "template-create-form",
    warnings: [],
    errors: [],
    artifacts: {
      productType: "tumbler",
      hasCanonicalBodyContract: true,
    },
  });

  const provenance = buildTemplatePipelineProvenance(diagnostics, {
    bodyReferenceViewSide: "front",
    bodyReferenceSourceTrust: "advisory-angled",
    bodyReferenceOutlineSeedMode: "fresh-image-trace",
    bodyReferenceSourceOrigin: "lookup",
    bodyReferenceSourceViewClass: "front-3q",
  });

  assert.equal(diagnostics.stages.find((stage) => stage.id === "vectorize")?.engine, "potrace");
  assert.equal(diagnostics.stages.find((stage) => stage.id === "vectorize")?.fallback?.used, true);
  assert.equal(diagnostics.stages.find((stage) => stage.id === "smart-lookup")?.cache?.hit, true);
  assert.equal(diagnostics.stages.find((stage) => stage.id === "body-reference")?.authority, "outline-profile");
  assert.deepEqual(diagnostics.blockingIssues, diagnostics.warnings);
  assert.equal(provenance.stageAuthorities["smart-lookup"], "matched-profile");
  assert.equal(provenance.fallbackFlags["vectorize"], true);
  assert.equal(provenance.bodyReferenceSignature, "bodyref:stanley-v1");
  assert.equal(provenance.templateGeometrySignature, "geometry:stanley-v1");
  assert.equal(provenance.bodyReferenceSourceTrust, "advisory-angled");
  assert.equal(provenance.bodyReferenceOutlineSeedMode, "fresh-image-trace");
});

test("reload verification flags drift in authorities, fallback mode, and signatures", () => {
  let savedDiagnostics = createTemplatePipelineDiagnostics({
    runId: "tpl-saved",
    startedAt: "2026-04-10T12:00:00.000Z",
    contractVersions: {
      bodyReference: 1,
      vectorize: "2026-04-10-v1",
    },
  });
  savedDiagnostics = updateTemplatePipelineInputFingerprints(savedDiagnostics, {
    bodyReference: "bodyref:saved",
    templateGeometry: "geometry:saved",
  });
  savedDiagnostics = upsertTemplatePipelineStage(savedDiagnostics, {
    id: "body-reference",
    status: "ready",
    authority: "outline-profile",
    engine: "validated-midband-ratio",
    fallback: {
      used: false,
      from: "deriveBodyReferencePipeline",
      reason: null,
    },
    warnings: [],
    errors: [],
    artifacts: {
      sourceTrust: "trusted-front",
    },
  });
  const provenance = buildTemplatePipelineProvenance(savedDiagnostics, {
    bodyReferenceViewSide: "front",
    bodyReferenceSourceTrust: "trusted-front",
    bodyReferenceOutlineSeedMode: "saved-outline",
    bodyReferenceSourceOrigin: "manual",
    bodyReferenceSourceViewClass: "front",
  });

  let currentDiagnostics = createTemplatePipelineDiagnostics({
    runId: "tpl-current",
    startedAt: "2026-04-10T12:05:00.000Z",
    contractVersions: {
      bodyReference: 2,
      vectorize: "2026-04-10-v1",
    },
  });
  currentDiagnostics = updateTemplatePipelineInputFingerprints(currentDiagnostics, {
    bodyReference: "bodyref:current",
    templateGeometry: "geometry:current",
  });
  currentDiagnostics = upsertTemplatePipelineStage(currentDiagnostics, {
    id: "body-reference",
    status: "warning",
    authority: "dimensional-seed",
    engine: "validated-midband-ratio",
    fallback: {
      used: true,
      from: "deriveBodyReferencePipeline",
      reason: "degraded-outline-fallback",
    },
    warnings: ["Fell back to outline seed after invariant failure."],
    errors: [],
    artifacts: {
      sourceTrust: "advisory-angled",
    },
  });

  const reloadStage = buildTemplateReloadVerificationStage({
    provenance,
    currentDiagnostics,
  });

  assert.equal(reloadStage.id, "template-reload");
  assert.equal(reloadStage.status, "warning");
  assert.ok(reloadStage.warnings.some((warning) => warning.includes("contract version")));
  assert.ok(reloadStage.warnings.some((warning) => warning.includes("signature drifted")));
  assert.ok(reloadStage.warnings.some((warning) => warning.includes("authority differs")));
  assert.ok(reloadStage.warnings.some((warning) => warning.includes("fallback mode differs")));
  assert.ok(reloadStage.warnings.some((warning) => warning.includes("trust state differs")));
});

test("mergeTemplatePipelineDiagnostics keeps per-stage records and dedupes warnings", () => {
  const base = upsertTemplatePipelineStage(
    createTemplatePipelineDiagnostics({
      runId: "tpl-base",
      startedAt: "2026-04-10T12:00:00.000Z",
    }),
    {
      id: "vectorize",
      status: "ready",
      authority: "server-vectorize",
      warnings: ["shared-warning"],
      errors: [],
    },
  );
  const incoming = upsertTemplatePipelineStage(
    createTemplatePipelineDiagnostics({
      runId: "tpl-base",
      startedAt: "2026-04-10T12:00:00.000Z",
    }),
    {
      id: "smart-lookup",
      status: "ready",
      authority: "matched-profile",
      warnings: ["shared-warning", "lookup-warning"],
      errors: [],
    },
  );

  const merged = mergeTemplatePipelineDiagnostics(base, incoming);

  assert.equal(merged.stages.length, 2);
  assert.deepEqual(merged.warnings, ["shared-warning", "lookup-warning"]);
});
