"use client";

import React from "react";
import type { ExportBundleSectionState, JobReadinessSectionState } from "../types";

export function useJobReadinessDebugValue(
  readiness: JobReadinessSectionState | null,
  exportBundle: ExportBundleSectionState | null,
) {
  React.useDebugValue({
    blockers: readiness?.blockerCount ?? 0,
    warnings: readiness?.warningCount ?? 0,
    exportBand: exportBundle?.printableBandLabel ?? null,
    rotaryEnabled: exportBundle?.rotaryEnabled ?? false,
  });
}
