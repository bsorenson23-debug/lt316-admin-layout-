import type {
  ProductTemplate,
  ProductTemplateAppearance,
  ProductTemplateAppearanceEntry,
  ProductTemplateAppearanceSource,
  ProductTemplateLidAppearanceEntry,
  ProductTemplateLidAppearanceSource,
  ProductTemplateRingFinish,
} from "@/types/productTemplate";

export interface TemplateAppearanceState {
  bodyColorHex: string;
  lidColorHex: string;
  rimColorHex: string;
  appearance: ProductTemplateAppearance;
}

export interface TemplateAppearanceSampleInput {
  bodyColorHex?: string | null;
  lidColorHex?: string | null;
  rimColorHex?: string | null;
}

export type TemplateAppearanceColorKey = "body" | "lid" | "rim";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const DEFAULT_TEMPLATE_BODY_COLOR_HEX = "#b0b8c4";
export const DEFAULT_TEMPLATE_RIM_COLOR_HEX = "#d0d0d0";
export const DEFAULT_TEMPLATE_RING_FINISH: ProductTemplateRingFinish = "metallic-silver";

function normalizeHexColor(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return undefined;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

function normalizeBodyAppearanceEntry(
  entry: ProductTemplateAppearanceEntry | null | undefined,
  effectiveHex: string,
): ProductTemplateAppearanceEntry {
  const source: ProductTemplateAppearanceSource = entry?.source === "manual" ? "manual" : "sampled";
  const sampledHex = normalizeHexColor(entry?.sampledHex) ?? (source === "sampled" ? effectiveHex : undefined);
  return {
    source,
    sampledHex,
  };
}

function normalizeLidAppearanceEntry(
  entry: ProductTemplateLidAppearanceEntry | null | undefined,
  effectiveHex: string,
  bodyHex: string,
): ProductTemplateLidAppearanceEntry {
  let source: ProductTemplateLidAppearanceSource =
    entry?.source === "manual" || entry?.source === "fallback-body" ? entry.source : "sampled";
  const normalizedSampledHex = normalizeHexColor(entry?.sampledHex);

  if (!entry) {
    source = effectiveHex === bodyHex ? "fallback-body" : "sampled";
  } else if (source === "fallback-body" && effectiveHex !== bodyHex && !normalizedSampledHex) {
    source = "sampled";
  }

  return {
    source,
    sampledHex:
      normalizedSampledHex ??
      (source === "sampled" ? effectiveHex : undefined),
  };
}

function normalizeRingFinish(value: ProductTemplateRingFinish | null | undefined): ProductTemplateRingFinish {
  return value === "tinted" ? "tinted" : DEFAULT_TEMPLATE_RING_FINISH;
}

export function hydrateTemplateAppearanceState(args: {
  bodyColorHex?: string | null;
  lidColorHex?: string | null;
  rimColorHex?: string | null;
  appearance?: ProductTemplateAppearance | null;
  defaultBodyColorHex?: string;
  defaultRimColorHex?: string;
}): TemplateAppearanceState {
  const bodyColorHex =
    normalizeHexColor(args.bodyColorHex) ??
    normalizeHexColor(args.defaultBodyColorHex) ??
    DEFAULT_TEMPLATE_BODY_COLOR_HEX;
  const inputLidColorHex =
    normalizeHexColor(args.lidColorHex) ??
    bodyColorHex;
  const rimColorHex =
    normalizeHexColor(args.rimColorHex) ??
    normalizeHexColor(args.defaultRimColorHex) ??
    DEFAULT_TEMPLATE_RIM_COLOR_HEX;
  const normalizedLidAppearance = normalizeLidAppearanceEntry(args.appearance?.lid, inputLidColorHex, bodyColorHex);
  const lidColorHex = normalizedLidAppearance.source === "fallback-body"
    ? bodyColorHex
    : inputLidColorHex;

  return {
    bodyColorHex,
    lidColorHex,
    rimColorHex,
    appearance: {
      body: normalizeBodyAppearanceEntry(args.appearance?.body, bodyColorHex),
      lid: normalizedLidAppearance,
      rim: normalizeBodyAppearanceEntry(args.appearance?.rim, rimColorHex),
      ringFinish: normalizeRingFinish(args.appearance?.ringFinish),
    },
  };
}

export function applySampledTemplateAppearance(
  state: TemplateAppearanceState,
  sample: TemplateAppearanceSampleInput,
): TemplateAppearanceState {
  const nextBodySample = normalizeHexColor(sample.bodyColorHex);
  const nextLidSample = normalizeHexColor(sample.lidColorHex);
  const nextRimSample = normalizeHexColor(sample.rimColorHex);

  const next: TemplateAppearanceState = {
    bodyColorHex: state.bodyColorHex,
    lidColorHex: state.lidColorHex,
    rimColorHex: state.rimColorHex,
    appearance: {
      body: { ...state.appearance.body },
      lid: { ...state.appearance.lid },
      rim: { ...state.appearance.rim },
      ringFinish: normalizeRingFinish(state.appearance.ringFinish),
    },
  };

  if (nextBodySample) {
    next.appearance.body.sampledHex = nextBodySample;
    if (next.appearance.body.source !== "manual") {
      next.bodyColorHex = nextBodySample;
      next.appearance.body.source = "sampled";
    }
  }

  if (nextLidSample) {
    next.appearance.lid.sampledHex = nextLidSample;
    if (next.appearance.lid.source !== "manual") {
      next.lidColorHex = nextLidSample;
      next.appearance.lid.source = "sampled";
    }
  } else if (next.appearance.lid.source === "fallback-body") {
    next.lidColorHex = next.bodyColorHex;
  }

  if (nextRimSample) {
    next.appearance.rim.sampledHex = nextRimSample;
    if (next.appearance.rim.source !== "manual") {
      next.rimColorHex = nextRimSample;
      next.appearance.rim.source = "sampled";
    }
  }

  return hydrateTemplateAppearanceState(next);
}

export function applyManualTemplateAppearanceColor(
  state: TemplateAppearanceState,
  key: TemplateAppearanceColorKey,
  colorHex: string | null | undefined,
): TemplateAppearanceState {
  const normalizedColorHex = normalizeHexColor(colorHex);
  if (!normalizedColorHex) {
    return hydrateTemplateAppearanceState(state);
  }

  const next: TemplateAppearanceState = {
    bodyColorHex: state.bodyColorHex,
    lidColorHex: state.lidColorHex,
    rimColorHex: state.rimColorHex,
    appearance: {
      body: { ...state.appearance.body },
      lid: { ...state.appearance.lid },
      rim: { ...state.appearance.rim },
      ringFinish: normalizeRingFinish(state.appearance.ringFinish),
    },
  };

  if (key === "body") {
    next.bodyColorHex = normalizedColorHex;
    next.appearance.body.source = "manual";
    if (next.appearance.lid.source === "fallback-body") {
      next.lidColorHex = normalizedColorHex;
    }
  } else if (key === "lid") {
    next.lidColorHex = normalizedColorHex;
    next.appearance.lid.source = "manual";
  } else {
    next.rimColorHex = normalizedColorHex;
    next.appearance.rim.source = "manual";
  }

  return hydrateTemplateAppearanceState(next);
}

export function applyUseSampledTemplateAppearanceColor(
  state: TemplateAppearanceState,
  key: TemplateAppearanceColorKey,
): TemplateAppearanceState {
  const next: TemplateAppearanceState = {
    bodyColorHex: state.bodyColorHex,
    lidColorHex: state.lidColorHex,
    rimColorHex: state.rimColorHex,
    appearance: {
      body: { ...state.appearance.body },
      lid: { ...state.appearance.lid },
      rim: { ...state.appearance.rim },
      ringFinish: normalizeRingFinish(state.appearance.ringFinish),
    },
  };

  if (key === "body" && next.appearance.body.sampledHex) {
    next.bodyColorHex = next.appearance.body.sampledHex;
    next.appearance.body.source = "sampled";
    if (next.appearance.lid.source === "fallback-body") {
      next.lidColorHex = next.bodyColorHex;
    }
  } else if (key === "lid" && next.appearance.lid.sampledHex) {
    next.lidColorHex = next.appearance.lid.sampledHex;
    next.appearance.lid.source = "sampled";
  } else if (key === "rim" && next.appearance.rim.sampledHex) {
    next.rimColorHex = next.appearance.rim.sampledHex;
    next.appearance.rim.source = "sampled";
  }

  return hydrateTemplateAppearanceState(next);
}

export function applyTemplateRingFinish(
  state: TemplateAppearanceState,
  ringFinish: ProductTemplateRingFinish,
): TemplateAppearanceState {
  return hydrateTemplateAppearanceState({
    ...state,
    appearance: {
      ...state.appearance,
      ringFinish: normalizeRingFinish(ringFinish),
    },
  });
}

export function hydrateProductTemplateAppearance(template: ProductTemplate): ProductTemplate {
  const hydratedAppearanceState = hydrateTemplateAppearanceState({
    bodyColorHex: template.dimensions.bodyColorHex,
    lidColorHex: template.dimensions.lidColorHex,
    rimColorHex: template.dimensions.rimColorHex,
    appearance: template.appearance,
  });

  return {
    ...template,
    dimensions: {
      ...template.dimensions,
      bodyColorHex: hydratedAppearanceState.bodyColorHex,
      lidColorHex: hydratedAppearanceState.lidColorHex,
      rimColorHex: hydratedAppearanceState.rimColorHex,
    },
    appearance: hydratedAppearanceState.appearance,
  };
}
