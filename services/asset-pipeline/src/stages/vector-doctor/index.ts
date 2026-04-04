import type { VectorDoctorResultPayload } from "../../types/manifest";
import path from "node:path";
import sharp from "sharp";
import {
  ensureDirectories,
  getJobFilePath,
  getStorageRoot,
  readManifest,
  saveManifest,
  writeDebugFile,
} from "../../lib/storage";

export class VectorDoctorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorDoctorInputError";
  }
}

function toStorageRelativePath(filePath: string): string {
  return path.relative(path.resolve(getStorageRoot()), filePath).replaceAll("\\", "/");
}

function getJobFilePathFromManifestPath(jobId: string, manifestPath: string): string {
  const segments = manifestPath.split("/").filter(Boolean);
  if (segments[0] !== jobId) {
    throw new VectorDoctorInputError(`Stored path "${manifestPath}" does not belong to job "${jobId}".`);
  }

  return getJobFilePath(jobId, ...segments.slice(1));
}

async function buildShapePreview(sourcePath: string, outputPath: string): Promise<number> {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const output = Buffer.alloc(info.width * info.height * 4, 0);
  let foregroundCount = 0;

  for (let index = 0; index < info.width * info.height; index += 1) {
    const sourceOffset = index * channels;
    const outputOffset = index * 4;
    const alpha = channels >= 4 ? data[sourceOffset + 3] ?? 255 : 255;
    const keep = alpha >= 8;

    if (!keep) {
      continue;
    }

    output[outputOffset] = 0;
    output[outputOffset + 1] = 0;
    output[outputOffset + 2] = 0;
    output[outputOffset + 3] = 255;
    foregroundCount += 1;
  }

  await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  return foregroundCount;
}

async function buildColorPreview(shapePreviewPath: string, outputPath: string): Promise<void> {
  const { data, info } = await sharp(shapePreviewPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const output = Buffer.alloc(info.width * info.height * 4, 255);
  for (let index = 0; index < info.width * info.height; index += 1) {
    const sourceOffset = index * info.channels;
    const outputOffset = index * 4;
    const alpha = data[sourceOffset + 3] ?? 0;
    if (alpha >= 16) {
      output[outputOffset] = 0;
      output[outputOffset + 1] = 0;
      output[outputOffset + 2] = 0;
      output[outputOffset + 3] = 255;
    }
  }

  await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);
}

async function buildContourPreview(shapePreviewPath: string, outputPath: string): Promise<void> {
  await sharp(shapePreviewPath)
    .ensureAlpha()
    .extractChannel(3)
    .threshold(1)
    .dilate(3)
    .erode(3)
    .png()
    .toFile(outputPath);
}

export async function runVectorDoctorStage(jobId: string): Promise<VectorDoctorResultPayload> {
  const manifest = await readManifest(jobId);
  const vectorInputPath = manifest.images.clean.vectorInput;

  if (!vectorInputPath) {
    throw new VectorDoctorInputError(
      "Vector-doctor requires image-doctor outputs. Run image-doctor first.",
    );
  }

  const sourceImagePath = getJobFilePathFromManifestPath(jobId, vectorInputPath);
  const outputDir = getJobFilePath(jobId, "images", "vector-doctor");
  await ensureDirectories([outputDir]);

  const colorPreviewPath = path.join(outputDir, "color-preview.png");
  const shapePreviewPath = path.join(outputDir, "shape-preview.png");
  const contourPreviewPath = path.join(outputDir, "contour-preview.png");

  const pixelCount = await buildShapePreview(sourceImagePath, shapePreviewPath);
  await buildColorPreview(shapePreviewPath, colorPreviewPath);
  await buildContourPreview(shapePreviewPath, contourPreviewPath);

  const result: VectorDoctorResultPayload = {
    jobId,
    status: "vector-doctor",
    sourceImageUsed: toStorageRelativePath(sourceImagePath),
    traceSourceUsed: toStorageRelativePath(sourceImagePath),
    groupedRegions: [
      {
        id: "region-01",
        role: "shape-group",
        colorHex: "#000000",
        pixelCount,
      },
    ],
    recipesByRegion: [
      {
        regionId: "region-01",
        role: "shape-group",
        recipe: "shape-detail",
      },
    ],
    mergedIntoOutputs: [
      {
        output: "color-preview",
        regionIds: ["region-01"],
      },
      {
        output: "trace-input",
        regionIds: ["region-01"],
      },
      {
        output: "shape-preview",
        regionIds: ["region-01"],
      },
      {
        output: "contour-preview",
        regionIds: ["region-01"],
      },
    ],
    suppressedRegions: [],
    artifacts: {
      colorPreview: toStorageRelativePath(colorPreviewPath),
      traceInput: toStorageRelativePath(sourceImagePath),
      textPreview: null,
      arcTextPreview: null,
      scriptTextPreview: null,
      shapePreview: toStorageRelativePath(shapePreviewPath),
      accentPreview: null,
      contourPreview: toStorageRelativePath(contourPreviewPath),
    },
    debugPath: `${jobId}/debug/vector-doctor.json`,
    note: "Baseline vector-doctor run: generated shape and contour branches from image-doctor vector-input.",
  };

  manifest.status = "vector-doctor";
  manifest.debug.vectorDoctor = result as unknown as Record<string, unknown>;

  await writeDebugFile(jobId, "vector-doctor", result as unknown as Record<string, unknown>);
  await saveManifest(manifest);

  return result;
}
