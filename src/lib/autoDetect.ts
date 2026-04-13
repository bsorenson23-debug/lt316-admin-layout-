import type {
  TumblerAutoSizeResponse,
  TumblerSpecDraft,
} from "@/types/tumblerAutoSize";
import { toTumblerSpecDraft } from "@/utils/tumblerAutoSize";
import { parseTumblerAutoSizeResponse } from "@/lib/adminApi.schema";

export interface AutoDetectResult {
  response: TumblerAutoSizeResponse;
  draft: TumblerSpecDraft;
}

export async function detectTumblerFromImage(
  file: File,
  traceHeaders?: HeadersInit,
): Promise<AutoDetectResult> {
  const formData = new FormData();
  formData.set("image", file);

  const res = await fetch("/api/admin/tumbler/auto-size", {
    method: "POST",
    headers: traceHeaders,
    body: formData,
  });

  const payload = await res.json();

  if (!res.ok) {
    const msg =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Auto-detect failed. Please retry.";
    throw new Error(msg);
  }

  const response = parseTumblerAutoSizeResponse(payload);
  if (!response) {
    throw new Error("Auto-detect returned an invalid response.");
  }
  const draft = toTumblerSpecDraft(response.suggestion, response.calculation);

  return { response, draft };
}
