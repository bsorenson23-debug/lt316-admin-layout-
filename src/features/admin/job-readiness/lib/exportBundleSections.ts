import type { SectionDescriptor } from "../../shared/types";

export const EXPORT_BUNDLE_SECTION_DESCRIPTOR: SectionDescriptor = {
  id: "export.bundle",
  owner: "job-readiness",
  title: "Export Bundle",
  testId: "export-bundle-section",
  selectStatus: (context) => (context.exportBundle?.visible ? "ready" : "inactive"),
  selectAuthority: () => "export-runtime",
  selectSummary: (context) =>
    context.exportBundle?.printableBandLabel
      ? `Printable band ${context.exportBundle.printableBandLabel}`
      : "Export bundle unavailable",
  selectDebug: (context) => ({
    printableBandLabel: context.exportBundle?.printableBandLabel ?? null,
    selectedPresetLabel: context.exportBundle?.selectedPresetLabel ?? null,
    rotaryEnabled: context.exportBundle?.rotaryEnabled ?? false,
    outputFolderPath: context.exportBundle?.outputFolderPath ?? null,
  }),
};
