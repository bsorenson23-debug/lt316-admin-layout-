export type PreviewPerspectiveCameraMode =
  | "alignment-model"
  | "full-model"
  | "source-traced"
  | "body-cutout-qa";

export type PreviewPerspectiveCameraFitInput = {
  previewMode?: PreviewPerspectiveCameraMode;
  size: {
    x: number;
    y: number;
    z: number;
  };
  fovDeg: number;
  aspect: number;
};

export type PreviewPerspectiveCameraFit = {
  fitMargin: number;
  depthPadding: number;
  distance: number;
  visibleHeightAtFrontMm: number;
};

export function resolvePreviewPerspectiveCameraFit({
  previewMode,
  size,
  fovDeg,
  aspect,
}: PreviewPerspectiveCameraFitInput): PreviewPerspectiveCameraFit {
  const isFullPreview = previewMode === "full-model" || previewMode === "body-cutout-qa";
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const fov = (Math.max(1, fovDeg) * Math.PI) / 180;
  const tanHalfFov = Math.max(0.1, Math.tan(fov / 2));
  const fitDistanceHeight = (Math.max(0, size.y) / 2) / tanHalfFov;
  const fitDistanceWidth = (Math.max(0, size.x) / 2) / Math.max(0.1, tanHalfFov * safeAspect);
  const fitDistance = Math.max(fitDistanceHeight, fitDistanceWidth, 1);
  const fitMargin = isFullPreview ? 1.12 : 1.02;
  const depthPadding = Math.max(
    Math.max(0, size.z) * (isFullPreview ? 0.035 : 0.18),
    Math.max(0, size.y) * (isFullPreview ? 0.018 : 0.035),
    isFullPreview ? 4 : 8,
  );
  const frontDepthAllowance = isFullPreview ? Math.max(0, size.z) / 2 : 0;
  const distance = Math.max(
    (fitDistance * fitMargin) + frontDepthAllowance + depthPadding,
    (Math.max(0, size.z) / 2) + (isFullPreview ? 4 : 12),
  );
  const distanceAtFront = Math.max(0.1, distance - (Math.max(0, size.z) / 2));

  return {
    fitMargin,
    depthPadding,
    distance,
    visibleHeightAtFrontMm: 2 * distanceAtFront * tanHalfFov,
  };
}
