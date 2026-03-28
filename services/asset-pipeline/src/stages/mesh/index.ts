import { runStage } from "../runStage";

export async function runMeshStage(jobId: string) {
  return runStage(jobId, "mesh");
}
