import type { SmartTemplateLookupResponse } from "@/types/smartTemplateLookup";

interface SmartTemplateLookupArgs {
  lookupInput?: string;
  image?: File | null;
}

export async function smartTemplateLookup(
  args: SmartTemplateLookupArgs,
): Promise<SmartTemplateLookupResponse> {
  const formData = new FormData();
  const lookupInput = args.lookupInput?.trim() ?? "";

  if (lookupInput) {
    formData.set("lookupInput", lookupInput);
  }
  if (args.image) {
    formData.set("image", args.image);
  }

  const res = await fetch("/api/admin/template/smart-lookup", {
    method: "POST",
    body: formData,
  });

  const payload = await res.json();

  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Smart product lookup failed. Please retry.";
    throw new Error(message);
  }

  return payload as SmartTemplateLookupResponse;
}
