import { useCallback, useDebugValue } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { BedConfig, WorkspaceMode } from "@/types/admin";
import { getTemplateEffectiveCylinderDiameterMm, type ProductTemplate } from "@/types/productTemplate";
import type { ActiveMaterialSettings } from "../MaterialProfilePanel";
import type { BedMockupConfig, FlatBedItemOverlay } from "../LaserBedWorkspace";
import { getEngravableDimensions } from "@/lib/engravableDimensions";
import { deriveTumblerWorkspaceRuntimeState } from "@/lib/tumblerPrintableWorkspace";
import { normalizeProductTemplatePrintableSurface } from "@/lib/printableSurface";
import { updateTemplate } from "@/lib/templateStorage";

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
  setToastMessage,
  bumpModelViewerResetKey,
  buildMaterialSettings,
}: TemplateWorkflowParams) {
  useDebugValue({
    templateId: selectedTemplate?.id ?? null,
    workspaceMode: bedConfig.workspaceMode,
    materialProfileId: selectedTemplate?.laserSettings.materialProfileId ?? null,
  });

  const handleMaterialProfileSelection = useCallback((profileId: string) => {
    setSelectedMaterialProfileId(profileId);
    setMaterialSettings(buildMaterialSettings(profileId));
  }, [buildMaterialSettings, setMaterialSettings, setSelectedMaterialProfileId]);

  const handleTemplateSelect = useCallback((template: ProductTemplate) => {
    const normalizedTemplateResult = normalizeProductTemplatePrintableSurface(template);
    const activeTemplate = normalizedTemplateResult.template;
    if (normalizedTemplateResult.changed && !template.builtIn) {
      updateTemplate(activeTemplate.id, activeTemplate);
    }

    // Apply all dimensions at once via bedConfig.
    const isRotary = activeTemplate.productType === "tumbler" || activeTemplate.productType === "mug" || activeTemplate.productType === "bottle";
    const mode: WorkspaceMode = isRotary ? "tumbler-wrap" : "flat-bed";
    const effectiveCylinderDiameterMm = isRotary
      ? getTemplateEffectiveCylinderDiameterMm(activeTemplate)
      : activeTemplate.dimensions.diameterMm;
    const dims = isRotary ? getEngravableDimensions(activeTemplate) : null;
    const workspaceRuntime = isRotary && dims ? deriveTumblerWorkspaceRuntimeState(activeTemplate, dims) : null;
    const workspaceHeightMm =
      workspaceRuntime?.workspaceHeightMm ?? dims?.engravableHeightMm ?? activeTemplate.dimensions.printHeightMm;
    const usableHeightMm =
      workspaceRuntime?.usableHeightMm ??
      dims?.printableHeightMm ??
      workspaceHeightMm;
    const materialProfileId = activeTemplate.laserSettings.materialProfileId ?? "";
    const rotaryPresetId = activeTemplate.laserSettings.rotaryPresetId ?? "";

    setBedConfig((prev) =>
      normalizeBedConfig({
        ...prev,
        workspaceMode: mode,
        tumblerDiameterMm: effectiveCylinderDiameterMm,
        tumblerPrintableHeightMm: workspaceHeightMm,
        tumblerTemplateWidthMm: workspaceRuntime?.templateWidthMm ?? activeTemplate.dimensions.templateWidthMm,
        tumblerTemplateHeightMm: workspaceRuntime?.templateHeightMm ?? workspaceHeightMm,
        tumblerOverallHeightMm:
          activeTemplate.dimensions.overallHeightMm ??
          workspaceRuntime?.overallHeightMm ??
          dims?.totalHeightMm,
        ...(isRotary
          ? {
              tumblerOutsideDiameterMm: effectiveCylinderDiameterMm,
              tumblerUsableHeightMm: usableHeightMm,
            }
          : {
              flatWidth: activeTemplate.dimensions.templateWidthMm,
              flatHeight: activeTemplate.dimensions.printHeightMm,
            }),
      }),
    );

    handleMaterialProfileSelection(materialProfileId);
    setSelectedRotaryPresetId(rotaryPresetId);
    setRotaryAutoPlacementEnabled(isRotary && Boolean(rotaryPresetId));
    bumpModelViewerResetKey();
    setSelectedTemplate(activeTemplate);
    setMockupConfig(null);
    setFlatBedItemOverlay(null);
    setShowTemplateGallery(false);
    setShowCreateForm(false);
    setBgRemovalStatus("idle");

    setToastMessage(`${activeTemplate.name} loaded. Place your artwork.`);
  }, [
    bumpModelViewerResetKey,
    handleMaterialProfileSelection,
    normalizeBedConfig,
    setBedConfig,
    setBgRemovalStatus,
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
