import type { TumblerSpecCandidate } from "../../types/tumblerAutoSize.ts";

interface MockTumblerEntry {
  id: string;
  tokens: string[];
  candidates: TumblerSpecCandidate[];
}

const MOCK_ENTRIES: MockTumblerEntry[] = [
  {
    id: "yeti-rambler-30",
    tokens: ["yeti", "rambler", "30"],
    candidates: [
      {
        title: "YETI Rambler 30 oz Tumbler - Product Details",
        url: "https://www.yeti.com/drinkware/tumblers/rambler-30oz-tumbler.html",
        kind: "official",
        brand: "YETI",
        model: "Rambler",
        capacityOz: 30,
        hasHandle: false,
        shapeType: "tapered",
        overallHeight: "7.9 in",
        topDiameter: "4.0 in",
        bottomDiameter: "2.75 in",
        snippet:
          "Height 7.9 in. Top diameter 4.0 in. Bottom diameter 2.75 in.",
        confidence: 0.93,
      },
      {
        title: "YETI Rambler 30 oz Tumbler Specs",
        url: "https://www.rei.com/product/yeti-rambler-30-oz",
        kind: "retailer",
        brand: "YETI",
        model: "Rambler",
        capacityOz: 30,
        hasHandle: false,
        overallHeight: "8 in",
        outsideDiameter: "4 in",
        snippet: "Product dimensions: 8 x 4 x 4 in.",
        confidence: 0.78,
      },
      {
        title: "YETI Rambler 30 oz Shipping Dimensions",
        url: "https://example.com/yeti-rambler-packaging",
        kind: "general",
        isPackaging: true,
        snippet: "Shipping box dimensions: 12 x 8 x 8 in.",
        confidence: 0.2,
      },
    ],
  },
  {
    id: "stanley-quencher-40",
    tokens: ["stanley", "quencher", "40"],
    candidates: [
      {
        title: "Stanley Quencher H2.0 FlowState Tumbler | 40 OZ",
        url: "https://www.stanley1913.com/products/adventure-quencher-travel-tumbler-40-oz",
        kind: "official",
        brand: "Stanley",
        model: "Quencher H2.0",
        capacityOz: 40,
        hasHandle: true,
        shapeType: "tapered",
        overallHeight: "12.5 in",
        topDiameter: "3.86 in",
        bottomDiameter: "2.95 in",
        snippet: "Height 12.5 in, top diameter 3.86 in, base diameter 2.95 in.",
        confidence: 0.94,
      },
      {
        title: "Stanley Quencher 40oz Specs",
        url: "https://www.target.com/p/stanley-quencher-40oz",
        kind: "retailer",
        brand: "Stanley",
        model: "Quencher",
        capacityOz: 40,
        hasHandle: true,
        overallHeight: "31.8 cm",
        outsideDiameter: "9.8 cm",
        snippet: "Product height 31.8 cm, width 9.8 cm.",
        confidence: 0.81,
      },
    ],
  },
  {
    id: "generic-20",
    tokens: ["20", "tumbler"],
    candidates: [
      {
        title: "Generic 20 oz Stainless Tumbler Specs",
        url: "https://example.com/generic-20oz-tumbler",
        kind: "general",
        brand: "Generic",
        model: "20oz Tumbler",
        capacityOz: 20,
        hasHandle: false,
        shapeType: "straight",
        overallHeight: "6.8 in",
        outsideDiameter: "3.4 in",
        snippet: "Height 6.8 in and diameter 3.4 in.",
        confidence: 0.54,
      },
    ],
  },
  {
    id: "rtic-road-trip-30",
    tokens: ["rtic", "road", "trip", "30"],
    candidates: [
      {
        title: "RTIC Road Trip Tumbler 30 oz",
        url: "https://rticoutdoors.com/Road-Trip-Tumbler",
        kind: "official",
        brand: "RTIC",
        model: "Road Trip Tumbler",
        capacityOz: 30,
        hasHandle: false,
        shapeType: "straight",
        overallHeight: "8.0 in",
        outsideDiameter: "3.8 in",
        snippet: "Dimensions: 8 in tall and 3.8 in diameter.",
        confidence: 0.9,
      },
      {
        title: "RTIC Road Trip Tumbler 30oz Specs",
        url: "https://www.rei.com/product/rtic-road-trip-30oz",
        kind: "retailer",
        brand: "RTIC",
        model: "Road Trip Tumbler",
        capacityOz: 30,
        hasHandle: false,
        overallHeight: "203 mm",
        outsideDiameter: "96 mm",
        snippet: "Height 203 mm, diameter 96 mm.",
        confidence: 0.75,
      },
    ],
  },
];

function scoreEntry(query: string, entry: MockTumblerEntry): number {
  const lowered = query.toLowerCase();
  return entry.tokens.reduce(
    (score, token) => score + (lowered.includes(token) ? 1 : 0),
    0
  );
}

export function lookupMockTumblerSpecs(query: string): TumblerSpecCandidate[] {
  const ranked = MOCK_ENTRIES.map((entry) => ({
    entry,
    score: scoreEntry(query, entry),
  })).sort((a, b) => b.score - a.score);

  if (ranked.length === 0 || ranked[0].score <= 0) {
    return [
      {
        title: "Fallback tumbler profile",
        url: "https://example.com/fallback-tumbler-specs",
        kind: "internal",
        brand: "Unknown",
        model: "Fallback Profile",
        capacityOz: null,
        hasHandle: null,
        shapeType: "unknown",
        overallHeight: "190 mm",
        outsideDiameter: "87 mm",
        snippet: "Fallback profile for local development.",
        confidence: 0.35,
      },
    ];
  }

  return ranked[0].entry.candidates;
}
