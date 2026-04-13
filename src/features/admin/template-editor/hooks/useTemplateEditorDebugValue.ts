"use client";

import React from "react";
import type { TemplateEditorSectionState } from "../types";

export function useTemplateEditorDebugValue(state: TemplateEditorSectionState | null) {
  React.useDebugValue(
    state == null
      ? "template-editor-closed"
      : {
          activeStep: state.activeStep,
          reviewAccepted: state.reviewAccepted,
          stagedDetectionPending: state.stagedDetectionPending,
          runId: state.runId,
        },
  );
}
