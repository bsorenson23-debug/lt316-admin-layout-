import { randomUUID } from "node:crypto";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import type { Response } from "express";
import { createInitialManifest } from "../lib/manifest";
import {
  createJobDirectories,
  ensureDirectories,
  getDebugFilePath,
  getJobFilePath,
  getPlaceholderDir,
  getPlaceholderFilePath,
  getPlaceholderMetadataPath,
  getRawImagesDir,
  InvalidJobIdError,
  readManifest,
  saveManifest,
  StorageScopeError,
  writeDebugFile,
} from "../lib/storage";
import { analyzeTextImage, type TextDetectSource } from "../lib/textDetect";
import { generateTextReplacement, type TextReplacementRequest } from "../lib/textReplace";
import { ColorRegionsInputError, runColorRegionsStage } from "../stages/color-regions";
import { runLookupStage } from "../stages/lookup";
import { ImageDoctorInputError, runImageDoctorStage } from "../stages/image-doctor";
import { runVectorDoctorStage, VectorDoctorInputError } from "../stages/vector-doctor";
import { runVectorizeStage } from "../stages/vectorize";
import { runMeshStage } from "../stages/mesh";
import type {
  CreateJobRequestBody,
  ImageDoctorRequestBody,
  JobManifest,
  ProductCategoryHint,
  VectorizeRequestBody,
} from "../types/manifest";

export const jobsRouter = Router();
const CATEGORY_HINTS: ProductCategoryHint[] = ["flat", "tumbler", "mug", "bottle"];
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const RAW_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const PLACEHOLDER_IMAGE_ROUTE = "/placeholder/raw-image";

interface PlaceholderMetadata {
  fileName: string;
  mimeType: string;
  byteLength: number;
  savedAt: string;
}

class InvalidJobRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJobRequestError";
  }
}

function parseCreateJobBody(body: unknown): CreateJobRequestBody {
  if (body == null) {
    return {};
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidJobRequestError("POST /jobs expects a JSON object body.");
  }

  const requestBody = body as Record<string, unknown>;
  const parsedBody: CreateJobRequestBody = {};

  if ("input" in requestBody) {
    if (typeof requestBody.input !== "string") {
      throw new InvalidJobRequestError('"input" must be a string when provided.');
    }

    parsedBody.input = requestBody.input.trim();
  }

  if ("categoryHint" in requestBody) {
    if (typeof requestBody.categoryHint !== "string") {
      throw new InvalidJobRequestError('"categoryHint" must be a string when provided.');
    }

    const categoryHint = requestBody.categoryHint.trim().toLowerCase() as ProductCategoryHint;

    if (!CATEGORY_HINTS.includes(categoryHint)) {
      throw new InvalidJobRequestError(
        `"categoryHint" must be one of: ${CATEGORY_HINTS.join(", ")}.`,
      );
    }

    parsedBody.categoryHint = categoryHint;
  }

  return parsedBody;
}

function parseImageDoctorBody(body: unknown): ImageDoctorRequestBody {
  if (body == null) {
    return {};
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidJobRequestError("POST /jobs/:id/image-doctor expects a JSON object body.");
  }

  return body as ImageDoctorRequestBody;
}

function parseVectorizeBody(body: unknown): VectorizeRequestBody {
  if (body == null) {
    return {};
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidJobRequestError("POST /jobs/:id/vectorize expects a JSON object body.");
  }

  return body as VectorizeRequestBody;
}

function parseTextDetectBody(body: unknown): { source: TextDetectSource } {
  if (body == null) {
    return { source: "preview" };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidJobRequestError("POST /jobs/:id/text-detect expects a JSON object body.");
  }

  const requestBody = body as Record<string, unknown>;
  const source = requestBody.source;

  if (
    source == null ||
    source === "preview" ||
    source === "subject-clean" ||
    source === "subject-transparent" ||
    source === "raw"
  ) {
    return { source: (source as TextDetectSource | undefined) ?? "preview" };
  }

  throw new InvalidJobRequestError(
    '"source" must be one of: preview, subject-clean, subject-transparent, raw.',
  );
}

