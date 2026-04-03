import sharp from "sharp";
import type { RasterTraceRecipe } from "@/types/rasterVectorize";

export async function prepareRasterTraceInput(
  imageBuffer: Buffer,
  options: {
    maxDimension: number;
    recipe?: RasterTraceRecipe;
    preserveText?: boolean;
    normalizeLevels?: boolean;
    density?: number;
  },
): Promise<{ buffer: Uint8Array; estimatedAutoThreshold: number | null }> {
  const image = sharp(imageBuffer, { limitInputPixels: false }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? options.maxDimension;
  const height = metadata.height ?? options.maxDimension;
  const resizeScale = Math.min(1, options.maxDimension / Math.max(width, height, 1));
  const targetWidth = Math.max(1, Math.round(width * resizeScale));
  const targetHeight = Math.max(1, Math.round(height * resizeScale));

  const normalized = image
    .resize(targetWidth, targetHeight, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: false,
    });

  const stats = await normalized.clone().removeAlpha().stats();
  const channels = stats.channels ?? [];
  const averageLuma =
    channels.length >= 3
      ? ((channels[0]?.mean ?? 0) * 0.2126) + ((channels[1]?.mean ?? 0) * 0.7152) + ((channels[2]?.mean ?? 0) * 0.0722)
      : 160;

  const estimatedAutoThreshold = Math.max(32, Math.min(224, Math.round(averageLuma)));
  const buffer = new Uint8Array(await normalized.toBuffer({ resolveWithObject: false }));

  return {
    buffer,
    estimatedAutoThreshold,
  };
}
