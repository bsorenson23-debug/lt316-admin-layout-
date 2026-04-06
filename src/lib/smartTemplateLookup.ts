import type { SmartTemplateLookupResponse, SmartTemplateLookupResult } from "@/types/smartTemplateLookup";
import type { TumblerFinish } from "@/types/materials";
import type { ProductTemplate } from "@/types/productTemplate";

interface SmartTemplateLookupArgs {
  lookupInput?: string;
  image?: File | null;
  laserTypeOverride?: ProductTemplate["laserType"] | "";
  finishTypeOverride?: TumblerFinish | "";
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
  if (args.laserTypeOverride) {
    formData.set("laserTypeOverride", args.laserTypeOverride);
  }
  if (args.finishTypeOverride) {
    formData.set("finishTypeOverride", args.finishTypeOverride);
  }

  const res = await fetch("/api/admin/smart-template-lookup", {
    method: "POST",
    body: formData,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const bodyText = await res.text();
  let payload: SmartTemplateLookupResult | null = null;

  if (contentType.includes("application/json")) {
    try {
      payload = JSON.parse(bodyText) as SmartTemplateLookupResult;
    } catch {
      console.warn("[smart-lookup] invalid json response", {
        status: res.status,
        contentType,
        preview: bodyText.slice(0, 160),
      });
      throw new Error("Smart product lookup returned an unreadable response.");
    }
  } else {
    console.warn("[smart-lookup] non-json response", {
      status: res.status,
      contentType,
      preview: bodyText.slice(0, 160),
    });
    throw new Error("Smart product lookup returned an invalid response.");
  }

  if (!payload || typeof payload !== "object" || !("ok" in payload)) {
    console.warn("[smart-lookup] unexpected envelope", {
      status: res.status,
      contentType,
      preview: bodyText.slice(0, 160),
    });
    throw new Error("Smart product lookup returned an unexpected response.");
  }

  if (!payload.ok) {
    if (payload.error.detail) {
      console.warn("[smart-lookup] typed lookup failure", {
        code: payload.error.code,
        detail: payload.error.detail,
      });
    }
    throw new Error(payload.error.message);
  }

  return payload.data;
}
