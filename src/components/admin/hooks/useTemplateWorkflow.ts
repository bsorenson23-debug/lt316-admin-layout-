import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { BedConfig, WorkspaceMode } from "@/types/admin";
import type { ProductTemplate } from "@/types/productTemplate";
import type { ActiveMaterialSettings } from "../MaterialProfilePanel";
import type { BedMockupConfig, FlatBedItemOverlay } from "../LaserBedWorkspace";
import { getEngravableDimensions } from "@/lib/engravableDimensions";
import { getPrintableSurfaceResolutionFromDimensions } from "@/lib/printableSurface";
import { updateTemplate } from "@/lib/templateStorage";
import { getTumblerWrapLayout } from "@/utils/tumblerWrapLayout";

type BuildMaterialSettings = (profileId: string) => ActiveMaterialSettings | null;

type BgRemovalStatus = "idle" | "running" | "done" | "failed";

interface TemplateWorkflowParams {
  bedConfig: BedConfig;
  normalizeBedConfig: (config: BedConfig) => BedConfig;
  selectedTemplate: ProductTemplate | null;
  setSelectedMaterialProfileId: Dispatch<SetStateAction<string>>;
  setMaterialSettings: Dispatch<SetStateAction<ActiveMaterialSettings | null>>;
  setBedConfig: Dispatch<SetStateAction<BedConfig>>;
  setSelectedRotaryPresetId: Dispatch<SetStateAction<string>>;
  setRotaryAutoPlacementEnabled: Dispatch<SetStateAction<boolean>>;
  setSelectedTemplate: Dispatch<SetStateAction<ProductTemplate | null>>;
  setMockupConfig: Dispatch<SetStateAction<BedMockupConfig | null>>;
  setFlatBedItemOverlay: Dispatch<SetStateAction<FlatBedItemOverlay | null>>;
  setShowTemplateGallery: Dispatch<SetStateAction<boolean>>;
  setShowCreateForm: Dispatch<SetStateAction<boolean>>;
  setBgRemovalStatus: Dispatch<SetStateAction<BgRemovalStatus>>;
  setEngravableZone: Dispatch<SetStateAction<import("@/types/admin").EngravableZone | null>>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  bumpModelViewerResetKey: () => void;
  buildMaterialSettings: BuildMaterialSettings;
}