function parseOptionalString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new InvalidJobRequestError(`"${fieldName}" must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalNumber(
  value: unknown,
  fieldName: string,
): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidJobRequestError(`"${fieldName}" must be a finite number when provided.`);
  }

  return value;
}

function parseTextReplacementBody(
  body: unknown,
): TextReplacementRequest & { source: TextDetectSource } {
  if (body == null) {
    return {
      source: "preview",
      requestedMode: "auto",
      replacementText: null,
      preferredFontFamily: null,
      preferredFill: null,
      preferredWeight: null,
      preferredStyle: null,
      preferredLetterSpacing: null,
      preferredAngleDeg: null,
      preferredFontSizePx: null,
      preferredTextAnchor: null,
    };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidJobRequestError("POST /jobs/:id/text-replacement expects a JSON object body.");
  }

  const requestBody = body as Record<string, unknown>;
  const sourceBody = parseTextDetectBody({ source: requestBody.source });
  const requestedMode =
    requestBody.mode === "font-match" || requestBody.mode === "trace" || requestBody.mode === "auto"
      ? requestBody.mode
      : "auto";

  const preferredTextAnchor =
    requestBody.preferredTextAnchor === "middle" || requestBody.preferredTextAnchor === "end"
      ? requestBody.preferredTextAnchor
      : requestBody.preferredTextAnchor === "start"
        ? "start"
        : null;

  return {
    source: sourceBody.source,
    requestedMode,
    replacementText: parseOptionalString(requestBody.replacementText, "replacementText"),
    preferredFontFamily: parseOptionalString(requestBody.preferredFontFamily, "preferredFontFamily"),
    preferredFill: parseOptionalString(requestBody.preferredFill, "preferredFill"),
    preferredWeight: parseOptionalString(requestBody.preferredWeight, "preferredWeight"),
    preferredStyle: parseOptionalString(requestBody.preferredStyle, "preferredStyle"),
    preferredLetterSpacing: parseOptionalNumber(
      requestBody.preferredLetterSpacing,
      "preferredLetterSpacing",
    ),
    preferredAngleDeg: parseOptionalNumber(requestBody.preferredAngleDeg, "preferredAngleDeg"),
    preferredFontSizePx: parseOptionalNumber(requestBody.preferredFontSizePx, "preferredFontSizePx"),
    preferredTextAnchor,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sanitizeUploadFileName(fileName: string): string {
  const trimmed = fileName.trim();

  if (!trimmed) {
    throw new InvalidJobRequestError("A filename is required for raw image upload.");
  }

  const safeName = path.basename(trimmed).replace(/[^A-Za-z0-9._-]/g, "-").toLowerCase();
  const extension = path.extname(safeName).toLowerCase();

  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    throw new InvalidJobRequestError(
      "Unsupported raw image type. Use .png, .jpg, .jpeg, or .webp.",
    );
  }

  return safeName;
}

function getRawImageFileName(req: express.Request): string {
  const queryFileName =
    typeof req.query.filename === "string" ? req.query.filename : null;
  const headerFileName = req.header("x-filename");
  return sanitizeUploadFileName(queryFileName ?? headerFileName ?? "");
}

function listSupportedRawImagePaths(fileNames: string[], jobId: string): string[] {
  return fileNames
    .filter((fileName) => SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => `${jobId}/images/raw/${fileName}`);
}

function getManifestImagePath(manifest: JobManifest, source: TextDetectSource): string | null {
  if (source === "raw") {
    return manifest.images.raw[0] ?? null;
  }

  if (source === "preview") {
    return manifest.images.clean.preview ?? null;
  }

  if (source === "subject-clean") {
    return manifest.images.clean.subjectClean ?? null;
  }

  return manifest.images.clean.subjectTransparent ?? null;
}

function getJobFilePathFromManifestPath(jobId: string, manifestPath: string): string {
  const segments = manifestPath.split("/").filter(Boolean);
  if (segments[0] !== jobId) {
    throw new InvalidJobRequestError(`Stored path "${manifestPath}" does not belong to job "${jobId}".`);
  }

  return getJobFilePath(jobId, ...segments.slice(1));
}

function inferMimeTypeFromPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".png":
    default:
      return "image/png";
  }
}

async function readPlaceholderMetadata(): Promise<PlaceholderMetadata | null> {
  try {
    const data = await readFile(getPlaceholderMetadataPath(), "utf8");
    return JSON.parse(data) as PlaceholderMetadata;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writePlaceholderImage(
  fileName: string,
  body: Buffer,
  mimeType: string,
): Promise<PlaceholderMetadata> {
  await ensureDirectories([getPlaceholderDir()]);
  const safeFileName = sanitizeUploadFileName(fileName);
  const placeholderPath = getPlaceholderFilePath(safeFileName);
  await writeFile(placeholderPath, body);

  const metadata: PlaceholderMetadata = {
    fileName: safeFileName,
    mimeType,
    byteLength: body.byteLength,
    savedAt: new Date().toISOString(),
  };

  await writeFile(getPlaceholderMetadataPath(), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

async function getPlaceholderPayload(): Promise<{
  exists: boolean;
  fileName: string | null;
  mimeType: string | null;
  byteLength: number | null;
  savedAt: string | null;
  imageUrl: string | null;
}> {
  const metadata = await readPlaceholderMetadata();
  if (!metadata) {
    return {
      exists: false,
      fileName: null,
      mimeType: null,
      byteLength: null,
      savedAt: null,
      imageUrl: null,
    };
  }

  return {
    exists: true,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    byteLength: metadata.byteLength,
    savedAt: metadata.savedAt,
    imageUrl: PLACEHOLDER_IMAGE_ROUTE,
  };
}

function resetManifestForRawUpload(
  manifest: JobManifest,
  jobId: string,
  fileName: string,
): JobManifest {
  manifest.status = "created";
  manifest.images.raw = listSupportedRawImagePaths([fileName], jobId);
  manifest.images.clean = {};
  manifest.images.regions = {
    preview: null,
    masks: [],
  };
  manifest.debug.doctor = null;
  manifest.debug.colorRegions = null;
  manifest.debug.vectorDoctor = null;
  manifest.debug.vectorize = null;
  manifest.debug.mesh = null;
  manifest.svg = {
    logo: null,
    silhouette: null,
    detail: null,
    monochrome: null,
  };
  manifest.mesh = {
    glb: null,
    previewPng: null,
  };
  return manifest;
}

async function replaceJobRawImage(
  jobId: string,
  fileName: string,
  body: Buffer,
): Promise<JobManifest> {
  const safeFileName = sanitizeUploadFileName(fileName);
  const manifest = await readManifest(jobId);
  const existingRawPaths = manifest.images.raw
    .map((rawPath) => path.basename(rawPath))
    .filter((name) => SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));

  await Promise.all(
    existingRawPaths.map(async (existingFileName) => {
      const existingFilePath = getJobFilePath(jobId, "images", "raw", existingFileName);
      await unlink(existingFilePath).catch(() => undefined);
    }),
  );

  const outputPath = getJobFilePath(jobId, "images", "raw", safeFileName);
  await writeFile(outputPath, body);

  resetManifestForRawUpload(manifest, jobId, safeFileName);
  await saveManifest(manifest);
  return manifest;
}

function handleJobError(res: Response, error: unknown, notFoundMessage: string): void {
  if (
    error instanceof InvalidJobIdError ||
    error instanceof StorageScopeError ||
    error instanceof InvalidJobRequestError ||
    error instanceof ImageDoctorInputError ||
    error instanceof ColorRegionsInputError ||
    error instanceof VectorDoctorInputError
  ) {
    res.status(400).json({
      error: "Invalid request",
      detail: error.message,
    });
    return;
  }

  if (isNodeError(error) && error.code === "ENOENT") {
    res.status(404).json({ error: notFoundMessage });
    return;
  }

  res.status(500).json({
    error: "Asset pipeline request failed",
    detail: error instanceof Error ? error.message : "Unknown error",
  });
}

jobsRouter.post("/jobs", async (req, res) => {
  try {
    const requestBody = parseCreateJobBody(req.body);
    const jobId = randomUUID();
    await createJobDirectories(jobId);

    const manifest = createInitialManifest(jobId, {
      input: requestBody.input,
      category: requestBody.categoryHint,
    });
    await saveManifest(manifest);

    res.status(201).json(manifest);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.get("/jobs/:id", async (req, res) => {
  try {
    const manifest = await readManifest(req.params.id);
    res.json(manifest);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.get("/placeholder", async (_req, res) => {
  try {
    res.json(await getPlaceholderPayload());
  } catch (error) {
    handleJobError(res, error, "Placeholder not found");
  }
});

jobsRouter.get("/placeholder/raw-image", async (_req, res) => {
  try {
    const metadata = await readPlaceholderMetadata();
    if (!metadata) {
      res.status(404).json({ error: "Placeholder not found" });
      return;
    }

    const filePath = getPlaceholderFilePath(metadata.fileName);
    res.sendFile(filePath);
  } catch (error) {
    handleJobError(res, error, "Placeholder not found");
  }
});

jobsRouter.post("/jobs/:id/lookup", async (req, res) => {
  try {
    const result = await runLookupStage(req.params.id);
    res.json(result);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.post("/jobs/:id/image-doctor", async (req, res) => {
  try {
    const requestBody = parseImageDoctorBody(req.body);
    const result = await runImageDoctorStage(req.params.id, requestBody);
    res.json(result);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.post("/jobs/:id/color-regions", async (req, res) => {
  try {
    const result = await runColorRegionsStage(req.params.id);
    res.json(result);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.post("/jobs/:id/text-detect", async (req, res) => {
  try {
    const requestBody = parseTextDetectBody(req.body);
    const manifest = await readManifest(req.params.id);
    const manifestImagePath = getManifestImagePath(manifest, requestBody.source);

    if (!manifestImagePath) {
      throw new InvalidJobRequestError(
        `No image available for source "${requestBody.source}". Run image-doctor or upload a raw image first.`,
      );
    }

    const sourceFilePath = getJobFilePathFromManifestPath(req.params.id, manifestImagePath);
    const imageBuffer = await readFile(sourceFilePath);
    const mimeType = inferMimeTypeFromPath(sourceFilePath);
    const detection = await analyzeTextImage(
      new Uint8Array(imageBuffer),
      mimeType,
      path.basename(sourceFilePath),
    );

    const debugPayload = {
      source: requestBody.source,
      sourcePath: manifestImagePath,
      mimeType,
      byteLength: imageBuffer.byteLength,
      detection,
    };
    await writeDebugFile(req.params.id, "text-detect", debugPayload);

    res.json({
      jobId: req.params.id,
      source: requestBody.source,
      sourcePath: manifestImagePath,
      debugPath: `${req.params.id}/debug/text-detect.json`,
      detection,
    });
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.post("/jobs/:id/text-replacement", async (req, res) => {
  try {
    const requestBody = parseTextReplacementBody(req.body);
    const manifest = await readManifest(req.params.id);
    const manifestImagePath = getManifestImagePath(manifest, requestBody.source);

    if (!manifestImagePath) {
      throw new InvalidJobRequestError(
        `No image available for source "${requestBody.source}". Run image-doctor or upload a raw image first.`,
      );
    }

    const sourceFilePath = getJobFilePathFromManifestPath(req.params.id, manifestImagePath);
    const imageBuffer = await readFile(sourceFilePath);
    const mimeType = inferMimeTypeFromPath(sourceFilePath);
    const detection = await analyzeTextImage(
      new Uint8Array(imageBuffer),
      mimeType,
      path.basename(sourceFilePath),
    );
    const replacement = await generateTextReplacement(new Uint8Array(imageBuffer), detection, requestBody);

    const debugPayload = {
      source: requestBody.source,
      sourcePath: manifestImagePath,
      mimeType,
      byteLength: imageBuffer.byteLength,
      detection,
      replacement: replacement.debug,
    };
    await writeDebugFile(req.params.id, "text-replacement", debugPayload);
    await writeFile(getDebugFilePath(req.params.id, "text-replacement.svg"), replacement.svg, "utf8");

    res.json({
      jobId: req.params.id,
      source: requestBody.source,
      sourcePath: manifestImagePath,
      debugPath: `${req.params.id}/debug/text-replacement.json`,
      svgPath: `${req.params.id}/debug/text-replacement.svg`,
      detection,
      replacement,
    });
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.put(
  "/jobs/:id/raw-image",
  express.raw({
    type: () => true,
    limit: RAW_UPLOAD_LIMIT_BYTES,
  }),
  async (req, res) => {
    try {
      const fileName = getRawImageFileName(req);
      const body = req.body;

      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new InvalidJobRequestError("Raw image upload body is required.");
      }

      const manifest = await replaceJobRawImage(req.params.id, fileName, body);

      res.status(201).json({
        jobId: manifest.jobId,
        uploaded: manifest.images.raw[0],
        manifest,
      });
    } catch (error) {
      handleJobError(res, error, "Job not found");
    }
  },
);

jobsRouter.put(
  "/placeholder/raw-image",
  express.raw({
    type: () => true,
    limit: RAW_UPLOAD_LIMIT_BYTES,
  }),
  async (req, res) => {
    try {
      const fileName = getRawImageFileName(req);
      const body = req.body;

      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new InvalidJobRequestError("Placeholder upload body is required.");
      }

      const metadata = await writePlaceholderImage(
        fileName,
        body,
        req.header("content-type") || inferMimeTypeFromPath(fileName),
      );

      res.status(201).json({
        placeholder: await getPlaceholderPayload(),
        uploaded: metadata.fileName,
      });
    } catch (error) {
      handleJobError(res, error, "Placeholder not found");
    }
  },
);

jobsRouter.post("/placeholder/from-job/:id", async (req, res) => {
  try {
    const manifest = await readManifest(req.params.id);
    const rawPath = manifest.images.raw[0];

    if (!rawPath) {
      throw new InvalidJobRequestError("This job does not have a raw image to save as a placeholder.");
    }

    const sourcePath = getJobFilePathFromManifestPath(req.params.id, rawPath);
    const body = await readFile(sourcePath);
    const metadata = await writePlaceholderImage(
      path.basename(rawPath),
      body,
      inferMimeTypeFromPath(sourcePath),
    );

    res.status(201).json({
      placeholder: await getPlaceholderPayload(),
      uploaded: metadata.fileName,
    });
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.post("/jobs/:id/use-placeholder", async (req, res) => {
  try {
    const metadata = await readPlaceholderMetadata();
    if (!metadata) {
      throw new InvalidJobRequestError("No placeholder image has been saved yet.");
    }

    const body = await readFile(getPlaceholderFilePath(metadata.fileName));
    const manifest = await replaceJobRawImage(req.params.id, metadata.fileName, body);

    res.status(201).json({
      jobId: manifest.jobId,
      uploaded: manifest.images.raw[0],
      placeholder: await getPlaceholderPayload(),
      manifest,
    });
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.get("/storage/:id/*", async (req, res) => {
  try {
    const wildcardParams = req.params as Record<string, string | undefined>;
    const relativePath = wildcardParams["0"];

    if (typeof relativePath !== "string" || !relativePath.trim()) {
      throw new InvalidJobRequestError("A storage file path is required.");
    }

    const filePath = getJobFilePath(
      req.params.id,
      ...relativePath.split("/").filter(Boolean),
    );

    res.sendFile(filePath);
  } catch (error) {
    handleJobError(res, error, "Stored file not found");
  }
});

jobsRouter.post("/jobs/:id/vectorize", async (req, res) => {
  try {
    const requestBody = parseVectorizeBody(req.body);
    const manifest = await runVectorizeStage(req.params.id, requestBody);
    res.json(manifest);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.post("/jobs/:id/vector-doctor", async (req, res) => {
  try {
    const result = await runVectorDoctorStage(req.params.id);
    res.json(result);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});

jobsRouter.post("/jobs/:id/mesh", async (req, res) => {
  try {
    const manifest = await runMeshStage(req.params.id);
    res.json(manifest);
  } catch (error) {
    handleJobError(res, error, "Job not found");
  }
});
