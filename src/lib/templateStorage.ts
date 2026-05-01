import type { ProductTemplate, ProductTemplateStore } from "../types/productTemplate.ts";
import { BUILT_IN_TEMPLATES } from "../data/builtInTemplates.ts";
import { normalizeProductTemplateModelTruth } from "./productTemplateModelLanes.ts";

const STORAGE_KEY = "lt316_product_templates";
const REMOVED_GLB_PATHS = new Set([
  "/models/templates/tumbler-30oz.glb",
]);

type InternalTemplateStore = ProductTemplateStore & {
  deletedBuiltInIds: string[];
  __needsWrite?: boolean;
};

const BUILT_IN_IDS = new Set(BUILT_IN_TEMPLATES.map((template) => template.id));

function emptyStore(): InternalTemplateStore {
  return {
    templates: [],
    lastUpdated: "",
    deletedBuiltInIds: [],
  };
}

function dedupeTemplates(templates: ProductTemplate[]): ProductTemplate[] {
  const byId = new Map<string, ProductTemplate>();
  templates.forEach((template) => byId.set(template.id, template));
  return [...byId.values()];
}

function normalizeStore(store: Partial<InternalTemplateStore>): InternalTemplateStore {
  const rawTemplates = Array.isArray(store.templates) ? dedupeTemplates(store.templates) : [];
  let sanitizedRemovedGlbPath = false;
  const normalizedTemplates = rawTemplates
    .filter((template) => !(BUILT_IN_IDS.has(template.id) && template.builtIn))
    .map((template) => {
      const removedGlbPath = template.glbPath && REMOVED_GLB_PATHS.has(template.glbPath);
      if (removedGlbPath) sanitizedRemovedGlbPath = true;
      return normalizeProductTemplateModelTruth({
        ...template,
        builtIn: false,
        glbPath: removedGlbPath ? "" : template.glbPath,
      });
    });

  return {
    templates: normalizedTemplates,
    lastUpdated: typeof store.lastUpdated === "string" ? store.lastUpdated : "",
    deletedBuiltInIds: Array.isArray(store.deletedBuiltInIds)
      ? [...new Set(store.deletedBuiltInIds.filter((id): id is string => typeof id === "string"))]
      : [],
    __needsWrite:
      store.__needsWrite ||
      normalizedTemplates.length !== rawTemplates.length ||
      rawTemplates.some((template) => template.builtIn) ||
      sanitizedRemovedGlbPath,
  };
}

function mergeBuiltInTemplate(
  source: ProductTemplate,
  override: ProductTemplate,
): ProductTemplate {
  return normalizeProductTemplateModelTruth({
    ...source,
    ...override,
    dimensions: {
      ...source.dimensions,
      ...override.dimensions,
    },
    laserSettings: {
      ...source.laserSettings,
      ...override.laserSettings,
    },
    builtIn: true,
  });
}

function readStore(): InternalTemplateStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();

    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return normalizeStore({
        templates: parsed.filter((template): template is ProductTemplate => (
          !!template &&
          typeof template === "object" &&
          typeof (template as ProductTemplate).id === "string"
        )),
        __needsWrite: true,
      });
    }

    if (parsed && typeof parsed === "object" && Array.isArray((parsed as ProductTemplateStore).templates)) {
      return normalizeStore(parsed as InternalTemplateStore);
    }

    return emptyStore();
  } catch {
    return emptyStore();
  }
}

function writeStore(store: InternalTemplateStore): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        templates: dedupeTemplates(store.templates),
        lastUpdated: new Date().toISOString(),
        deletedBuiltInIds: [...new Set(store.deletedBuiltInIds)],
      } satisfies ProductTemplateStore),
    );
  } catch {
    // Fail silently â€” quota exceeded or unavailable
  }
}

export function loadTemplates(): ProductTemplate[] {
  const store = readStore();
  const deletedBuiltInIds = new Set(store.deletedBuiltInIds);
  const storedById = new Map(store.templates.map((template) => [template.id, template]));

  const builtIns = BUILT_IN_TEMPLATES
    .filter((template) => !deletedBuiltInIds.has(template.id))
    .map((template) => {
      const override = storedById.get(template.id);
      return override ? mergeBuiltInTemplate(template, override) : normalizeProductTemplateModelTruth({ ...template });
    });

  const customTemplates = store.templates.filter((template) => !BUILT_IN_IDS.has(template.id));

  if (store.__needsWrite) {
    writeStore({
      ...store,
      templates: [...store.templates],
      deletedBuiltInIds: [...store.deletedBuiltInIds],
    });
  }

  return [...builtIns, ...customTemplates];
}

export function saveTemplate(template: ProductTemplate): void {
  const store = readStore();
  const nextTemplates = store.templates.filter((existing) => existing.id !== template.id);

  nextTemplates.push({
    ...normalizeProductTemplateModelTruth(template),
    builtIn: false,
  });

  writeStore({
    ...store,
    templates: nextTemplates,
    deletedBuiltInIds: store.deletedBuiltInIds.filter((id) => id !== template.id),
  });
}

export function deleteTemplate(id: string): void {
  const store = readStore();

  if (BUILT_IN_IDS.has(id)) {
    writeStore({
      ...store,
      templates: store.templates.filter((template) => template.id !== id),
      deletedBuiltInIds: [...new Set([...store.deletedBuiltInIds, id])],
    });
    return;
  }

  writeStore({
    ...store,
    templates: store.templates.filter((template) => template.id !== id),
  });
}

export function getTemplate(id: string): ProductTemplate | null {
  const templates = loadTemplates();
  return templates.find((template) => template.id === id) ?? null;
}

export function updateTemplate(
  id: string,
  patch: Partial<ProductTemplate>,
): void {
  const current = getTemplate(id);
  if (!current) return;

  const next: ProductTemplate = {
    ...current,
    ...patch,
    dimensions: patch.dimensions
      ? { ...current.dimensions, ...patch.dimensions }
      : current.dimensions,
    laserSettings: patch.laserSettings
      ? { ...current.laserSettings, ...patch.laserSettings }
      : current.laserSettings,
    updatedAt: new Date().toISOString(),
    builtIn: false,
  };

  saveTemplate(next);
}
