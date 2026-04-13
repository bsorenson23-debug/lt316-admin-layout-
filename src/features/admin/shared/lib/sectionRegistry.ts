import type {
  AdminSectionRegistryContext,
  AdminSectionSnapshot,
  SectionDescriptor,
} from "../types";
import { EXPORT_BUNDLE_SECTION_DESCRIPTOR } from "../../job-readiness/lib/exportBundleSections.ts";
import { JOB_READINESS_SECTION_DESCRIPTOR } from "../../job-readiness/lib/jobReadinessSections.ts";
import { PREVIEW_SECTION_DESCRIPTOR } from "../../preview/lib/previewSections.ts";
import {
  TEMPLATE_DETECT_SECTION_DESCRIPTOR,
  TEMPLATE_REVIEW_SECTION_DESCRIPTOR,
  TEMPLATE_SOURCE_SECTION_DESCRIPTOR,
} from "../../template-editor/lib/templateEditorSections.ts";
import { WORKSPACE_SECTION_DESCRIPTOR } from "../../workspace/lib/workspaceSections.ts";

export const ADMIN_SECTION_REGISTRY: readonly SectionDescriptor[] = [
  TEMPLATE_SOURCE_SECTION_DESCRIPTOR,
  TEMPLATE_DETECT_SECTION_DESCRIPTOR,
  TEMPLATE_REVIEW_SECTION_DESCRIPTOR,
  WORKSPACE_SECTION_DESCRIPTOR,
  PREVIEW_SECTION_DESCRIPTOR,
  JOB_READINESS_SECTION_DESCRIPTOR,
  EXPORT_BUNDLE_SECTION_DESCRIPTOR,
] as const;

export function buildAdminSectionSnapshots(
  context: AdminSectionRegistryContext,
): AdminSectionSnapshot[] {
  return ADMIN_SECTION_REGISTRY.map((descriptor) => ({
    id: descriptor.id,
    owner: descriptor.owner,
    title: descriptor.title,
    status: descriptor.selectStatus(context),
    authority: descriptor.selectAuthority(context),
    summary: descriptor.selectSummary(context),
    testId: descriptor.testId,
    debug: descriptor.selectDebug(context),
  }));
}
