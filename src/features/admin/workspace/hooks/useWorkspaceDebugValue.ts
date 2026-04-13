"use client";

import React from "react";
import type { WorkspaceSectionState } from "../types";

export function useWorkspaceDebugValue(state: WorkspaceSectionState | null) {
  React.useDebugValue(
    state == null
      ? "workspace-hidden"
      : {
          workspaceMode: state.workspaceMode,
          authority: state.authority,
          printableBandLabel: state.printableBandLabel,
          workspaceHeightMm: state.workspaceHeightMm,
        },
  );
}
