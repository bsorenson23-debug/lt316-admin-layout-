import type { JobManifest, StageName } from "../types/manifest";
import { readManifest, saveManifest, writeDebugFile } from "../lib/storage";

const STAGE_TO_DEBUG_KEY: Record<Exclude<StageName, "created">, keyof JobManifest["debug"]> = {
  lookup: "lookup",
  "image-doctor": "doctor",
  vectorize: "vectorize",
  mesh: "mesh",
};

export async function runStage(jobId: string, stage: Exclude<StageName, "created">): Promise<JobManifest> {
  const manifest = await readManifest(jobId);
  const debugPayload = {
    stage,
    ranAt: new Date().toISOString(),
    note: "Pipeline stage scaffold only; no real processing implemented.",
  };

  manifest.status = stage;
  manifest.debug[STAGE_TO_DEBUG_KEY[stage]] = debugPayload;

  await writeDebugFile(jobId, stage, debugPayload);
  await saveManifest(manifest);

  return manifest;
}
