import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { Router } from "express";
import { createInitialManifest } from "../lib/manifest";
import {
  createJobDirectories,
  InvalidJobIdError,
  readManifest,
  saveManifest,
  StorageScopeError,
} from "../lib/storage";
import { runLookupStage } from "../stages/lookup";
import { runImageDoctorStage } from "../stages/image-doctor";
import { runVectorizeStage } from "../stages/vectorize";
import { runMeshStage } from "../stages/mesh";
import type { CreateJobRequestBody, ProductCategoryHint } from "../types/manifest";

export const jobsRouter = Router();
const CATEGORY_HINTS: ProductCategoryHint[] = ["flat", "tumbler", "mug", "bottle"];

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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function handleJobError(res: Response, error: unknown, notFoundMessage: string): void {
  if (
    error instanceof InvalidJobIdError ||
    error instanceof StorageScopeError ||
    error instanceof InvalidJobRequestError
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
    const result = await runImageDoctorStage(req.params.id);
    res.json(result);
  } catch (error) {
    handleJobError(res, error, "Job not found");
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
