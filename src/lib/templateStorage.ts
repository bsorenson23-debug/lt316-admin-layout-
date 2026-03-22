import type { ProductTemplate } from "@/types/productTemplate";
import { BUILT_IN_TEMPLATES } from "@/data/builtInTemplates";

const STORAGE_KEY = "lt316_product_templates";

function readStore(): ProductTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(templates: ProductTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Fail silently — quota exceeded or unavailable
  }
}

export function loadTemplates(): ProductTemplate[] {
  const stored = readStore();
  if (stored.length > 0) {
    const builtInById = new Map(BUILT_IN_TEMPLATES.map((t) => [t.id, t]));
    let changed = false;

    // Refresh existing built-in templates with latest source values
    const updated = stored.map((t) => {
      const source = builtInById.get(t.id);
      if (source && t.builtIn) {
        // Overwrite built-in fields from source (user cannot edit built-ins)
        changed = true;
        return { ...source };
      }
      return t;
    });

    // Add any new built-in templates not yet in storage
    const storedIds = new Set(updated.map((t) => t.id));
    const missing = BUILT_IN_TEMPLATES.filter((t) => !storedIds.has(t.id));
    if (missing.length > 0) {
      changed = true;
      updated.unshift(...missing);
    }

    if (changed) writeStore(updated);
    return updated;
  }
  // First load — seed with built-in templates
  writeStore(BUILT_IN_TEMPLATES);
  return [...BUILT_IN_TEMPLATES];
}

export function saveTemplate(t: ProductTemplate): void {
  const templates = loadTemplates();
  const idx = templates.findIndex((x) => x.id === t.id);
  if (idx >= 0) {
    templates[idx] = t;
  } else {
    templates.push(t);
  }
  writeStore(templates);
}

export function deleteTemplate(id: string): void {
  const templates = loadTemplates();
  const target = templates.find((t) => t.id === id);
  // Never delete built-in templates
  if (target?.builtIn) return;
  writeStore(templates.filter((t) => t.id !== id));
}

export function getTemplate(id: string): ProductTemplate | null {
  const templates = loadTemplates();
  return templates.find((t) => t.id === id) ?? null;
}

export function updateTemplate(
  id: string,
  patch: Partial<ProductTemplate>
): void {
  const templates = loadTemplates();
  const idx = templates.findIndex((t) => t.id === id);
  if (idx < 0) return;
  // Editing a built-in template makes it user-owned so the
  // built-in refresh logic in loadTemplates() won't overwrite it.
  templates[idx] = {
    ...templates[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
    builtIn: false,
  };
  writeStore(templates);
}
