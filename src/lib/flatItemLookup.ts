import type { FlatItemLookupResponse } from "@/types/flatItemLookup";

export async function lookupFlatItem(
  lookupInput: string,
): Promise<FlatItemLookupResponse> {
  const res = await fetch("/api/admin/flatbed/item-lookup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
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

  return payload as FlatItemLookupResponse;
}
