import type { ColorRegionsResultPayload } from "../../types/manifest";

export class ColorRegionsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColorRegionsInputError";
  }
}

export async function runColorRegionsStage(_jobId: string): Promise<ColorRegionsResultPayload> {
  throw new ColorRegionsInputError(
    "Color-regions is referenced by this branch, but services/asset-pipeline/src/stages/color-regions is still a placeholder.",
  );
}
