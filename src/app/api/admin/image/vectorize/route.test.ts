import assert from "node:assert/strict";
import test from "node:test";
import type { NextRequest } from "next/server";

import { POST } from "./route.ts";

test("vectorize route returns 400 when image field is missing", async () => {
  const formData = new FormData();
  const request = {
    formData: async () => formData,
  };

  const response = await POST(request as unknown as NextRequest);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "No image provided");
});

test("vectorize route returns 400 when request body parsing fails", async () => {
  const request = {
    formData: async () => {
      throw new Error("malformed multipart body");
    },
  };

  const response = await POST(request as unknown as NextRequest);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid request body");
});

test("vectorize route returns 400 when image field is not a file", async () => {
  const formData = new FormData();
  formData.set("image", "not-a-file");

  const request = {
    formData: async () => formData,
  };

  const response = await POST(request as unknown as NextRequest);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid image file");
});

test("vectorize route returns 413 when image exceeds max upload size", async () => {
  const oversizedBytes = new Uint8Array(15 * 1024 * 1024 + 1);
  const oversizedImage = new File([oversizedBytes], "oversized.png", {
    type: "image/png",
  });

  const formData = new FormData();
  formData.set("image", oversizedImage);

  const request = {
    formData: async () => formData,
  };

  const response = await POST(request as unknown as NextRequest);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 413);
  assert.equal(payload.error, "Image too large (max 15 MB)");
});

test("vectorize route returns 400 for non-image mime uploads", async () => {
  const plainTextFile = new File(["hello from text file"], "note.txt", {
    type: "text/plain",
  });

  const formData = new FormData();
  formData.set("image", plainTextFile);

  const request = {
    formData: async () => formData,
  };

  const response = await POST(request as unknown as NextRequest);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid image file");
});

test("vectorize route returns 400 for corrupt image bytes", async () => {
  const corruptPng = new File(["not-a-real-png"], "corrupt.png", {
    type: "image/png",
  });

  const formData = new FormData();
  formData.set("image", corruptPng);

  const request = {
    formData: async () => formData,
  };

  const response = await POST(request as unknown as NextRequest);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid image file");
});
