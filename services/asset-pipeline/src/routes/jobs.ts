import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import type { Response } from "express";
import { createInitialManifest } from "../lib/manifest";
import {
  createJobDirectories,
  getJobFilePath,
  getRawImagesDir,
  InvalidJobIdError,
  readManifest,
  saveManifest,
  StorageScopeError,
} from "../lib/storage";
import { runLookupStage } from "../stages/lookup";
import { ImageDoctorInputError, runImageDoctorStage } from "../stages/image-doctor";
import { runVectorizeStage } from "../stages/vectorize";
import { runMeshStage } from "../stages/mesh";
import type {
  CreateJobRequestBody,
  ImageDoctorRequestBody,
  ProductCategoryHint,
} from "../types/manifest";

export const jobsRouter = Router();
const CATEGORY_HINTS: ProductCategoryHint[] = ["flat", "tumbler", "mug", "bottle"];
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const RAW_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

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

function handleJobError(res: Response, error: unknown, notFoundMessage: string): void {
  if (
    error instanceof InvalidJobIdError ||
    error instanceof StorageScopeError ||
    error instanceof InvalidJobRequestError ||
    error instanceof ImageDoctorInputError
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

      const manifest = await readManifest(req.params.id);
      const rawDir = getRawImagesDir(req.params.id);
      const existingRawPaths = manifest.images.raw
        .map((rawPath) => path.basename(rawPath))
        .filter((name) => SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));

      await Promise.all(
        existingRawPaths.map(async (existingFileName) => {
          const existingFilePath = getJobFilePath(req.params.id, "images", "raw", existingFileName);
          await unlink(existingFilePath).catch(() => undefined);
        }),
      );

      const outputPath = getJobFilePath(req.params.id, "images", "raw", fileName);
      await writeFile(outputPath, body);

      manifest.status = "created";
      manifest.images.raw = listSupportedRawImagePaths([fileName], req.params.id);
      manifest.images.clean = {};
      manifest.debug.doctor = null;
      await saveManifest(manifest);

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
    const manifest = await runVectorizeStage(req.params.id);
    res.json(manifest);
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
