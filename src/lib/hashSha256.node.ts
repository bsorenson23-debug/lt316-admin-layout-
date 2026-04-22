import { createHash } from "node:crypto";

import { stableStringifyForHash } from "./hashSha256.ts";

function toNodeBuffer(value: ArrayBuffer | ArrayBufferView): Buffer {
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from(value);
}

export function hashTextSha256Node(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function hashArrayBufferSha256Node(buffer: ArrayBuffer | ArrayBufferView): string {
  return createHash("sha256").update(toNodeBuffer(buffer)).digest("hex");
}

export function hashBufferSha256Node(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function hashJsonSha256Node(value: unknown): string {
  return hashTextSha256Node(stableStringifyForHash(value));
}
