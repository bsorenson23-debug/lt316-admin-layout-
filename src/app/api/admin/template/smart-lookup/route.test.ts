import assert from "node:assert/strict";
import test from "node:test";

import type { NextRequest } from "next/server";
import { POST, createSmartLookupPostHandler } from "./route.ts";

function makeFormDataRequest(formData: FormData): NextRequest {
  return {
    formData: async () => formData,
  } as unknown as NextRequest;
}

test("returns 400 when image field is missing", async () => {
  const formData = new FormData();
  formData.set("profileDiameterMm", "90");

  const response = await POST(makeFormDataRequest(formData));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "No image provided" });
});

test("returns 400 when image field is not a File", async () => {
  const formData = new FormData();
  formData.set("image", "not-a-file");
  formData.set("profileDiameterMm", "90");

  const response = await POST(makeFormDataRequest(formData));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "Invalid image file" });
});

test("returns 400 when profileDiameterMm is invalid", async () => {
  const formData = new FormData();
  formData.set("image", new File([new Uint8Array([1, 2, 3])], "cup.png", { type: "image/png" }));
  formData.set("profileDiameterMm", "0");

  const response = await POST(makeFormDataRequest(formData));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "Invalid profileDiameterMm" });
});

test("returns 400 when image is too large", async () => {
  const oversizedImage = new File(
    [new Uint8Array(10 * 1024 * 1024 + 1)],
    "huge.png",
    { type: "image/png" },
  );
  const formData = new FormData();
  formData.set("image", oversizedImage);
  formData.set("profileDiameterMm", "90");

  const response = await POST(makeFormDataRequest(formData));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "Image too large" });
});

test("returns 500 when server helper throws", async () => {
  const handlePost = createSmartLookupPostHandler({
    runLookup: async () => {
      throw new Error("simulated helper failure");
    },
  });
  const formData = new FormData();
  formData.set("image", new File([new Uint8Array([1, 2, 3])], "cup.png", { type: "image/png" }));
  formData.set("profileDiameterMm", "90");

  const response = await handlePost(makeFormDataRequest(formData));
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, { error: "Smart template lookup failed" });
});

test("returns 200 with minimal response shape on valid request", async () => {
  const formData = new FormData();
  formData.set("image", new File([new Uint8Array([1, 2, 3])], "cup.png", { type: "image/png" }));
  formData.set("profileDiameterMm", "90");
  formData.set("lookupInput", "stanley quencher");

  const response = await POST(makeFormDataRequest(formData));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.category, "unknown");
  assert.equal(typeof payload.reviewRequired, "boolean");
  assert.equal(typeof payload.confidence, "number");
  assert.equal(Array.isArray(payload.nextPrompts), true);
  assert.equal(typeof payload.templateDraft, "object");
});
