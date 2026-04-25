import assert from "node:assert/strict";
import test from "node:test";

import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import { resolveBodyReferenceGuideFrame } from "./bodyReferenceGuideFrame.ts";
import { buildTumblerLookupDebugGuideModel } from "./tumblerLookupDebugGuides.ts";

function createDebug(overrides: Partial<TumblerItemLookupFitDebug> = {}): TumblerItemLookupFitDebug {
  return {
    kind: "lathe-body-fit",
    sourceImageUrl: "https://example.test/iceflow.png",
    imageWidthPx: 500,
    imageHeightPx: 700,
    silhouetteBoundsPx: { minX: 120, minY: 20, maxX: 380, maxY: 660 },
    centerXPx: 250,
    fullTopPx: 20,
    fullBottomPx: 660,
    bodyTopPx: 170,
    bodyBottomPx: 620,
    rimTopPx: 120,
    rimBottomPx: 168,
    referenceBandTopPx: 176,
    referenceBandBottomPx: 226,
    referenceBandCenterYPx: 201,
    referenceBandWidthPx: 180,
    maxCenterWidthPx: 260,
    referenceHalfWidthPx: 90,
    fitScore: 8.2,
    profilePoints: [],
    ...overrides,
  };
}

test("lookup debug guide model hides bottom guide without explicit base-band data", () => {
  const model = buildTumblerLookupDebugGuideModel(createDebug({
    measurementBandTopPx: 176,
    measurementBandBottomPx: 226,
    measurementBandCenterYPx: 201,
    measurementBandCenterXPx: 250,
    measurementBandLeftPx: 160,
    measurementBandRightPx: 340,
    measurementBandWidthPx: 181,
    engravingStartGuidePx: 174,
  }));

  assert.equal(model.showBottomBodyGuide, false);
  assert.equal(model.bottomBodyGuideYPx, null);
  assert.equal(model.engravingStartGuideYPx, 174);
  assert.match(model.caption, /not a silver-ring guide/i);
  assert.deepEqual(model.measurementBand, {
    topPx: 176,
    bottomPx: 226,
    centerYPx: 201,
    centerXPx: 250,
    leftPx: 160,
    rightPx: 340,
    widthPx: 181,
  });
});

test("lookup debug guide model uses engraving start guide instead of measurement center", () => {
  const model = buildTumblerLookupDebugGuideModel(createDebug({
    referenceBandCenterYPx: 201,
    measurementBandCenterYPx: 188,
    engravingStartGuidePx: 175,
  }));

  assert.equal(model.engravingStartGuideYPx, 175);
});

test("lookup debug guide model uses lid-to-silver seam for revolved profile top guide", () => {
  const model = buildTumblerLookupDebugGuideModel(createDebug({
    rimTopPx: 120,
    rimBottomPx: 168,
    bodyTraceTopPx: 182,
    engravingStartGuidePx: 175,
  }));

  assert.equal(model.revolvedProfileTopGuideYPx, 168);
  assert.notEqual(model.revolvedProfileTopGuideYPx, model.engravingStartGuideYPx);
});

test("lookup debug guide model shows bottom guide only when base-band data is present", () => {
  const model = buildTumblerLookupDebugGuideModel(createDebug({
    baseBandTopPx: 610,
    baseBandBottomPx: 628,
  }));

  assert.equal(model.showBottomBodyGuide, true);
  assert.equal(model.bottomBodyGuideYPx, 610);
  assert.match(model.caption, /bottom base ring/i);
});

test("lookup debug guide model uses the shared guide frame when provided", () => {
  const debug = createDebug({
    measurementBandTopPx: 176,
    measurementBandBottomPx: 226,
    measurementBandCenterYPx: 201,
    measurementBandCenterXPx: 250,
    measurementBandLeftPx: 160,
    measurementBandRightPx: 340,
    measurementBandWidthPx: 180,
    referenceBandTopPx: 190,
    referenceBandBottomPx: 218,
    referenceBandCenterYPx: 204,
    referenceBandWidthPx: 164,
  });
  const guideFrame = resolveBodyReferenceGuideFrame({ fitDebug: debug });

  const model = buildTumblerLookupDebugGuideModel(debug, guideFrame);

  assert.equal(model.guideSource, "fit-debug-reference-band");
  assert.equal(model.resolvedGuideFrameBounds?.topPx, 176);
  assert.equal(model.resolvedGuideFrameBounds?.bottomPx, 226);
  assert.equal(model.resolvedGuideFrameBounds?.widthPx, 180);
  assert.equal(model.measurementBand?.topPx, 176);
  assert.equal(model.measurementBand?.bottomPx, 226);
  assert.equal(model.measurementBand?.widthPx, 180);
  assert.equal(model.measurementBand?.centerXPx, 250);
});

test("accepted guide frame does not overwrite the visual diameter band", () => {
  const debug = createDebug({
    measurementBandTopPx: 176,
    measurementBandBottomPx: 226,
    measurementBandCenterYPx: 201,
    measurementBandCenterXPx: 250,
    measurementBandLeftPx: 160,
    measurementBandRightPx: 340,
    measurementBandWidthPx: 180,
  });
  const model = buildTumblerLookupDebugGuideModel(debug, {
    guideSource: "accepted-body-reference",
    coordinateSpace: "raw-image-px",
    rawImageBounds: {
      left: 150,
      top: 180,
      right: 350,
      bottom: 630,
      width: 200,
      height: 450,
      centerX: 250,
      centerY: 405,
    },
    rawImageSize: { width: 500, height: 700 },
    displayedImageBounds: null,
    mappedDomOverlayBounds: null,
    sourceHash: "accepted",
    freshRelativeToGeneratedSource: null,
    warnings: [],
    errors: [],
  });

  assert.equal(model.guideSource, "accepted-body-reference");
  assert.equal(model.resolvedGuideFrameBounds?.topPx, 180);
  assert.equal(model.resolvedGuideFrameBounds?.bottomPx, 630);
  assert.equal(model.measurementBand?.topPx, 176);
  assert.equal(model.measurementBand?.bottomPx, 226);
});
