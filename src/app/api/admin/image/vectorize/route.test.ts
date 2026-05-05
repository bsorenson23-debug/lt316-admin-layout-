import assert from "node:assert/strict";
import test from "node:test";
import type { NextRequest } from "next/server";
import sharp from "sharp";

import { POST } from "./route.ts";

const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK9cAAAAASUVORK5CYII=";

async function createValidPngFile(options?: {
  name?: string;
  type?: string;
}): Promise<File> {
  const validPng = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return new File([new Uint8Array(validPng)], options?.name ?? "pixel.png", {
    type: options?.type ?? "image/png",
  });
}

function createDecodeFailingPngFile(): File {
  const corruptBuffer = Buffer.from(VALID_PNG_BASE64, "base64");
  // Flipping this byte preserves metadata parsing while making the pixel decode fail.
  corruptBuffer[34] = corruptBuffer[34] ^ 0xff;
  return new File([corruptBuffer], "corrupt.png", {
    type: "image/png",
  });
}

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
  const corruptPng = createDecodeFailingPngFile();

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

test("vectorize route accepts valid image bytes with generic mime type", async () => {
  const genericMimePng = await createValidPngFile({
    name: "generic-mime-upload.bin",
    type: "application/octet-stream",
  });

  const formData = new FormData();
  formData.set("image", genericMimePng);

  const request = {
    formData: async () => formData,
  };

  const response = await POST(request as unknown as NextRequest);
  const payload = (await response.json()) as {
    svg?: string;
    mode?: string;
    pathCount?: number;
    width?: number;
    height?: number;
    error?: string;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.error, undefined);
  assert.equal(payload.mode, "trace");
  assert.equal(typeof payload.svg, "string");
  assert.equal(typeof payload.pathCount, "number");
  assert.equal(typeof payload.width, "number");
  assert.equal(typeof payload.height, "number");
});
