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
