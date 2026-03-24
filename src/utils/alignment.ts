import { BedConfig, ItemAlignmentMode, PlacedItem, PlacedItemPatch, SvgBounds } from "@/types/admin";

function safeDiv(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator === 0) return 1;
  return numerator / denominator;
}

export function getPlacedArtworkBounds(item: Pick<PlacedItem, "x" | "y" | "width" | "height" | "documentBounds" | "artworkBounds">): SvgBounds {
  const scaleX = safeDiv(item.width, item.documentBounds.width);
  const scaleY = safeDiv(item.height, item.documentBounds.height);

  return {
    x: item.x + (item.artworkBounds.x - item.documentBounds.x) * scaleX,
    y: item.y + (item.artworkBounds.y - item.documentBounds.y) * scaleY,
    width: item.artworkBounds.width * scaleX,
    height: item.artworkBounds.height * scaleY,
  };
}

export function computeTopLeftForArtworkCenter(args: {
  documentBounds: SvgBounds;
  artworkBounds: SvgBounds;
  itemWidth: number;
  itemHeight: number;
  targetCenterX: number;
  targetCenterY: number;
}): { x: number; y: number } {
  const scaleX = safeDiv(args.itemWidth, args.documentBounds.width);
  const scaleY = safeDiv(args.itemHeight, args.documentBounds.height);
  const artworkCenterOffsetX =
    (args.artworkBounds.x - args.documentBounds.x + args.artworkBounds.width / 2) * scaleX;
  const artworkCenterOffsetY =
    (args.artworkBounds.y - args.documentBounds.y + args.artworkBounds.height / 2) * scaleY;

  return {
    x: args.targetCenterX - artworkCenterOffsetX,
    y: args.targetCenterY - artworkCenterOffsetY,
  };
}

export function computeAlignmentPatch(
  item: PlacedItem,
  bedConfig: Pick<BedConfig, "width" | "height">,
  mode: ItemAlignmentMode
): PlacedItemPatch {
  const artwork = getPlacedArtworkBounds(item);
  let nextX = item.x;
  let nextY = item.y;
  let nextWidth = item.width;
  let nextHeight = item.height;

  if (mode === "fit-bed") {
    const fitX = safeDiv(bedConfig.width, artwork.width);
    const fitY = safeDiv(bedConfig.height, artwork.height);
    const factor = Math.min(fitX, fitY);
    if (Number.isFinite(factor) && factor > 0) {
      nextWidth = item.width * factor;
      nextHeight = item.height * factor;

      const centered = computeTopLeftForArtworkCenter({
        documentBounds: item.documentBounds,
        artworkBounds: item.artworkBounds,
        itemWidth: nextWidth,
        itemHeight: nextHeight,
        targetCenterX: bedConfig.width / 2,
        targetCenterY: bedConfig.height / 2,
      });

      nextX = centered.x;
      nextY = centered.y;
    }

    return {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    };
  }

  const artworkCenterX = artwork.x + artwork.width / 2;
  const artworkCenterY = artwork.y + artwork.height / 2;

  if (mode === "center-bed" || mode === "center-x") {
    nextX += bedConfig.width / 2 - artworkCenterX;
  }
  if (mode === "center-bed" || mode === "center-y") {
    nextY += bedConfig.height / 2 - artworkCenterY;
  }

  // Tumbler-wrap: shift artwork center to 180° opposite side (half circumference)
  if (mode === "opposite-logo") {
    // Center on front face, upper third (avoids typical bottom-right logo zone)
    nextX += bedConfig.width / 2 - artworkCenterX;
    nextY += bedConfig.height * 0.35 - artworkCenterY;
  }

  // Tumbler-wrap: center artwork horizontally on the FRONT marker (bed center)
  if (mode === "center-on-front") {
    nextX += bedConfig.width / 2 - artworkCenterX;
    nextY += bedConfig.height / 2 - artworkCenterY;
  }

  // Tumbler-wrap: right of handle — faces the user when held in right hand
  // Offset 15% of wrap width to the right of front center
  if (mode === "right-of-handle") {
    nextX += (bedConfig.width / 2 + bedConfig.width * 0.15) - artworkCenterX;
    nextY += bedConfig.height / 2 - artworkCenterY;
  }

  // Tumbler-wrap: left of handle — faces the user when held in left hand
  // Offset 15% of wrap width to the left of front center
  if (mode === "left-of-handle") {
    nextX += (bedConfig.width / 2 - bedConfig.width * 0.15) - artworkCenterX;
    nextY += bedConfig.height / 2 - artworkCenterY;
  }

  // Tumbler-wrap: scale artwork to fill the full printable arc width
  if (mode === "full-wrap") {
    // Use the full bed (printable arc) — handle exclusion zone is not yet tracked here
    nextWidth = bedConfig.width;
    nextHeight = bedConfig.height;
    nextX = 0;
    nextY = 0;
    return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
  }

  // Tumbler-wrap: back side — near grid origin (behind handle / seam area)
  if (mode === "back-side") {
    nextX += 0 - artworkCenterX + artwork.width / 2;
    nextY += bedConfig.height / 2 - artworkCenterY;
  }

  return { x: nextX, y: nextY };
}

export function computePlacementFromArtworkRect(args: {
  targetArtwork: SvgBounds;
  documentBounds: SvgBounds;
  artworkBounds: SvgBounds;
}): { x: number; y: number; width: number; height: number } {
  const scaleX = safeDiv(args.targetArtwork.width, args.artworkBounds.width);
  const scaleY = safeDiv(args.targetArtwork.height, args.artworkBounds.height);

  const width = args.documentBounds.width * scaleX;
  const height = args.documentBounds.height * scaleY;
  const x = args.targetArtwork.x - (args.artworkBounds.x - args.documentBounds.x) * scaleX;
  const y = args.targetArtwork.y - (args.artworkBounds.y - args.documentBounds.y) * scaleY;

  return { x, y, width, height };
}
