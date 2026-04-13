import assert from "node:assert/strict";
import test from "node:test";
import type { ProductReferenceImage } from "../types/productTemplate.ts";
import {
  isOrthographicBodyReferenceImage,
  isTraceableFrontBodyReferenceImage,
  resolvePreferredFrontBodyReferenceImage,
  resolveBodyReferenceViewSource,
} from "./bodyReferenceViewSource.ts";

const frontImage: ProductReferenceImage = {
  id: "front",
  url: "https://example.com/front.png",
  source: "official",
  hash: "img:front",
  width: 1200,
  height: 1600,
  handleVisible: false,
  handleSide: "hidden",
  logoDetected: false,
  viewClass: "front",
  approxAzimuthDeg: 0,
  confidence: 0.92,
};

test("orthographic body-reference images only accept straight-on front views", () => {
  assert.equal(isOrthographicBodyReferenceImage(frontImage), true);
  assert.equal(
    isOrthographicBodyReferenceImage({
      ...frontImage,
      id: "front-3q",
      viewClass: "front-3q",
      approxAzimuthDeg: 45,
    }),
    false,
  );
  assert.equal(
    isOrthographicBodyReferenceImage({
      ...frontImage,
      id: "back",
      viewClass: "back",
      approxAzimuthDeg: 180,
    }),
    false,
  );
});

test("traceable front body-reference images accept front and front-3q only", () => {
  assert.equal(isTraceableFrontBodyReferenceImage(frontImage), true);
  assert.equal(
    isTraceableFrontBodyReferenceImage({
      ...frontImage,
      id: "front-3q",
      viewClass: "front-3q",
      approxAzimuthDeg: 45,
    }),
    true,
  );
  assert.equal(
    isTraceableFrontBodyReferenceImage({
      ...frontImage,
      id: "back",
      viewClass: "back",
      approxAzimuthDeg: 180,
    }),
    false,
  );
});

test("preferred front body-reference image favors a strict front over canonical front-3q", () => {
  const resolved = resolvePreferredFrontBodyReferenceImage({
    productReferenceSet: {
      productKey: "stanley",
      images: [
        {
          ...frontImage,
          id: "front-3q-canonical",
          url: "https://example.com/front-3q-canonical.png",
          viewClass: "front-3q",
          approxAzimuthDeg: 45,
          confidence: 0.95,
          handleVisible: true,
          handleSide: "right",
        },
        {
          ...frontImage,
          id: "front-strict",
          url: "https://example.com/front-strict.png",
          confidence: 0.84,
        },
      ],
      canonicalFrontImageId: "front-3q-canonical",
      canonicalBackImageId: undefined,
      canonicalHandleSideImageId: undefined,
      orientationConfidence: 0.9,
      canonicalViewSelection: {
        canonicalFrontImageId: "front-3q-canonical",
        canonicalBackStatus: "unknown",
        frontConfidence: 0.95,
        backConfidence: 0,
      },
    },
    traceDebugSourceUrl: "https://example.com/front-3q-canonical.png?cache=1",
  });

  assert.equal(resolved?.id, "front-strict");
});

test("preferred front body-reference image falls back to trace-matched front-3q when no strict front exists", () => {
  const resolved = resolvePreferredFrontBodyReferenceImage({
    productReferenceSet: {
      productKey: "stanley",
      images: [
        {
          ...frontImage,
          id: "front-3q-traced",
          url: "https://example.com/front-3q-traced.png",
          viewClass: "front-3q",
          approxAzimuthDeg: 45,
          confidence: 0.9,
          handleVisible: true,
          handleSide: "right",
        },
      ],
      canonicalFrontImageId: "front-3q-traced",
      canonicalBackImageId: undefined,
      canonicalHandleSideImageId: undefined,
      orientationConfidence: 0.9,
      canonicalViewSelection: {
        canonicalFrontImageId: "front-3q-traced",
        canonicalBackStatus: "unknown",
        frontConfidence: 0.9,
        backConfidence: 0,
      },
    },
    traceDebugSourceUrl: "https://example.com/front-3q-traced.png?cache=1",
  });

  assert.equal(resolved?.id, "front-3q-traced");
});

