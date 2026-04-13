import type { FlatItemLookupResponse } from "@/types/flatItemLookup";
import { parseFlatItemLookupResponse } from "@/lib/adminApi.schema";

export async function lookupFlatItem(
  lookupInput: string,
  traceHeaders?: HeadersInit,
): Promise<FlatItemLookupResponse> {
  const res = await fetch("/api/admin/flatbed/item-lookup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(traceHeaders ?? {}),
    },
    body: JSON.stringify({ lookupInput }),
  });

  const payload = await res.json();

  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Flat item lookup failed. Please retry.";
    throw new Error(message);
  }

  const response = parseFlatItemLookupResponse(payload);
  if (!response) {
    throw new Error("Flat item lookup returned an invalid response.");
  }
  return response;
}
