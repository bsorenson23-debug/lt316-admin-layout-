import type { TumblerItemLookupResponse } from "@/types/tumblerItemLookup";

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

  const payload = await res.json();

  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Item lookup failed. Please retry.";
    throw new Error(message);
  }

  return payload as TumblerItemLookupResponse;
}
