"use client";

import React from "react";
import type {
  AdminSectionId,
  AdminSectionRegistryContext,
  AdminSectionSnapshot,
  AdminTraceEnvelope,
} from "../types";
import { buildAdminSectionSnapshots } from "../lib/sectionRegistry";
import { createAdminTraceEnvelope } from "../lib/traceEnvelope";

function getCurrentSectionId(
  sections: AdminSectionSnapshot[],
  preferredSectionId: AdminSectionId | null,
): AdminSectionId | null {
  if (preferredSectionId && sections.some((section) => section.id === preferredSectionId)) {
    return preferredSectionId;
  }
  const activeSection =
    sections.find((section) => section.status === "action") ??
    sections.find((section) => section.status === "review") ??
    sections.find((section) => section.status === "ready");
  return activeSection?.id ?? null;
}

export function useAdminSectionDebug(args: {
  enabled: boolean;
  context: AdminSectionRegistryContext;
  preferredSectionId: AdminSectionId | null;
  traceId: string;
}): {
  currentSectionId: AdminSectionId | null;
  sections: AdminSectionSnapshot[];
  trace: AdminTraceEnvelope;
} {
  const sections = React.useMemo(
    () => buildAdminSectionSnapshots(args.context),
    [args.context],
  );
  const currentSectionId = React.useMemo(
    () => getCurrentSectionId(sections, args.preferredSectionId),
    [args.preferredSectionId, sections],
  );
  const trace = React.useMemo(
    () =>
      createAdminTraceEnvelope({
        traceId: args.traceId,
        currentSectionId,
        context: args.context,
      }),
    [args.context, args.traceId, currentSectionId],
  );

  React.useDebugValue(
    args.enabled
      ? {
          currentSectionId,
          traceId: trace.traceId,
          runId: trace.runId,
          sections: sections.map((section) => ({
            id: section.id,
            status: section.status,
            authority: section.authority,
          })),
        }
      : "debug-disabled",
  );

  return {
    currentSectionId,
    sections,
    trace,
  };
}
