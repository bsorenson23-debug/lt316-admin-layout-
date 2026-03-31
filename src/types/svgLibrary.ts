export type SvgLibraryItemType =
  | "tumbler"
  | "mug"
  | "bottle"
  | "drinkware-flat"
  | "plate-board"
  | "coaster-tile"
  | "sign-plaque"
  | "patch-tag"
  | "tech"
  | "business-card"
  | "other"
  | "unknown";

export type SvgLibraryArtworkType =
  | "logo"
  | "text-lockup"
  | "monogram"
  | "badge"
  | "pattern"
  | "line-art"
  | "unknown";

export type SvgLibraryReviewState =
  | "pending-analysis"
  | "pending-review"
  | "approved"
  | "rejected";

export type SvgLibrarySource =
  | "filename"
  | "folder-path"
  | "svg-text"
  | "ocr"
  | "vision"
  | "manual";

export interface SvgLibraryBusinessAccount {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SvgLibraryClassification {
  businessAccountId: string | null;
  businessName: string | null;
  itemType: SvgLibraryItemType;
  artworkType: SvgLibraryArtworkType;
  confidence: number;
  reviewState: SvgLibraryReviewState;
  sources: SvgLibrarySource[];
  reasons: string[];
  detectedText: string[];
  matchedOrderIds: string[];
}

export interface SvgLibraryEntry {
  id: string;
  name: string;
  originalFileName: string;
  sourceRelativePath: string | null;
  sourceFolderLabel: string | null;
  checksumSha256: string;
  originalSvgPath: string;
  sanitizedSvgPath: string;
  thumbnailPath: string | null;
  previewPath: string | null;
  uploadedAt: string;
  lastUsedAt: string | null;
  tags: string[];
  laserReady: boolean;
  laserWarnings: string[];
  classification: SvgLibraryClassification;
  createdAt: string;
  updatedAt: string;
  svgText: string;
}

export interface SvgLibraryEntryCreateInput {
  name: string;
  svgText: string;
  relativePath?: string | null;
  tags?: string[];
}

export interface SvgLibraryEntryImportInput extends SvgLibraryEntryCreateInput {
  originalFileName?: string;
}

export interface SvgLibraryImportRejected {
  name: string;
  relativePath: string | null;
  error: string;
}

export interface SvgLibraryImportResult {
  entries: SvgLibraryEntry[];
  rejected: SvgLibraryImportRejected[];
}
