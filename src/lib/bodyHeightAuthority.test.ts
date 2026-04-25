import assert from "node:assert/strict";
import test from "node:test";

import { resolveBodyHeightAuthority } from "./bodyHeightAuthority.ts";

test("approved SVG bounds do not become physical body height unless explicitly marked physical-mm", () => {
  const result = resolveBodyHeightAuthority({
    approvedSvgBoundsHeightMm: 150,
  });

  assert.equal(result.status, "warn");
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.valueMm, undefined);
  assert.equal(result.inputHeights.approvedSvgBoundsHeightMm, 150);
  assert.ok(result.rejectedHeightSources.includes("approvedSvgBounds.height"));
});

test("approved SVG bounds can be selected only when explicitly marked physical-mm", () => {
  const result = resolveBodyHeightAuthority({
    approvedSvgBoundsHeightMm: 185,
    approvedSvgMarkedPhysicalMm: true,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.kind, "approved-svg-physical-mm");
  assert.equal(result.valueMm, 185);
  assert.equal(result.isPhysicalBodyHeight, true);
});

test("printable and engravable heights cannot be consumed as physical body height", () => {
  const result = resolveBodyHeightAuthority({
    printableHeightMm: 150,
    engravableHeightMm: 150,
  });

  assert.equal(result.status, "warn");
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.inputHeights.printableHeightMm, 150);
  assert.equal(result.inputHeights.engravableHeightMm, 150);
  assert.ok(result.rejectedHeightSources.includes("printableHeightMm"));
  assert.ok(result.rejectedHeightSources.includes("engravableHeightMm"));
});

test("reference band height cannot be consumed as physical body height", () => {
  const result = resolveBodyHeightAuthority({
    referenceBandHeightPx: 14,
  });

  assert.equal(result.status, "warn");
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.inputHeights.referenceBandHeightPx, 14);
  assert.ok(result.rejectedHeightSources.includes("referenceBandHeightPx"));
});

test("lookup physical body height beats full product height context", () => {
  const result = resolveBodyHeightAuthority({
    lookupFullProductHeightMm: 218.4,
    lookupBodyHeightMm: 185,
    lookupBodyHeightSource: "physical-body-height",
  });

  assert.equal(result.status, "pass");
  assert.equal(result.kind, "lookup-physical-body-height");
  assert.equal(result.valueMm, 185);
  assert.equal(result.inputHeights.lookupFullProductHeightMm, 218.4);
  assert.equal(result.isFullProductHeight, false);
});

test("manual body-height override beats lookup height", () => {
  const result = resolveBodyHeightAuthority({
    manualBodyHeightMm: 190,
    lookupBodyHeightMm: 185,
    lookupBodyHeightSource: "physical-body-height",
  });

  assert.equal(result.status, "pass");
  assert.equal(result.kind, "manual-override");
  assert.equal(result.valueMm, 190);
  assert.equal(result.sourceField, "manualBodyHeightMm");
});

test("missing body height with known diameter warns or fails without silently selecting 150", () => {
  const result = resolveBodyHeightAuthority({
    diameterAuthority: "lookup-diameter",
  });

  assert.equal(result.status, "warn");
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.valueMm, undefined);
  assert.equal(result.selectedScaleAuthority.diameterAuthority, "lookup-diameter");
});

test("lookup usable height is rejected unless backed by diameter-derived uniform scale", () => {
  const result = resolveBodyHeightAuthority({
    lookupFullProductHeightMm: 218.4,
    lookupBodyHeightMm: 150,
    lookupBodyHeightSource: "usable-height",
  });

  assert.equal(result.status, "warn");
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.valueMm, undefined);
  assert.equal(result.isPhysicalBodyHeight, false);
  assert.ok(result.rejectedHeightSources.includes("lookup.usableHeightMm"));
});

test("diameter-derived uniform scale drives body height from source contour units", () => {
  const result = resolveBodyHeightAuthority({
    diameterAuthorityKind: "diameter-primary",
    diameterAuthorityValueMm: 88.9,
    diameterAuthoritySourceField: "lookup.diameterMm",
    sourceDiameterUnits: 160,
    sourceContourHeightUnits: 330,
    mmPerSourceUnit: 88.9 / 160,
    uniformScaleApplied: true,
    derivedBodyHeightMm: 183.36,
    svgToPhotoTransformPresent: true,
    approvedSvgBoundsHeightMm: 150,
    v2ExpectedBodyHeightMm: 185,
    yScaleSource: "diameter-derived-mm-per-source-unit",
  });

  assert.equal(result.status, "pass");
  assert.equal(result.kind, "derived-from-diameter-scale");
  assert.equal(result.valueMm, 183.36);
  assert.equal(result.uniformScaleApplied, true);
  assert.equal(result.diameterAuthority.valueMm, 88.9);
  assert.equal(result.sourceDiameterUnits, 160);
  assert.equal(result.sourceContourHeightUnits, 330);
  assert.equal(result.mmPerSourceUnit, 0.5556);
  assert.ok(result.rejectedHeightSources.includes("approvedSvgBounds.height"));
  assert.ok(result.rejectedHeightSources.includes("printHeightMm"));
});

test("missing SVG-to-photo transform keeps uniform-scale height ambiguous", () => {
  const result = resolveBodyHeightAuthority({
    diameterAuthorityKind: "diameter-primary",
    diameterAuthorityValueMm: 89,
    sourceDiameterUnits: 89,
    sourceContourHeightUnits: 150,
    mmPerSourceUnit: 1,
    uniformScaleApplied: true,
    derivedBodyHeightMm: 150,
    svgToPhotoTransformPresent: false,
    svgPhysicalMmTrusted: false,
  });

  assert.equal(result.status, "warn");
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.valueMm, 150);
  assert.equal(result.isPhysicalBodyHeight, false);
  assert.match(result.warnings.join(" "), /transform is not proven/i);
});

test("canonical body height fallback records why old 150 mm was selected", () => {
  const result = resolveBodyHeightAuthority({
    canonicalBodyHeightMm: 150,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 175,
    approvedSvgBoundsHeightMm: 150,
  });

  assert.equal(result.status, "warn");
  assert.equal(result.kind, "canonical-body-height-warning");
  assert.equal(result.valueMm, 150);
  assert.equal(result.inputHeights.bodyTopFromOverallMm, 25);
  assert.equal(result.inputHeights.bodyBottomFromOverallMm, 175);
});
