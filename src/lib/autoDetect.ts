import type {
  TumblerAutoSizeResponse,
  TumblerSpecDraft,
} from "@/types/tumblerAutoSize";
import { toTumblerSpecDraft } from "@/utils/tumblerAutoSize";

export interface AutoDetectResult {
  response: TumblerAutoSizeResponse;
  draft: TumblerSpecDraft;
}

export async function detectTumblerFromImage(
  file: File
): Promise<AutoDetectResult> {
  const formData = new FormData();
  formData.set("image", file);

  const res = await fetch("/api/admin/tumbler/auto-size", {
    method: "POST",
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

  const response = payload as TumblerAutoSizeResponse;
  const draft = toTumblerSpecDraft(response.suggestion, response.calculation);

  return { response, draft };
}
