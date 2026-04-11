import type { BodyReferenceViewSide, ProductReferenceImage } from "@/types/productTemplate";

export interface ResolveBodyReferenceViewSourceArgs {
  requestedViewSide: BodyReferenceViewSide;
  canAutoSyncFrontPhotoToBodyReference: boolean;
  bodyReferencePhotoDataUrl: string;
  frontCleanUrl: string;
  frontPhotoDataUrl: string;
  productPhotoFullUrl: string;
  backCleanUrl: string;
  backPhotoDataUrl: string;
  resolvedCanonicalBackReferencePhotoDataUrl: string;
  hasStrictCanonicalBack: boolean;
  hasAuxiliaryBack3q: boolean;
  mirrorForBack: boolean;
  backConfidence?: number | null;
}

export interface ResolvedBodyReferenceViewSource {
  hasRealBackTraceSource: boolean;
  activeBodyReferenceViewSide: BodyReferenceViewSide;
  bodyReferenceBackUnavailableReason: string | null;
  frontDisplayReferencePhotoDataUrl: string;
  frontReferencePhotoDataUrl: string;
  backDisplayReferencePhotoDataUrl: string;
  activeDisplayReferencePhotoDataUrl: string;
  activeReferencePhotoDataUrl: string;
}

export function isOrthographicBodyReferenceImage(
  image: ProductReferenceImage | null | undefined,
): boolean {
  if (!image) return false;
  if (image.viewClass !== "front") return false;
  return image.approxAzimuthDeg == null || image.approxAzimuthDeg === 0;
}

export function resolveBodyReferenceViewSource(
  args: ResolveBodyReferenceViewSourceArgs,
): ResolvedBodyReferenceViewSource {
  const frontDisplayReferencePhotoDataUrl =
    args.bodyReferencePhotoDataUrl ||
    args.frontCleanUrl ||
    args.frontPhotoDataUrl ||
    args.productPhotoFullUrl ||
    "";
  const frontReferencePhotoDataUrl = args.bodyReferencePhotoDataUrl
    ? args.bodyReferencePhotoDataUrl
    : args.canAutoSyncFrontPhotoToBodyReference
      ? (args.frontCleanUrl || args.frontPhotoDataUrl || args.productPhotoFullUrl || "")
      : "";
  const hasRealBackTraceSource = !args.mirrorForBack && Boolean(
    args.backCleanUrl ||
    args.backPhotoDataUrl ||
    args.resolvedCanonicalBackReferencePhotoDataUrl ||
    args.hasStrictCanonicalBack,
  );
  const activeBodyReferenceViewSide: BodyReferenceViewSide =
    args.requestedViewSide === "back" && hasRealBackTraceSource ? "back" : "front";
  const bodyReferenceBackUnavailableReason = hasRealBackTraceSource
    ? null
    : args.mirrorForBack
      ? "Mirror mode reuses the front image and does not count as a real Back trace source."
      : args.hasAuxiliaryBack3q
        ? `Only a back-3q advisory image is available (${Math.round((args.backConfidence ?? 0) * 100)}% confidence). Back tracing requires a true back photo.`
        : "Add a manual back photo or use a canonical true-back lookup image to enable Back tracing.";
  const backDisplayReferencePhotoDataUrl = args.mirrorForBack
    ? ""
    : (args.backCleanUrl || args.backPhotoDataUrl || args.resolvedCanonicalBackReferencePhotoDataUrl || "");
  const activeDisplayReferencePhotoDataUrl = activeBodyReferenceViewSide === "back"
    ? backDisplayReferencePhotoDataUrl
    : frontDisplayReferencePhotoDataUrl;
  const activeReferencePhotoDataUrl = activeBodyReferenceViewSide === "back"
    ? backDisplayReferencePhotoDataUrl
    : frontReferencePhotoDataUrl;

  return {
    hasRealBackTraceSource,
    activeBodyReferenceViewSide,
    bodyReferenceBackUnavailableReason,
    frontDisplayReferencePhotoDataUrl,
    frontReferencePhotoDataUrl,
    backDisplayReferencePhotoDataUrl,
    activeDisplayReferencePhotoDataUrl,
    activeReferencePhotoDataUrl,
  };
}
