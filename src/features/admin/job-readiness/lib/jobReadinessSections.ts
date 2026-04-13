import type { SectionDescriptor } from "../../shared/types";

export const JOB_READINESS_SECTION_DESCRIPTOR: SectionDescriptor = {
  id: "job.readiness",
  owner: "job-readiness",
  title: "Job Readiness",
  testId: "job-readiness-section",
  selectStatus: (context) => {
    if (!context.readiness?.visible) return "inactive";
    if (context.readiness.blockerCount > 0) return "action";
    if (context.readiness.warningCount > 0) return "review";
    return "ready";
  },
  selectAuthority: () => "readiness-selectors",
  selectSummary: (context) => context.readiness?.nextAction ?? "Readiness unavailable",
  selectDebug: (context) => ({
    blockerCount: context.readiness?.blockerCount ?? 0,
    warningCount: context.readiness?.warningCount ?? 0,
    nextAction: context.readiness?.nextAction ?? null,
    actionLabel: context.readiness?.actionLabel ?? null,
  }),
};
