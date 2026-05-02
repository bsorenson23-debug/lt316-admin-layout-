import type { TumblerItemLookupResponse } from "@/types/tumblerItemLookup";

export class TumblerLookupManualEntryError extends Error {
  readonly manualEntryRequired = true;
  readonly status: number;
  readonly payload: unknown;

  constructor(
    message = "Item lookup could not extract usable dimensions. Enter the tumbler dimensions manually.",
    options: { status?: number; payload?: unknown } = {},
  ) {
    super(message);
    this.name = "TumblerLookupManualEntryError";
    this.status = options.status ?? 422;
    this.payload = options.payload;
    Object.setPrototypeOf(this, TumblerLookupManualEntryError.prototype);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

export async function lookupTumblerItem(
  lookupInput: string,
): Promise<TumblerItemLookupResponse> {
  const res = await fetch("/api/admin/tumbler/item-lookup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ lookupInput }),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const message = readErrorMessage(payload, "Item lookup failed. Please retry.");
    if (res.status === 422 || (isRecord(payload) && payload.manualEntryRequired === true)) {
      throw new TumblerLookupManualEntryError(message, {
        status: res.status,
        payload,
      });
    }
    throw new Error(message);
  }

  return payload as TumblerItemLookupResponse;
}
