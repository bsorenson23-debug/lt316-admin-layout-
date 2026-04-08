import { BedConfig, EngravableZone, ItemAlignmentMode, PlacedItem, PlacedItemPatch, SvgBounds } from "@/types/admin";
import { getWrapBackCenter, getWrapFrontCenter, getWrapHandleCenter } from "@/utils/tumblerWrapLayout";

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
  mode: ItemAlignmentMode,
  engravableZone?: EngravableZone | null,
): PlacedItemPatch {
  const artwork = getPlacedArtworkBounds(item);
  let nextX = item.x;
  let nextY = item.y;
  let nextWidth = item.width;
  let nextHeight = item.height;

  const frontCenterX =
    engravableZone?.frontCenterX ??
    getWrapFrontCenter(bedConfig.width);
  const backCenterX =
    engravableZone?.backCenterX ??
    getWrapBackCenter(bedConfig.width) ??
    bedConfig.width / 4;
  const handleCenterX =
    engravableZone?.handleCenterX ??
    getWrapHandleCenter(bedConfig.width) ??
    (bedConfig.width / 2);
  const safeCenterY = engravableZone
    ? (engravableZone.printableCenterY ?? (engravableZone.y + engravableZone.height / 2))
    : bedConfig.height / 2;
  const safeUpperY = engravableZone ? engravableZone.y + engravableZone.height * 0.35 : bedConfig.height * 0.35;

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

  // ── Zone-aware modes ──────────────────────────────────────────────────────

  if (mode === "center-zone" && engravableZone) {
    const zoneCX = engravableZone.x + engravableZone.width / 2;
    const zoneCY = engravableZone.printableCenterY ?? (engravableZone.y + engravableZone.height / 2);
    const artworkCenterX = artwork.x + artwork.width / 2;
    const artworkCenterY = artwork.y + artwork.height / 2;
    nextX += zoneCX - artworkCenterX;
    nextY += zoneCY - artworkCenterY;
    return { x: nextX, y: nextY };
  }

  if (mode === "fit-zone" && engravableZone) {
    const fitX = safeDiv(engravableZone.width, artwork.width);
    const fitY = safeDiv(engravableZone.height, artwork.height);
    const factor = Math.min(fitX, fitY);
    if (Number.isFinite(factor) && factor > 0) {
      nextWidth = item.width * factor;
      nextHeight = item.height * factor;

      const centered = computeTopLeftForArtworkCenter({
        documentBounds: item.documentBounds,
        artworkBounds: item.artworkBounds,
        itemWidth: nextWidth,
        itemHeight: nextHeight,
        targetCenterX: engravableZone.x + engravableZone.width / 2,
        targetCenterY: engravableZone.printableCenterY ?? (engravableZone.y + engravableZone.height / 2),
      });

      nextX = centered.x;
      nextY = centered.y;
    }
    return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
  }

  // ── Standard modes ────────────────────────────────────────────────────────

  const artworkCenterX = artwork.x + artwork.width / 2;
  const artworkCenterY = artwork.y + artwork.height / 2;

  if (mode === "center-bed" || mode === "center-x") {
    nextX += bedConfig.width / 2 - artworkCenterX;
  }
  if (mode === "center-bed" || mode === "center-y") {
    nextY += bedConfig.height / 2 - artworkCenterY;
  }

  // Tumbler-wrap: place opposite logo (back face at w * 1/4), upper third
  if (mode === "opposite-logo") {
    nextX += backCenterX - artworkCenterX;
    nextY += safeUpperY - artworkCenterY;
  }

  // Tumbler-wrap: center artwork on the FRONT face (w * 3/4)
  if (mode === "center-on-front") {
    nextX += frontCenterX - artworkCenterX;
    nextY += safeCenterY - artworkCenterY;
  }

    // Tumbler-wrap: right of handle — 15% offset right of handle center
    if (mode === "right-of-handle") {
    nextX += (handleCenterX + bedConfig.width * 0.08) - artworkCenterX;
      nextY += safeCenterY - artworkCenterY;
    }

    // Tumbler-wrap: left of handle — 15% offset left of handle center
    if (mode === "left-of-handle") {
    nextX += (handleCenterX - bedConfig.width * 0.08) - artworkCenterX;
      nextY += safeCenterY - artworkCenterY;
    }

  // Tumbler-wrap: fill engravable zone if available, otherwise full bed
  if (mode === "full-wrap") {
    if (engravableZone) {
      nextX = engravableZone.x;
      nextY = engravableZone.y;
      nextWidth = engravableZone.width;
      nextHeight = engravableZone.height;
    } else {
      nextX = 0;
      nextY = 0;
      nextWidth = bedConfig.width;
      nextHeight = bedConfig.height;
    }
    return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
  }

  // Tumbler-wrap: back side — centered on back face (w / 4)
  if (mode === "back-side") {
    nextX += backCenterX - artworkCenterX;
    nextY += safeCenterY - artworkCenterY;
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
