import { createHash, randomUUID } from "crypto";
import { mkdir, readdir, readFile, rm, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import type {
  SvgLibraryEntry,
  SvgLibraryEntryCreateInput,
  SvgLibraryEntryImportInput,
  SvgLibraryImportRejected,
  SvgLibraryImportResult,
  SvgLibraryReviewState,
  SvgLibraryWorkflowStatus,
} from "../../types/svgLibrary.ts";
import {
  analyzeSvgMarkup,
  buildInitialClassification,
  buildSmartNamingPlan,
  countDrawableElements,
  inferSourceFolderLabel,
  resolveWorkflowStatus,
  sanitizeSvgForLibrary,
} from "./libraryMeta.ts";

type SvgLibraryStoredRecord = Omit<SvgLibraryEntry, "svgText">;

interface SvgLibraryLayout {
  root: string;
  records: string;
  originals: string;
  sanitized: string;
  thumbs: string;
  previews: string;
  accounts: string;
}

interface LegacySvgLibraryEntry {
  id: string;
  name: string;
  svgText: string;
  createdAt: string;
  updatedAt: string;
}

const SVG_DOCUMENT_PATTERN =
  /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+svg[^>]*>\s*)?<svg[\s>]/i;
const INVALID_SVG_LIST_LOG_COOLDOWN_MS = 5 * 60 * 1000;

let lastInvalidSvgListSignature: string | null = null;
let lastInvalidSvgListLoggedAt = 0;

function resolveSvgLibraryRoot() {
  return process.env.LT316_SVG_LIBRARY_DIR
    ? path.resolve(process.env.LT316_SVG_LIBRARY_DIR)
    : path.join(process.cwd(), "storage", "svg-library");
}

function getLayout(): SvgLibraryLayout {
  const root = resolveSvgLibraryRoot();
  return {
    root,
    records: path.join(root, "records"),
    originals: path.join(root, "originals"),
    sanitized: path.join(root, "sanitized"),
    thumbs: path.join(root, "thumbs"),
    previews: path.join(root, "previews"),
    accounts: path.join(root, "accounts"),
  };
}

function recordPath(layout: SvgLibraryLayout, id: string) {
  return path.join(layout.records, `${id}.json`);
}

function toAssetPaths(id: string) {
  return {
    originalSvgPath: `originals/${id}.svg`,
    sanitizedSvgPath: `sanitized/${id}.svg`,
    thumbnailPath: `thumbs/${id}.png`,
    previewPath: `previews/${id}.png`,
  };
}

function toAbsolutePath(layout: SvgLibraryLayout, relativeAssetPath: string) {
  return path.join(layout.root, relativeAssetPath);
}

function sanitizeEntryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "untitled.svg";
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-");
  return safe.toLowerCase().endsWith(".svg") ? safe : `${safe}.svg`;
}

