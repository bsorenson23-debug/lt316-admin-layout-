const VECTOR_FILE_EXTENSIONS = [".svg", ".ai", ".eps", ".ps", ".pdf", ".dxf"] as const;

export const VECTOR_UPLOAD_ACCEPT = [
  ".svg",
  "image/svg+xml",
  ".ai",
  "application/illustrator",
  ".eps",
  "application/postscript",
  ".ps",
  "application/postscript",
  ".pdf",
  "application/pdf",
  ".dxf",
  "application/dxf",
  "image/vnd.dxf",
].join(",");

export const VECTOR_UPLOAD_LABEL = "SVG, AI, EPS, PS, PDF, DXF";

export function getVectorFileExtension(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/").trim();
  const baseName = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return baseName.slice(dotIndex).toLowerCase();
}

export function isSupportedVectorFileName(fileName: string): boolean {
  return VECTOR_FILE_EXTENSIONS.includes(getVectorFileExtension(fileName) as (typeof VECTOR_FILE_EXTENSIONS)[number]);
}

export function normalizeImportedVectorName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/").trim();
  const baseName = normalized.slice(normalized.lastIndexOf("/") + 1) || "untitled";
  const ext = getVectorFileExtension(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;
  const safeStem = stem.trim() || "untitled";
  return `${safeStem}.svg`;
}
