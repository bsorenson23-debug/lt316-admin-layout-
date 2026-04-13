"use client";

import React from "react";
import type { WorkspaceControllerInput, WorkspaceControllerState } from "../types.ts";
import { selectWorkspaceDerivedState, workspaceControllerReducer } from "../lib/workspaceController.ts";

export function useWorkspaceController(
  initialState: WorkspaceControllerState,
  input: WorkspaceControllerInput,
) {
  const [state, dispatch] = React.useReducer(workspaceControllerReducer, initialState);
  const derived = React.useMemo(
    () => selectWorkspaceDerivedState(state, input),
    [input, state],
  );

  React.useDebugValue({
    tumblerViewMode: state.tumblerViewMode,
    authority: derived.sectionState.authority,
    printableBandLabel: derived.sectionState.printableBandLabel,
    renderKey: derived.sectionState.renderKey,
  });

  return { state, dispatch, derived };
}