export function useTemplateWorkflow({
  bedConfig,
  normalizeBedConfig,
  selectedTemplate,
  setSelectedMaterialProfileId,
  setMaterialSettings,
  setBedConfig,
  setSelectedRotaryPresetId,
  setRotaryAutoPlacementEnabled,
  setSelectedTemplate,
  setMockupConfig,
  setFlatBedItemOverlay,
  setShowTemplateGallery,
  setShowCreateForm,
  setBgRemovalStatus,
  setEngravableZone,
  setToastMessage,
  bumpModelViewerResetKey,
  buildMaterialSettings,
}: TemplateWorkflowParams) {
  const handleMaterialProfileSelection = useCallback((profileId: string) => {
    setSelectedMaterialProfileId(profileId);
    setMaterialSettings(buildMaterialSettings(profileId));
  }, [buildMaterialSettings, setMaterialSettings, setSelectedMaterialProfileId]);

  const handleTemplateSelect = useCallback((template: ProductTemplate) => {
    // Apply all dimensions at once via bedConfig.
    const isRotary = template.productType === "tumbler" || template.productType === "mug" || template.productType === "bottle";
    const mode: WorkspaceMode = isRotary ? "tumbler-wrap" : "flat-bed";
    const dims = isRotary ? getEngravableDimensions(template) : null;
    const printableSurface = isRotary
      ? getPrintableSurfaceResolutionFromDimensions(
          template.dimensions,
          template.dimensions.canonicalDimensionCalibration,
        )
      : null;
    const workspaceHeightMm = dims?.engravableHeightMm ?? template.dimensions.printHeightMm;
    const usableHeightMm =
      dims?.printableHeightMm ??
      printableSurface?.printableSurfaceContract.printableHeightMm ??
      workspaceHeightMm;
    const materialProfileId = template.laserSettings.materialProfileId ?? "";
    const rotaryPresetId = template.laserSettings.rotaryPresetId ?? "";

    setBedConfig((prev) =>
      normalizeBedConfig({
        ...prev,
        workspaceMode: mode,
        tumblerDiameterMm: template.dimensions.diameterMm,
        tumblerPrintableHeightMm: workspaceHeightMm,
        tumblerTemplateWidthMm: template.dimensions.templateWidthMm,
        tumblerTemplateHeightMm: workspaceHeightMm,
        tumblerOverallHeightMm:
          template.dimensions.overallHeightMm ??
          dims?.totalHeightMm,
        ...(isRotary
          ? {
              tumblerOutsideDiameterMm: template.dimensions.diameterMm,
              tumblerUsableHeightMm: usableHeightMm,
            }
          : {
              flatWidth: template.dimensions.templateWidthMm,
              flatHeight: template.dimensions.printHeightMm,
            }),
      }),
    );

    handleMaterialProfileSelection(materialProfileId);
    setSelectedRotaryPresetId(rotaryPresetId);
    setRotaryAutoPlacementEnabled(isRotary && Boolean(rotaryPresetId));
    bumpModelViewerResetKey();
    setSelectedTemplate(template);
    setMockupConfig(null);
    setFlatBedItemOverlay(null);
    setShowTemplateGallery(false);
    setShowCreateForm(false);
    setBgRemovalStatus("idle");

    // Compute engravable safe zone for rotary products.
    if (isRotary) {
      const fullWrapW = dims?.circumferenceMm ?? template.dimensions.templateWidthMm;
      const wrapMapping = template.dimensions.canonicalDimensionCalibration?.wrapMappingMm;
      const layout = getTumblerWrapLayout(template.dimensions.handleArcDeg);
      const frontCenterX = wrapMapping?.frontMeridianMm ?? (fullWrapW * layout.frontCenterRatio);
      const backCenterX = wrapMapping?.backMeridianMm ?? (layout.backCenterRatio == null ? null : fullWrapW * layout.backCenterRatio);
      const handleCenterX = wrapMapping?.handleMeridianMm ?? (layout.handleCenterRatio == null ? null : fullWrapW * layout.handleCenterRatio);

      let zoneW = Math.max(0, Math.min(dims?.printableWidthMm ?? fullWrapW, fullWrapW));
      if (zoneW <= 0) zoneW = fullWrapW;
      let zoneX = frontCenterX - zoneW / 2;
      if (zoneX < 0 || zoneX + zoneW > fullWrapW) {
        zoneX = 0;
        zoneW = fullWrapW;
      }
      const bodyTopMm = template.dimensions.bodyTopFromOverallMm ??
        template.dimensions.canonicalDimensionCalibration?.lidBodyLineMm ??
        0;
      const lidBoundaryY = printableSurface?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "lid")?.endMm;
      const rimBoundaryY = printableSurface?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "rim-ring")?.endMm;
      const zoneY = dims?.printableTopFromBodyTopMm ?? 0;
      const zoneH = dims?.printableHeightMm ?? Math.min(dims?.engravableHeightMm ?? template.dimensions.printHeightMm, template.dimensions.printHeightMm);
      setEngravableZone({
        x: zoneX,
        y: zoneY,
        width: zoneW,
        height: zoneH,
        printableTopY: zoneY,
        printableBottomY: (dims?.printableBottomFromBodyTopMm ?? (zoneY + zoneH)),
        lidBoundaryY: lidBoundaryY != null ? Math.max(0, lidBoundaryY - bodyTopMm) : null,
        rimBoundaryY: rimBoundaryY != null ? Math.max(0, rimBoundaryY - bodyTopMm) : null,
        printableDetectionWeak: dims?.automaticPrintableDetectionWeak,
        frontCenterX,
        backCenterX,
        leftQuarterX: wrapMapping?.leftQuarterMm ?? null,
        rightQuarterX: wrapMapping?.rightQuarterMm ?? null,
        handleCenterX,
        handleKeepOutStartX: wrapMapping?.handleKeepOutStartMm ?? null,
        handleKeepOutEndX: wrapMapping?.handleKeepOutEndMm ?? null,
        handleKeepOutWraps:
          wrapMapping?.handleKeepOutStartMm != null &&
          wrapMapping?.handleKeepOutEndMm != null &&
          wrapMapping.handleKeepOutStartMm > wrapMapping.handleKeepOutEndMm,
      });
    } else {
      setEngravableZone(null);
    }

    setToastMessage(`${template.name} loaded. Place your artwork.`);
  }, [
    bumpModelViewerResetKey,
    handleMaterialProfileSelection,
    normalizeBedConfig,
    setBedConfig,
    setBgRemovalStatus,
    setEngravableZone,
    setFlatBedItemOverlay,
    setMockupConfig,
    setRotaryAutoPlacementEnabled,
    setSelectedRotaryPresetId,
    setSelectedTemplate,
    setShowCreateForm,
    setShowTemplateGallery,
    setToastMessage,
  ]);

  const handleUpdateCalibration = useCallback((offsetX: number, offsetY: number, rotation: number) => {
    if (!selectedTemplate) return;

    const calXLimit = Math.max(15, Math.min(45, Math.round(bedConfig.width * 0.12)));
    const calYLimit = Math.max(10, Math.min(35, Math.round(bedConfig.height * 0.2)));
    const calRotLimit = 35;
    const clampCal = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const updatedMapping = {
      ...(selectedTemplate.tumblerMapping ?? {
        frontFaceRotation: 0,
        handleCenterAngle: Math.PI,
        handleArcDeg: 0,
        isMapped: false,
      }),
      calibrationOffsetX: clampCal(offsetX, -calXLimit, calXLimit),
      calibrationOffsetY: clampCal(offsetY, -calYLimit, calYLimit),
      calibrationRotation: clampCal(rotation, -calRotLimit, calRotLimit),
    };

    const updated = { ...selectedTemplate, tumblerMapping: updatedMapping };
    updateTemplate(updated.id, updated);
    setSelectedTemplate(updated);
  }, [bedConfig.height, bedConfig.width, selectedTemplate, setSelectedTemplate]);

  return {
    handleMaterialProfileSelection,
    handleTemplateSelect,
    handleUpdateCalibration,
  };
}
