function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable in the current runtime.");
  }
  return subtle;
}

export function stableStringifyForHash(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringifyForHash(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringifyForHash(record[key])}`)
    .join(",")}}`;
}

async function hashBytesSha256(bytes: Uint8Array): Promise<string> {
  const normalizedBytes = new Uint8Array(bytes.byteLength);
  normalizedBytes.set(bytes);
  const digest = await requireSubtleCrypto().digest(
    "SHA-256",
    normalizedBytes,
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function hashTextSha256(text: string): Promise<string> {
  return hashBytesSha256(new TextEncoder().encode(text));
}

export async function hashArrayBufferSha256(buffer: ArrayBuffer): Promise<string> {
  return hashBytesSha256(new Uint8Array(buffer));
}

export async function hashFileSha256(file: File): Promise<string> {
  return hashArrayBufferSha256(await file.arrayBuffer());
}

export async function hashJsonSha256(value: unknown): Promise<string> {
  return hashTextSha256(stableStringifyForHash(value));
}