function sanitizeRelativePath(relativePath?: string | null): string | null {
  if (!relativePath) return null;
  const segments = relativePath
    .split(/[\\/]+/)
    .map((segment) => segment.trim().replace(/[<>:"|?*\u0000-\u001F]+/g, "-"))
    .filter((segment) => segment && segment !== "." && segment !== "..");

  return segments.length > 0 ? segments.join("/") : null;
}

function sanitizeLibraryFolderPath(folderPath?: string | null): string | null {
  if (!folderPath) return null;
  const segments = folderPath
    .split(/[\\/]+|\s\/\s/g)
    .map((segment) => segment.trim().replace(/[<>:"|?*\u0000-\u001F]+/g, "-"))
    .filter((segment) => segment && segment !== "." && segment !== "..");

  return segments.length > 0 ? segments.join(" / ") : null;
}

function assertSvgText(svgText: string) {
  if (!svgText || !SVG_DOCUMENT_PATTERN.test(svgText)) {
    throw new Error("Invalid SVG content");
  }
}

function buildEmptySvgMessage(fileName?: string | null) {
  const lower = (fileName ?? "").toLowerCase();
  if (
    lower.endsWith(".ai")
    || lower.endsWith(".eps")
    || lower.endsWith(".ps")
    || lower.endsWith(".pdf")
  ) {
    return "Converted file has no visible paths or shapes. Save it as SVG or PDF-compatible AI/PDF and import again.";
  }
  return "SVG has no visible paths or shapes.";
}

function assertDrawableSvg(svgText: string, fileName?: string | null) {
  if (countDrawableElements(svgText) === 0) {
    throw new Error(buildEmptySvgMessage(fileName));
  }
}

function computeChecksum(svgText: string) {
  return createHash("sha256").update(svgText).digest("hex");
}

async function ensureSvgLibraryDir() {
  const layout = getLayout();
  await Promise.all([
    mkdir(layout.root, { recursive: true }),
    mkdir(layout.records, { recursive: true }),
    mkdir(layout.originals, { recursive: true }),
    mkdir(layout.sanitized, { recursive: true }),
    mkdir(layout.thumbs, { recursive: true }),
    mkdir(layout.previews, { recursive: true }),
    mkdir(layout.accounts, { recursive: true }),
  ]);
  await migrateLegacyEntries(layout);
  return layout;
}

async function writeThumbnailArtifacts(
  layout: SvgLibraryLayout,
  id: string,
  svgText: string,
): Promise<{ thumbnailPath: string | null; previewPath: string | null }> {
  const assetPaths = toAssetPaths(id);
  const input = Buffer.from(svgText, "utf8");

  try {
    await sharp(input)
      .resize(120, 120, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        withoutEnlargement: true,
      })
      .png()
      .toFile(toAbsolutePath(layout, assetPaths.thumbnailPath));

    await sharp(input)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        withoutEnlargement: true,
      })
      .png()
      .toFile(toAbsolutePath(layout, assetPaths.previewPath));

    return {
      thumbnailPath: assetPaths.thumbnailPath,
      previewPath: assetPaths.previewPath,
    };
  } catch {
    return {
      thumbnailPath: null,
      previewPath: null,
    };
  }
}

async function readStoredRecord(layout: SvgLibraryLayout, id: string): Promise<SvgLibraryStoredRecord | null> {
  try {
    const raw = await readFile(recordPath(layout, id), "utf8");
    return JSON.parse(raw) as SvgLibraryStoredRecord;
  } catch {
    return null;
  }
}

async function hydrateEntry(
  layout: SvgLibraryLayout,
  record: SvgLibraryStoredRecord,
): Promise<SvgLibraryEntry> {
  const svgText = await readFile(toAbsolutePath(layout, record.sanitizedSvgPath), "utf8");
  assertSvgText(svgText);
  assertDrawableSvg(svgText, record.originalFileName);
  const { laserReady, laserWarnings } = analyzeSvgMarkup(svgText);
  const classification = record.classification ?? buildInitialClassification({
    name: record.name,
    relativePath: record.sourceRelativePath,
    svgText,
  });
  const smartNaming = record.smartNaming ?? buildSmartNamingPlan({
    name: record.name,
    relativePath: record.sourceRelativePath,
    svgText,
    classification,
  });
  const libraryFolderPath = sanitizeLibraryFolderPath(record.libraryFolderPath ?? null);
  const workflowStatus = resolveWorkflowStatus({
    laserReady,
    currentName: record.name,
    libraryFolderPath,
    smartNaming,
    classification,
    forcedStatus: record.workflowStatus ?? null,
  });

  return {
    ...record,
    classification:
      workflowStatus === "approved" && classification.reviewState !== "rejected"
        ? { ...classification, reviewState: "approved" }
        : classification,
    smartNaming,
    libraryFolderPath,
    workflowStatus,
    laserReady,
    laserWarnings,
    svgText,
  };
}

async function listStoredRecords(layout: SvgLibraryLayout): Promise<SvgLibraryStoredRecord[]> {
  const files = await readdir(layout.records);
  const records = await Promise.all(
    files
      .filter((file) => file.toLowerCase().endsWith(".json"))
      .map(async (file) => {
        const raw = await readFile(path.join(layout.records, file), "utf8");
        return JSON.parse(raw) as SvgLibraryStoredRecord;
      }),
  );

  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function persistSvgLibraryEntry(args: {
  layout: SvgLibraryLayout;
  id?: string;
  name: string;
  svgText: string;
  relativePath?: string | null;
  originalFileName?: string;
  libraryFolderPath?: string | null;
  tags?: string[];
  createdAt?: string;
  uploadedAt?: string;
  lastUsedAt?: string | null;
  workflowStatus?: SvgLibraryWorkflowStatus;
  reviewState?: SvgLibraryReviewState;
}): Promise<SvgLibraryEntry> {
  const id = args.id ?? randomUUID();
  const createdAt = args.createdAt ?? new Date().toISOString();
  const uploadedAt = args.uploadedAt ?? createdAt;
  const originalFileName = sanitizeEntryName(args.originalFileName ?? args.name);
  const name = sanitizeEntryName(args.name);
  const relativePath = sanitizeRelativePath(args.relativePath);
  const libraryFolderPath = sanitizeLibraryFolderPath(args.libraryFolderPath);

  assertSvgText(args.svgText);

  const sanitizedSvgText = sanitizeSvgForLibrary(args.svgText);
  assertSvgText(sanitizedSvgText);
  assertDrawableSvg(sanitizedSvgText, args.originalFileName ?? args.name);

  const assetPaths = toAssetPaths(id);
  const checksumSha256 = computeChecksum(sanitizedSvgText);
  const baseClassification = buildInitialClassification({
    name,
    relativePath,
    svgText: sanitizedSvgText,
  });
  const classification = {
    ...baseClassification,
    reviewState:
      args.reviewState
      ?? (args.workflowStatus === "approved" && baseClassification.reviewState !== "rejected"
        ? "approved"
        : baseClassification.reviewState),
  };
  const smartNaming = buildSmartNamingPlan({
    name,
    relativePath,
    svgText: sanitizedSvgText,
    classification,
  });
  const { laserReady, laserWarnings } = analyzeSvgMarkup(sanitizedSvgText);
  const workflowStatus = resolveWorkflowStatus({
    laserReady,
    currentName: name,
    libraryFolderPath,
    smartNaming,
    classification,
    forcedStatus: args.workflowStatus ?? null,
  });
  const { thumbnailPath, previewPath } = await writeThumbnailArtifacts(args.layout, id, sanitizedSvgText);
  const updatedAt = new Date().toISOString();

  await writeFile(toAbsolutePath(args.layout, assetPaths.originalSvgPath), args.svgText, "utf8");
  await writeFile(toAbsolutePath(args.layout, assetPaths.sanitizedSvgPath), sanitizedSvgText, "utf8");

  const record: SvgLibraryStoredRecord = {
    id,
    name,
    originalFileName,
    sourceRelativePath: relativePath,
    sourceFolderLabel: inferSourceFolderLabel(relativePath),
    libraryFolderPath,
    checksumSha256,
    originalSvgPath: assetPaths.originalSvgPath,
    sanitizedSvgPath: assetPaths.sanitizedSvgPath,
    thumbnailPath,
    previewPath,
    uploadedAt,
    lastUsedAt: args.lastUsedAt ?? null,
    tags: Array.isArray(args.tags) ? [...new Set(args.tags.map((tag) => tag.trim()).filter(Boolean))] : [],
    laserReady,
    laserWarnings,
    classification:
      workflowStatus === "approved" && classification.reviewState !== "rejected"
        ? { ...classification, reviewState: "approved" }
        : classification,
    smartNaming,
    workflowStatus,
    createdAt,
    updatedAt,
  };

  await writeFile(recordPath(args.layout, id), JSON.stringify(record, null, 2), "utf8");

  return {
    ...record,
    svgText: sanitizedSvgText,
  };
}

async function migrateLegacyEntries(layout: SvgLibraryLayout) {
  const files = await readdir(layout.root, { withFileTypes: true });
  const legacyFiles = files.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"),
  );

  for (const file of legacyFiles) {
    try {
      const raw = await readFile(path.join(layout.root, file.name), "utf8");
      const parsed = JSON.parse(raw) as Partial<LegacySvgLibraryEntry>;
      if (
        typeof parsed.id !== "string" ||
        typeof parsed.name !== "string" ||
        typeof parsed.svgText !== "string" ||
        typeof parsed.createdAt !== "string" ||
        typeof parsed.updatedAt !== "string"
      ) {
        continue;
      }

      const existing = await readStoredRecord(layout, parsed.id);
      if (!existing) {
        await persistSvgLibraryEntry({
          layout,
          id: parsed.id,
          name: parsed.name,
          originalFileName: parsed.name,
          svgText: parsed.svgText,
          createdAt: parsed.createdAt,
          uploadedAt: parsed.createdAt,
        });
      }

      await unlink(path.join(layout.root, file.name));
    } catch {
      // Leave unreadable legacy files untouched so a human can inspect them.
    }
  }
}

export async function listSvgLibraryEntries(): Promise<SvgLibraryEntry[]> {
  const layout = await ensureSvgLibraryDir();
  const records = await listStoredRecords(layout);
  const invalidEntries: Array<{ id: string; name: string; error: string }> = [];
  const hydratedEntries = await Promise.all(
    records.map(async (record) => {
      try {
        return await hydrateEntry(layout, record);
      } catch (error) {
        invalidEntries.push({
          id: record.id,
          name: record.name,
          error: error instanceof Error ? error.message : "Invalid SVG content",
        });
        return null;
      }
    }),
  );

  if (invalidEntries.length > 0) {
    const sortedInvalidEntries = [...invalidEntries].sort((left, right) =>
      left.id.localeCompare(right.id) || left.name.localeCompare(right.name) || left.error.localeCompare(right.error),
    );
    const preview = sortedInvalidEntries
      .slice(0, 5)
      .map((entry) => `${entry.name} (${entry.error})`)
      .join("; ");
    const signature = JSON.stringify(
      sortedInvalidEntries
        .slice(0, 20)
        .map((entry) => [entry.id, entry.error]),
    );
    const now = Date.now();
    if (
      lastInvalidSvgListSignature == null ||
      now - lastInvalidSvgListLoggedAt > INVALID_SVG_LIST_LOG_COOLDOWN_MS
    ) {
      console.warn(
        `[svg-library:list] skipped ${invalidEntries.length} invalid entr${invalidEntries.length === 1 ? "y" : "ies"}${preview ? `: ${preview}` : ""}`,
      );
      lastInvalidSvgListLoggedAt = now;
    }
    lastInvalidSvgListSignature = signature;
  }

  return hydratedEntries.filter((entry): entry is SvgLibraryEntry => entry !== null);
}

export async function createSvgLibraryEntry(
  input: SvgLibraryEntryCreateInput,
): Promise<SvgLibraryEntry> {
  const layout = await ensureSvgLibraryDir();
  return persistSvgLibraryEntry({
    layout,
    name: input.name,
    originalFileName: input.name,
    svgText: input.svgText,
    relativePath: input.relativePath,
    tags: input.tags,
  });
}

export async function importSvgLibraryEntries(
  inputs: SvgLibraryEntryImportInput[],
): Promise<SvgLibraryImportResult> {
  const layout = await ensureSvgLibraryDir();
  const entries: SvgLibraryEntry[] = [];
  const rejected: SvgLibraryImportRejected[] = [];

  for (const input of inputs) {
    try {
      const entry = await persistSvgLibraryEntry({
        layout,
        name: input.name,
        originalFileName: input.originalFileName ?? input.name,
        svgText: input.svgText,
        relativePath: input.relativePath,
        tags: input.tags,
      });
      entries.push(entry);
    } catch (error) {
      rejected.push({
        name: input.name,
        relativePath: sanitizeRelativePath(input.relativePath),
        error: error instanceof Error ? error.message : "Failed to import SVG",
      });
    }
  }

  return { entries, rejected };
}

export async function deleteSvgLibraryEntry(id: string): Promise<boolean> {
  const layout = await ensureSvgLibraryDir();
  const existing = await readStoredRecord(layout, id);
  if (!existing) {
    return false;
  }

  const artifactPaths = [
    existing.originalSvgPath,
    existing.sanitizedSvgPath,
    existing.thumbnailPath,
    existing.previewPath,
  ].filter((value): value is string => Boolean(value));

  await Promise.all([
    unlink(recordPath(layout, id)),
    ...artifactPaths.map((relativeAssetPath) =>
      unlink(toAbsolutePath(layout, relativeAssetPath)).catch(() => undefined),
    ),
  ]);

  return true;
}

export async function clearSvgLibrary(): Promise<void> {
  const layout = getLayout();
  await rm(layout.root, { recursive: true, force: true });
  await ensureSvgLibraryDir();
}

export async function updateSvgLibraryEntry(
  id: string,
  patch: {
    name?: string;
    svgText?: string;
    libraryFolderPath?: string | null;
    workflowStatus?: SvgLibraryWorkflowStatus;
    reviewState?: SvgLibraryReviewState;
    applySuggestedName?: boolean;
    applySuggestedFolderPath?: boolean;
  },
): Promise<SvgLibraryEntry | null> {
  const layout = await ensureSvgLibraryDir();
  const existing = await readStoredRecord(layout, id);
  if (!existing) {
    return null;
  }

  const svgText = patch.svgText ?? await readFile(toAbsolutePath(layout, existing.sanitizedSvgPath), "utf8");
  const smartNaming = existing.smartNaming ?? buildSmartNamingPlan({
    name: existing.name,
    relativePath: existing.sourceRelativePath,
    svgText,
    classification: existing.classification ?? buildInitialClassification({
      name: existing.name,
      relativePath: existing.sourceRelativePath,
      svgText,
    }),
  });
  const nextName = patch.name
    ?? (patch.applySuggestedName ? smartNaming.suggestedName : existing.name);
  const nextLibraryFolderPath = patch.libraryFolderPath !== undefined
    ? patch.libraryFolderPath
    : (patch.applySuggestedFolderPath ? smartNaming.suggestedFolderPath : existing.libraryFolderPath ?? null);

  return persistSvgLibraryEntry({
    layout,
    id,
    name: nextName,
    originalFileName: existing.originalFileName,
    svgText,
    relativePath: existing.sourceRelativePath,
    libraryFolderPath: nextLibraryFolderPath,
    tags: existing.tags,
    createdAt: existing.createdAt,
    uploadedAt: existing.uploadedAt,
    lastUsedAt: existing.lastUsedAt,
    workflowStatus: patch.workflowStatus,
    reviewState: patch.reviewState,
  });
}
