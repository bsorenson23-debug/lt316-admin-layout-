interface VectorImportResponse {
  name?: string;
  svgText?: string;
  warnings?: string[];
  detectedFormat?: string;
  error?: string;
}

export interface ImportedVectorPayload {
  name: string;
  svgText: string;
  warnings: string[];
  detectedFormat: string;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function convertVectorUpload(file: File): Promise<ImportedVectorPayload> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/admin/vector/import", {
    method: "POST",
    body: formData,
  });

  const payload = await readJson<VectorImportResponse>(response);
  if (!response.ok || !payload.name || !payload.svgText) {
    throw new Error(payload.error ?? `Failed to import ${file.name}`);
  }

  return {
    name: payload.name,
    svgText: payload.svgText,
    warnings: payload.warnings ?? [],
    detectedFormat: payload.detectedFormat ?? "svg",
  };
}
