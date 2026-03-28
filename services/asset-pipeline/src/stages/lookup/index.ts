import path from "node:path";
import {
  getProductPath,
  getStorageRoot,
  readManifest,
  saveManifest,
  writeDebugFile,
  writeJobJson,
} from "../../lib/storage";
import type { LookupProductPayload } from "../../types/manifest";

function toStorageRelativePath(filePath: string): string {
  return path.relative(path.resolve(getStorageRoot()), filePath).replaceAll("\\", "/");
}

export async function runLookupStage(jobId: string): Promise<{
  manifest: Awaited<ReturnType<typeof readManifest>>;
  product: LookupProductPayload;
}> {
  const manifest = await readManifest(jobId);
  const productPayload: LookupProductPayload = {
    input: manifest.product.input,
    title: manifest.product.title,
    brand: manifest.product.brand,
    category: manifest.product.category,
    dimensionsMm: {
      ...manifest.product.dimensionsMm,
    },
    imageCandidates: [],
  };
  const productPath = getProductPath(jobId);
  const debugPayload = {
    stage: "lookup",
    ranAt: new Date().toISOString(),
    productPath: toStorageRelativePath(productPath),
    product: productPayload,
    note: "Lookup scaffold only; product.json is normalized from the current manifest.",
  };

  manifest.status = "lookup";
  manifest.product = {
    input: productPayload.input,
    title: productPayload.title,
    brand: productPayload.brand,
    category: productPayload.category,
    dimensionsMm: {
      ...productPayload.dimensionsMm,
    },
  };
  manifest.debug.lookup = debugPayload;

  await writeJobJson(jobId, ["product.json"], productPayload);
  await writeDebugFile(jobId, "lookup", debugPayload);
  await saveManifest(manifest);

  return {
    manifest,
    product: productPayload,
  };
}