test("requested back view uses one real back source only", () => {
  const resolved = resolveBodyReferenceViewSource({
    requestedViewSide: "back",
    canAutoSyncFrontPhotoToBodyReference: true,
    bodyReferencePhotoDataUrl: "",
    frontCleanUrl: "front-clean",
    frontPhotoDataUrl: "front-photo",
    productPhotoFullUrl: "front-hero",
    backCleanUrl: "back-clean",
    backPhotoDataUrl: "",
    resolvedCanonicalBackReferencePhotoDataUrl: "back-canonical",
    hasStrictCanonicalBack: true,
    hasAuxiliaryBack3q: false,
    mirrorForBack: false,
    backConfidence: 0.83,
  });

  assert.equal(resolved.activeBodyReferenceViewSide, "back");
  assert.equal(resolved.activeDisplayReferencePhotoDataUrl, "back-clean");
  assert.equal(resolved.activeReferencePhotoDataUrl, "back-clean");
  assert.equal(resolved.frontDisplayReferencePhotoDataUrl, "front-clean");
});

test("only back-3q advisory images cannot enable back tracing", () => {
  const resolved = resolveBodyReferenceViewSource({
    requestedViewSide: "back",
    canAutoSyncFrontPhotoToBodyReference: true,
    bodyReferencePhotoDataUrl: "",
    frontCleanUrl: "front-clean",
    frontPhotoDataUrl: "",
    productPhotoFullUrl: "",
    backCleanUrl: "",
    backPhotoDataUrl: "",
    resolvedCanonicalBackReferencePhotoDataUrl: "",
    hasStrictCanonicalBack: false,
    hasAuxiliaryBack3q: true,
    mirrorForBack: false,
    backConfidence: 0.72,
  });

  assert.equal(resolved.hasRealBackTraceSource, false);
  assert.equal(resolved.activeBodyReferenceViewSide, "front");
  assert.match(resolved.bodyReferenceBackUnavailableReason ?? "", /back-3q advisory image/i);
  assert.equal(resolved.activeDisplayReferencePhotoDataUrl, "front-clean");
});

test("mirror mode does not count as a real back trace source", () => {
  const resolved = resolveBodyReferenceViewSource({
    requestedViewSide: "back",
    canAutoSyncFrontPhotoToBodyReference: true,
    bodyReferencePhotoDataUrl: "",
    frontCleanUrl: "front-clean",
    frontPhotoDataUrl: "",
    productPhotoFullUrl: "",
    backCleanUrl: "mirrored-back",
    backPhotoDataUrl: "",
    resolvedCanonicalBackReferencePhotoDataUrl: "",
    hasStrictCanonicalBack: false,
    hasAuxiliaryBack3q: false,
    mirrorForBack: true,
    backConfidence: null,
  });

  assert.equal(resolved.hasRealBackTraceSource, false);
  assert.equal(resolved.activeBodyReferenceViewSide, "front");
  assert.match(resolved.bodyReferenceBackUnavailableReason ?? "", /mirror mode/i);
  assert.equal(resolved.backDisplayReferencePhotoDataUrl, "");
});

test("front tracing keeps lookup hero visible without making it authoritative when sync is blocked", () => {
  const resolved = resolveBodyReferenceViewSource({
    requestedViewSide: "front",
    canAutoSyncFrontPhotoToBodyReference: false,
    bodyReferencePhotoDataUrl: "",
    frontCleanUrl: "",
    frontPhotoDataUrl: "",
    productPhotoFullUrl: "front-hero",
    backCleanUrl: "",
    backPhotoDataUrl: "",
    resolvedCanonicalBackReferencePhotoDataUrl: "",
    hasStrictCanonicalBack: false,
    hasAuxiliaryBack3q: false,
    mirrorForBack: false,
    backConfidence: null,
  });

  assert.equal(resolved.frontDisplayReferencePhotoDataUrl, "front-hero");
  assert.equal(resolved.frontReferencePhotoDataUrl, "");
  assert.equal(resolved.activeDisplayReferencePhotoDataUrl, "front-hero");
  assert.equal(resolved.activeReferencePhotoDataUrl, "");
});
