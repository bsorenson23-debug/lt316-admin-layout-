import type { WorkspaceMode } from "@/types/admin";
import type { TumblerPrintableWorkspaceFrame } from "@/lib/tumblerPrintableWorkspace";
import type { TumblerWorkspacePhotoRegistration } from "@/lib/tumblerWorkspacePhotoRegistration";

export interface TumblerWorkspaceTruthState {
  printableBandSource: "body-reference-printable-band" | "body-shell-fallback" | "flat-bed";
  workspaceHeightSource: "body-reference-printable-band" | "body-shell-fallback" | "flat-bed";
  photoRegistrationSource: "canonical-front" | "legacy-fit" | "off";
  workspaceTruthLabel: string | null;
  previewTruthLabel: string | null;
  photoTruthLabel: string | null;
}

interface DeriveTumblerWorkspaceTruthStateArgs {
  workspaceMode: WorkspaceMode;
  workspaceFrame?: TumblerPrintableWorkspaceFrame | null;
  photoRegistrationMode?: TumblerWorkspacePhotoRegistration["mode"] | null;
  hasPhotoOverlay?: boolean;
}

export function deriveTumblerWorkspaceTruthState(
  args: DeriveTumblerWorkspaceTruthStateArgs,
): TumblerWorkspaceTruthState {
  if (args.workspaceMode !== "tumbler-wrap") {
    return {
      printableBandSource: "flat-bed",
      workspaceHeightSource: "flat-bed",
      photoRegistrationSource: "off",
      workspaceTruthLabel: null,
      previewTruthLabel: null,
      photoTruthLabel: null,
    };
  }

  const hasPrintableBand = Boolean(args.workspaceFrame?.hasPrintableBand);
  const printableBandSource = hasPrintableBand
    ? "body-reference-printable-band"
    : "body-shell-fallback";
  const workspaceHeightSource = printableBandSource;
  const photoRegistrationSource = args.hasPhotoOverlay
    ? (args.photoRegistrationMode ?? "legacy-fit")
    : "off";

  return {
    printableBandSource,
    workspaceHeightSource,
    photoRegistrationSource,
    workspaceTruthLabel: hasPrintableBand
      ? "Workspace sized from BODY REFERENCE printable band"
      : "Workspace sized from full body shell fallback",
    previewTruthLabel: "3D model is preview-only",
    photoTruthLabel:
      !args.hasPhotoOverlay
        ? null
        : photoRegistrationSource === "canonical-front"
          ? "Photo overlay sized from BODY REFERENCE calibration"
          : "Photo overlay is using legacy image fit",
  };
}
