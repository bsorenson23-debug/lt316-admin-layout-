import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  hashArrayBufferSha256,
  hashFileSha256,
  hashJsonSha256,
  hashTextSha256,
  stableStringifyForHash,
} from "./hashSha256.ts";
import {
  hashArrayBufferSha256Node,
  hashJsonSha256Node,
  hashTextSha256Node,
} from "./hashSha256.node.ts";

test("hashTextSha256 matches node crypto SHA-256 output", async () => {
  const text = "approved contour body-only";
  const expected = createHash("sha256").update(text).digest("hex");

  assert.equal(await hashTextSha256(text), expected);
  assert.equal(hashTextSha256Node(text), expected);
});

test("hashArrayBufferSha256 stays deterministic across browser and node helpers", async () => {
  const bytes = new TextEncoder().encode("body_mesh");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  assert.equal(await hashArrayBufferSha256(buffer), hashArrayBufferSha256Node(buffer));
});

test("hashFileSha256 hashes exact file bytes", async () => {
  const file = new File(
    [new TextEncoder().encode("<svg viewBox=\"0 0 10 20\"></svg>")],
    "body.svg",
    { type: "image/svg+xml" },
  );
  const expected = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");

  assert.equal(await hashFileSha256(file), expected);
});

test("stableStringifyForHash sorts object keys deterministically", () => {
  assert.equal(
    stableStringifyForHash({ b: 2, a: { d: 4, c: 3 } }),
    "{\"a\":{\"c\":3,\"d\":4},\"b\":2}",
  );
});

test("hashJsonSha256 is stable regardless of object key order", async () => {
  const left = { b: 2, a: { d: 4, c: 3 } };
  const right = { a: { c: 3, d: 4 }, b: 2 };

  const leftHash = await hashJsonSha256(left);
  const rightHash = await hashJsonSha256(right);

  assert.equal(leftHash, rightHash);
  assert.equal(leftHash, hashJsonSha256Node(left));
  assert.equal(rightHash, hashJsonSha256Node(right));
});
