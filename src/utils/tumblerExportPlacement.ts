import type { BedConfig, PlacedItem, WorkspaceMode } from "../types/admin";
import type {
  LightBurnExportArtifacts,
  LightBurnExportItem,
  LightBurnExportPayload,
  Lt316LightBurnSetupSidecar,
  RotaryExportOrigin,
  RotaryPlacementPreset,
  TopAnchorMode,
  TumblerPlacementProfile,
} from "../types/export";

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

function toRounded(value: number): number {
  return Number(value.toFixed(4));
}

function toRounded2(value: number): number {
  return Number(value.toFixed(2));
}

function getPrintableTopOffsetMm(args: {
  anchorMode: TopAnchorMode;
  placementProfile?: Pick<TumblerPlacementProfile, "topToSafeZoneStartMm"> | null;
}): number {
  if (args.anchorMode !== "printable-top") return 0;
  const topOffset = args.placementProfile?.topToSafeZoneStartMm;
  if (!isFiniteNumber(topOffset)) return 0;
  return clampNonNegative(topOffset);
}

export function getRotaryExportOrigin(args: {
  templateWidthMm: number;
  rotaryCenterXmm: number;
  rotaryTopYmm: number;
  anchorMode: TopAnchorMode;
  placementProfile?: Pick<TumblerPlacementProfile, "topToSafeZoneStartMm"> | null;
}): RotaryExportOrigin {
  const printableTopOffset = getPrintableTopOffsetMm({
    anchorMode: args.anchorMode,
    placementProfile: args.placementProfile,
  });
  return {
    xMm: toRounded(args.rotaryCenterXmm - args.templateWidthMm / 2),
    yMm: toRounded(args.rotaryTopYmm + printableTopOffset),
  };
}

export function applyRotaryPlacementToItems(args: {
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[];
  exportOrigin: RotaryExportOrigin;
}): LightBurnExportItem[] {
  return args.items.map((item) => ({
    id: item.id,
    assetId: item.assetId,
    name: item.name,
    xMm: toRounded(args.exportOrigin.xMm + item.x),
    yMm: toRounded(args.exportOrigin.yMm + item.y),
    widthMm: toRounded(item.width),
    heightMm: toRounded(item.height),
    rotationDeg: toRounded(item.rotation),
    svgText: item.svgText,
  }));
}

function toUnshiftedExportItems(
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[]
): LightBurnExportItem[] {
  return items.map((item) => ({
    id: item.id,
    assetId: item.assetId,
    name: item.name,
    xMm: toRounded(item.x),
    yMm: toRounded(item.y),
    widthMm: toRounded(item.width),
    heightMm: toRounded(item.height),
    rotationDeg: toRounded(item.rotation),
    svgText: item.svgText,
  }));
}

export function buildLightBurnExportPayload(args: {
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[];
  rotary: {
    enabled: boolean;
    preset: RotaryPlacementPreset | null;
    anchorMode: TopAnchorMode;
    placementProfile?: TumblerPlacementProfile | null;
  };
}): LightBurnExportPayload {
  const warnings: string[] = [];
  const isTumblerMode = args.workspaceMode === "tumbler-wrap";
  const shouldApplyRotary = isTumblerMode && args.rotary.enabled && Boolean(args.rotary.preset);

  if (isTumblerMode && args.rotary.enabled && !args.rotary.preset) {
    warnings.push(
      "Rotary auto placement is enabled but no preset is selected. Export uses template-space coordinates."
    );
  }

  const exportOrigin = shouldApplyRotary
    ? getRotaryExportOrigin({
        templateWidthMm: args.templateWidthMm,
        rotaryCenterXmm: args.rotary.preset!.rotaryCenterXmm,
        rotaryTopYmm: args.rotary.preset!.rotaryTopYmm,
        anchorMode: args.rotary.anchorMode,
        placementProfile: args.rotary.placementProfile,
      })
    : { xMm: 0, yMm: 0 };

  const items = shouldApplyRotary
    ? applyRotaryPlacementToItems({
        items: args.items,
        exportOrigin,
      })
    : toUnshiftedExportItems(args.items);

  return {
    kind: "lt316-lightburn-export",
    workspaceMode: args.workspaceMode,
    templateWidthMm: toRounded(args.templateWidthMm),
    templateHeightMm: toRounded(args.templateHeightMm),
    generatedAt: new Date().toISOString(),
    rotaryAutoPlacementApplied: shouldApplyRotary,
    rotary: {
      enabled: args.rotary.enabled,
      presetId: args.rotary.preset?.id ?? null,
      presetName: args.rotary.preset?.name ?? null,
      bedOrigin: args.rotary.preset?.bedOrigin ?? null,
      chuckOrRoller: args.rotary.preset?.chuckOrRoller ?? null,
      anchorMode: args.rotary.anchorMode,
      rotaryCenterXmm: args.rotary.preset?.rotaryCenterXmm ?? null,
      rotaryTopYmm: args.rotary.preset?.rotaryTopYmm ?? null,
      exportOriginXmm: toRounded(exportOrigin.xMm),
      exportOriginYmm: toRounded(exportOrigin.yMm),
    },
    warnings,
    items,
  };
}

function inferShapeType(
  value: BedConfig["tumblerShapeType"] | null | undefined
): "straight" | "tapered" | "unknown" {
  if (value === "straight" || value === "tapered") return value;
  return "unknown";
}

function inferOutsideDiameterMm(config: BedConfig): number {
  if (isFiniteNumber(config.tumblerOutsideDiameterMm)) return config.tumblerOutsideDiameterMm;
  if (isFiniteNumber(config.tumblerDiameterMm)) return config.tumblerDiameterMm;
  if (isFiniteNumber(config.width) && config.width > 0) return config.width / Math.PI;
  return 80;
}

