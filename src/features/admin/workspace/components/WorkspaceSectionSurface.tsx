"use client";

import React from "react";
import type { AdminSectionSnapshot } from "../../shared/types";
import { AdminSectionSurface } from "../../shared";

interface Props {
  snapshot: AdminSectionSnapshot;
  debugEnabled?: boolean;
  children: React.ReactNode;
}

export function WorkspaceSectionSurface({
  snapshot,
  debugEnabled = false,
  children,
}: Props) {
  return (
    <AdminSectionSurface snapshot={snapshot} debugEnabled={debugEnabled}>
      {children}
    </AdminSectionSurface>
  );
}
