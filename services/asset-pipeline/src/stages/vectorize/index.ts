import { runStage } from "../runStage";

export async function runVectorizeStage(jobId: string) {
  return runStage(jobId, "vectorize");
}
