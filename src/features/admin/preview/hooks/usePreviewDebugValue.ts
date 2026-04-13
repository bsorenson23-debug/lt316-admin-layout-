"use client";

import React from "react";
import type { PreviewSectionState } from "../types";

export function usePreviewDebugValue(state: PreviewSectionState | null) {
  React.useDebugValue(
    state == null
      ? "preview-hidden"
      : {
          requestedMode: state.requestedMode,
          effectiveMode: state.effectiveMode,
          status: state.status,
          reason: state.reason,
        },
  );
}
