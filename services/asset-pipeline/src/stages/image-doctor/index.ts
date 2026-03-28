import path from "node:path";
import {
  ensureDirectories,
  getCleanImagesDir,
  getDebugDir,
  getStorageRoot,
  getRawImagesDir,
  readManifest,
  saveManifest,
  writeDebugFile,
  writeJobJson,
} from "../../lib/storage";
import type { ImageDoctorResultPayload } from "../../types/manifest";

function toStorageRelativePath(filePath: string): string {
  return path.relative(path.resolve(getStorageRoot()), filePath).replaceAll("\\", "/");
}

export async function runImageDoctorStage(jobId: string): Promise<{
  manifest: Awaited<ReturnType<typeof readManifest>>;
  doctor: ImageDoctorResultPayload;
}> {
  const manifest = await readManifest(jobId);
  const rawDir = getRawImagesDir(jobId);
  const cleanDir = getCleanImagesDir(jobId);
  const debugDir = getDebugDir(jobId);

  await ensureDirectories([rawDir, cleanDir, debugDir]);

  const doctorPayload: ImageDoctorResultPayload = {
    jobId: manifest.jobId,
    status: "image-doctor",
    directories: {
      raw: toStorageRelativePath(rawDir),
      clean: toStorageRelativePath(cleanDir),
      debug: toStorageRelativePath(debugDir),
    },
    views: {
      overlay: "images/clean/overlay.png",
      front: "images/raw/front.png",
      back: null,
      sideLeft: null,
      sideRight: null,
    },
    clean: {
      report: "images/clean/doctor-result.json",
    },
    note: "Image-doctor scaffold only; no image processing has been performed yet.",
  };
  const debugPayload = {
    stage: "image-doctor",
    ranAt: new Date().toISOString(),
    directories: doctorPayload.directories,
    outputs: {
      views: doctorPayload.views,
      clean: doctorPayload.clean,
    },
    note: doctorPayload.note,
  };

  manifest.status = "image-doctor";
  manifest.images.views = {
    ...doctorPayload.views,
  };
  manifest.images.clean = {
    ...doctorPayload.clean,
  };
  manifest.debug.doctor = debugPayload;

  await writeJobJson(jobId, ["images", "clean", "doctor-result.json"], doctorPayload);
  await writeDebugFile(jobId, "doctor", debugPayload);
  await saveManifest(manifest);

  return {
    manifest,
    doctor: doctorPayload,
  };
}