function inferTopDiameterMm(config: BedConfig, outsideDiameterMm: number): number {
  if (isFiniteNumber(config.tumblerTopDiameterMm)) return config.tumblerTopDiameterMm;
  return outsideDiameterMm;
}

function inferBottomDiameterMm(config: BedConfig, outsideDiameterMm: number): number {
  if (isFiniteNumber(config.tumblerBottomDiameterMm)) return config.tumblerBottomDiameterMm;
  return outsideDiameterMm;
}

export function getRecommendedRotaryDiameter(args: {
  shapeType: "straight" | "tapered" | "unknown";
  outsideDiameterMm: number | null | undefined;
  topDiameterMm: number | null | undefined;
  bottomDiameterMm: number | null | undefined;
}): number {
  const outside = isFiniteNumber(args.outsideDiameterMm)
    ? args.outsideDiameterMm
    : null;
  const top = isFiniteNumber(args.topDiameterMm) ? args.topDiameterMm : outside;
  const bottom = isFiniteNumber(args.bottomDiameterMm)
    ? args.bottomDiameterMm
    : outside;

  if (args.shapeType === "tapered") {
    const largest = Math.max(top ?? outside ?? 0, bottom ?? outside ?? 0);
    return largest > 0 ? toRounded2(largest) : 80;
  }
  const straight = outside ?? top ?? bottom ?? 80;
  return toRounded2(straight);
}

export function buildLt316Sidecar(args: {
  bedConfig: BedConfig;
  artworkPayload: LightBurnExportPayload;
}): Lt316LightBurnSetupSidecar {
  const shapeType = inferShapeType(args.bedConfig.tumblerShapeType);
  const outsideDiameterMm = inferOutsideDiameterMm(args.bedConfig);
  const topDiameterMm = inferTopDiameterMm(args.bedConfig, outsideDiameterMm);
  const bottomDiameterMm = inferBottomDiameterMm(args.bedConfig, outsideDiameterMm);
  const recommendedObjectDiameterMm = getRecommendedRotaryDiameter({
    shapeType,
    outsideDiameterMm,
    topDiameterMm,
    bottomDiameterMm,
  });
  const recommendedCircumferenceMm = toRounded2(
    Math.PI * recommendedObjectDiameterMm
  );
  const note =
    shapeType === "tapered"
      ? "For tapered objects, use largest diameter."
      : "For straight objects, use outside diameter.";

  return {
    product: {
      shapeType,
      diameterMm: toRounded2(outsideDiameterMm),
      topDiameterMm: toRounded2(topDiameterMm),
      bottomDiameterMm: toRounded2(bottomDiameterMm),
      overallHeightMm: toRounded2(
        args.bedConfig.tumblerOverallHeightMm ?? args.bedConfig.height
      ),
      usableHeightMm: toRounded2(
        args.bedConfig.tumblerUsableHeightMm ?? args.bedConfig.height
      ),
    },
    rotary: {
      mode: args.artworkPayload.rotary.chuckOrRoller ?? "roller",
      recommendedObjectDiameterMm,
      recommendedCircumferenceMm,
      topAnchorYmm: toRounded2(args.artworkPayload.rotary.exportOriginYmm),
      exportOriginXmm: toRounded2(args.artworkPayload.rotary.exportOriginXmm),
      exportOriginYmm: toRounded2(args.artworkPayload.rotary.exportOriginYmm),
      note,
    },
    export: {
      artworkWidthMm: toRounded2(args.artworkPayload.templateWidthMm),
      artworkHeightMm: toRounded2(args.artworkPayload.templateHeightMm),
    },
  };
}

export function buildLightBurnSetupSummary(
  sidecar: Lt316LightBurnSetupSidecar,
  topAnchorMode: TopAnchorMode
): string {
  return [
    `Rotary type: ${sidecar.rotary.mode}`,
    `Object diameter: ${sidecar.rotary.recommendedObjectDiameterMm.toFixed(2)} mm`,
    `Wrap width: ${sidecar.rotary.recommendedCircumferenceMm.toFixed(2)} mm`,
    `Origin X: ${sidecar.rotary.exportOriginXmm.toFixed(2)} mm`,
    `Origin Y: ${sidecar.rotary.exportOriginYmm.toFixed(2)} mm`,
    `Top anchor: ${topAnchorMode}`,
  ].join(" | ");
}

export function buildLightBurnExportArtifacts(args: {
  includeLightBurnRotarySetup: boolean;
  bedConfig: BedConfig;
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[];
  rotary: {
    enabled: boolean;
    preset: RotaryPlacementPreset | null;
    anchorMode: TopAnchorMode;
    placementProfile?: TumblerPlacementProfile | null;
  };
}): LightBurnExportArtifacts {
  const artworkPayload = buildLightBurnExportPayload({
    workspaceMode: args.workspaceMode,
    templateWidthMm: args.templateWidthMm,
    templateHeightMm: args.templateHeightMm,
    items: args.items,
    rotary: args.rotary,
  });

  if (!args.includeLightBurnRotarySetup) {
    return {
      artworkPayload,
      sidecar: null,
      setupSummary: null,
    };
  }

  const sidecar = buildLt316Sidecar({
    bedConfig: args.bedConfig,
    artworkPayload,
  });

  return {
    artworkPayload,
    sidecar,
    setupSummary: buildLightBurnSetupSummary(sidecar, args.rotary.anchorMode),
  };
}
