import type { GlbTemplate } from "@/data/glbTemplates";

type TemplateAvailabilityDescriptor = Pick<GlbTemplate, "id" | "glbPath" | "availabilityPolicy">;

const sessionAvailabilityCache = new Map<string, boolean>();

export function clearTemplateModelAvailabilityCache(): void {
  sessionAvailabilityCache.clear();
}

export function getCachedTemplateModelAvailability(glbPath: string): boolean | undefined {
  return sessionAvailabilityCache.get(glbPath);
}

export function setCachedTemplateModelAvailability(glbPath: string, available: boolean): void {
  sessionAvailabilityCache.set(glbPath, available);
}

export function isKnownMissingTemplatePlaceholder(
  template: Pick<GlbTemplate, "availabilityPolicy">,
): boolean {
  return template.availabilityPolicy === "known-missing-placeholder";
}

export function buildTemplateModelAvailabilitySeed(
  templates: TemplateAvailabilityDescriptor[],
): Record<string, boolean> {
  const seed: Record<string, boolean> = {};
  templates.forEach((template) => {
    if (isKnownMissingTemplatePlaceholder(template)) {
      seed[template.id] = false;
      return;
    }
    const cached = getCachedTemplateModelAvailability(template.glbPath);
    if (typeof cached === "boolean") {
      seed[template.id] = cached;
    }
  });
  return seed;
}

export function getTemplatesRequiringAvailabilityProbe(
  templates: TemplateAvailabilityDescriptor[],
): TemplateAvailabilityDescriptor[] {
  return templates.filter((template) => {
    if (isKnownMissingTemplatePlaceholder(template)) return false;
    return typeof getCachedTemplateModelAvailability(template.glbPath) !== "boolean";
  });
}
