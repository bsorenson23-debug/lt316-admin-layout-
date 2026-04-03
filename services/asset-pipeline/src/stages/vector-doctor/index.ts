import type { VectorDoctorResultPayload } from "../../types/manifest";

export class VectorDoctorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorDoctorInputError";
  }
}

export async function runVectorDoctorStage(_jobId: string): Promise<VectorDoctorResultPayload> {
  throw new VectorDoctorInputError(
    "Vector-doctor is referenced by this branch, but services/asset-pipeline/src/stages/vector-doctor is still a placeholder.",
  );
}
