"use client";

import React from "react";
import type { TemplateEditorControllerState } from "../types";
import { templateEditorControllerReducer } from "../lib/templateEditorController";

export function useTemplateEditorController(
  initialState: TemplateEditorControllerState,
) {
  const [state, dispatch] = React.useReducer(templateEditorControllerReducer, initialState);

  React.useDebugValue({
    activeStep: state.workflowStep,
    reviewAccepted: state.reviewAccepted,
    stagedDetectionPending: state.stagedDetectResult != null && !state.reviewAccepted,
    hasAcceptedDetectResult: state.acceptedDetectResult != null,
    hasDraftSnapshot: state.detectDraftSnapshot != null,
    detectError: state.detectError,
  });

  return { state, dispatch };
}
