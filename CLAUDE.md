# LT316 Admin — CLAUDE.md

This file documents the project for AI-assisted development. Only what exists in the code is described here.

---

## 1. What This App Does

LT316 Admin is a **laser engraving operator tool** built as a Next.js web app. It is used by a single operator (or small team) to:

- Manage a library of client SVG artwork files
- Place artwork on a virtual laser bed (flat sheet or tumbler wrap)
- Configure laser settings by material and machine type
- Detect tumbler product specs and flat-bed items from photos using Claude Vision
- Preview artwork placement in 2D and optionally 3D
- Export a properly-scaled SVG + sidecar JSON to import into LightBurn software
- Track past exports and link them to customer orders
- Calibrate rotary axis, bed origin, lens, and SPR (steps-per-rotation)

There is no user authentication. It is designed as a single-page admin tool, not a public-facing app.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| 2D Canvas | Konva 10 + react-konva 19 |
| 3D Viewer | Three.js 0.183, @react-three/fiber 9, @react-three/drei 10 |
| Vector ops | paper.js 0.12, @svgdotjs/svg.js 3.2 |
| AI / Vision | @anthropic-ai/sdk 0.80 (Claude Vision API) |
| BG Removal | @imgly/background-removal 1.7 (client-side WASM) |
| ML Inference | replicate 1.4 (BiRefNet BG removal, SAM2 segmentation) |
| Packaging | jszip 3.10 |
| Language | TypeScript 5, strict mode |
| Styling | CSS Modules + CSS custom properties (design tokens) |
| Testing | Node.js native test runner (`--experimental-strip-types`) |

**next.config.ts** transpiles `three`, enables async WebAssembly for @imgly, and uses Turbopack.

---

## 3. Folder Structure

```
src/
  app/
    page.tsx                     → redirects / to /admin
    admin/                       → main admin page (AdminMainPageShell)
    api/admin/
      tumbler/auto-size/         → POST: Claude Vision tumbler analysis
      flatbed/auto-detect/       → POST: Claude Vision flat-bed item detection
      flatbed/fetch-url/         → POST: proxy fetch image from URL
      image/remove-bg/           → POST: BiRefNet background removal (Replicate)
      image/segment/             → POST: SAM2 segmentation (Replicate)
      lightburn/validate-paths/  → GET: validate LightBurn file paths
    globals.css                  → design tokens, reset, base styles

  types/
    admin.ts                     → BedConfig, PlacedItem, SvgAsset, WorkspaceMode
    laserLayer.ts                → LaserLayer, LayerMode, LAYER_PALETTE
    tumblerAutoSize.ts           → AI result types, draft/state types
    machine.ts                   → MachineProfile, LaserType
    materials.ts                 → MaterialProfile, TumblerFinish
    export.ts                    → LightBurn export structs, RotaryPlacementPreset
    orders.ts                    → OrderRecord, OrderStatus
    laserProfile.ts              → LaserProfile, LaserSourceType, LaserLens
    exportHistory.ts             → ExportHistoryEntry

  data/
    laserMaterialPresets.ts      → 60+ material/laser presets
    materialProfiles.ts          → LPI/power/speed presets by laser wattage
    tumblerProfiles.ts           → 20+ known tumbler models with measurements
    rotaryPlacementPresets.ts    → D80C, D100C, RotoBoss Talon presets
    flatBedItems.ts              → 40+ flat bed catalog items
    glbTemplates.ts              → Admin-approved 3D model template list

  utils/
    geometry.ts                  → mm↔px, scale, clamp, snap, clampToBed
    alignment.ts                 → item centering, fit, opposite-logo logic
    svg.ts                       → parse SVG bounds, defaultPlacedSize, normalize
    svgLaserUtils.ts             → laser-readiness analysis, makeSvgLaserReady
    svgQualityCheck.ts           → quality/issue reporting
    svgPathRepair.ts             → fix malformed paths
    steelColorLookup.ts          → hex→CIELAB→steel oxide color matching
    tumblerAutoSize.ts           → post-process AI results, template calculation
    tumblerGuides.ts             → groove guide overlays, center-between-grooves
    taperWarp.ts                 → artwork warp for tapered tumbler shapes
    lightBurnSvgExport.ts        → build composite mm-unit SVG for LightBurn
    lightBurnLbrnExport.ts       → build LightBurn native .lbrn file
    svgToLbrnShapes.ts           → convert SVG paths to LightBurn shape objects
    lightBurnCalSequence.ts      → calibration sequences for export
    lightBurnPathSettings.ts     → validate LightBurn file/folder paths
    rotaryCalibration.ts         → rotary axis calibration math
    rotaryCenter.ts              → rotary center X resolution
    rotaryAnchoring.ts           → anchor/offset logic
    rotaryBaseVisual.ts          → visual rotary base measurements
    rotaryMode.ts                → rotary mode state helpers
    tumblerExportPlacement.ts    → auto-position items on tumbler export
    adminCalibrationState.ts     → calibration state machine
    calibrationModes.ts          → calibration mode switching
    calibrationWorkspaceState.ts → calibration workspace state
    calibrationBedReference.ts   → bed reference calibration
    calibrationExportPreview.ts  → calibration export preview
    staggeredBedPattern.ts       → staggered pattern generation
    lensCalibration.ts           → lens focal calibration
    laserProfileState.ts         → active laser/lens selection state
    guards.ts                    → isFiniteNumber type guard
    videoRedDotAnalysis.ts       → video frame analysis for red dot calibration

  server/
    tumbler/
      analyzeTumblerImage.ts     → filename-based fallback analysis
      claudeVisionAnalysis.ts    → Claude Vision API call for tumbler
      identifyTumblerBrand.ts    → scoring-based brand resolution
      searchTumblerSpecs.ts      → spec lookup (mock or remote provider)
      runTumblerAutoSize.ts      → orchestrator: image → spec → template
    flatbed/
      analyzeFlatBedWithVision.ts → Claude Vision API call for flat-bed items
      runFlatBedAutoDetect.ts     → orchestrator: image → item match → response

  components/admin/              → all UI panels (see Section 5)

public/
  models/templates/              → admin-placed .glb files for 3D templates
  models/thumbnails/             → optional .png thumbnails for template cards
```

---

## 4. Key Types

### `BedConfig` (admin.ts)
The central workspace configuration.

```ts
{
  workspaceMode: "flat-bed" | "tumbler-wrap"

  // Flat bed
  width: number            // active bed width in mm (computed by normalizeBedConfig)
  height: number           // active bed height in mm
  flatWidth: number
  flatHeight: number

  // Tumbler wrap
  tumblerDiameterMm: number
  tumblerPrintableHeightMm: number
  tumblerOverallHeightMm?: number
  tumblerTopDiameterMm?: number
  tumblerBottomDiameterMm?: number
  tumblerOutsideDiameterMm?: number
  tumblerUsableHeightMm?: number

  // Grid & guides
  gridSpacingMm: number
  snapToGrid: boolean
  showGrid: boolean
  showOriginMarker: boolean
  crosshairMode: "none" | "origin" | "center" | "both"
}
```

`normalizeBedConfig(config)` computes `width` and `height` based on mode:
- Flat bed: `width = flatWidth`, `height = flatHeight`
- Tumbler: `width = π × diameter` (or average diameter for tapered), `height = usable or printable height`

### `PlacedItem` (admin.ts)
An SVG asset instance placed on the bed.
```ts
{
  id: string
  assetId: string
  name: string
  svgText: string           // current SVG content (may be recolored)
  sourceSvgText: string     // original unmodified SVG
  documentBounds: Rect      // full SVG viewBox bounds in SVG units
  artworkBounds: Rect       // actual rendered content bounds
  x: number                 // mm from bed top-left
  y: number
  width: number             // mm
  height: number
  rotation: number          // degrees
  visible?: boolean
  defaults: { x, y, width, height, rotation }
}
```

### `LaserLayer` (laserLayer.ts)
LightBurn-compatible color-keyed layer.
```ts
{
  id: string
  color: string             // hex, from LAYER_PALETTE
  label: string
  enabled: boolean
  mode: "line" | "fill" | "offset-fill"
  speedMmMin: number
  powerPct: number
  passes: number
  // MOPA fiber extras:
  frequencyKhz?: number
  pulseWidthNs?: number
  // Raster extras:
  lineIntervalMm?: number
  crosshatch?: boolean
}
```

`LAYER_PALETTE` is the 20-color standard LightBurn palette: Black, Blue, Red, Green, Yellow, Cyan, Magenta, Orange, Purple, Dark Blue, Light Blue, Lime, Dark Red, Light Green, Light Yellow, Light Cyan, Light Magenta, Light Orange, Tan, White.

### `TumblerDimensions` (ModelViewer.tsx)
Used to scale the 3D model to real-world mm.
```ts
{
  overallHeightMm: number
  diameterMm: number
  topDiameterMm?: number
  bottomDiameterMm?: number
  printableHeightMm: number
}
```

---

## 5. Components

All components live in `src/components/admin/`. Each has a paired `.module.css`.

### Layout
| Component | Role |
|---|---|
| `AdminMainPageShell` | Top-level shell, renders the 3-column layout |
| `AdminLayoutShell` | All state + handler logic; renders LEFT / CENTER / RIGHT panels |
| `AdminCalibrationPage` | Calibration-mode full-screen workspace |

### LEFT Panel (inside `AdminLayoutShell`)
| Component | Role |
|---|---|
| `SvgAssetLibraryPanel` | Upload SVG files, thumbnail grid, quality analysis, "Make Laser Ready" button, place/remove |
| `TumblerAutoDetectPanel` | Upload tumbler photo → Claude Vision → parse specs → apply to bed config. **Only shown in tumbler-wrap mode.** |
| `FlatBedAutoDetectPanel` | Upload product photo → Claude Vision → match flat-bed catalog item → apply overlay. **Only shown in flat-bed mode.** |
| `Model3DPanel` | Drop zone for 3D model + admin template picker grid + 3D viewer toggle + "Snap Design to 3D" |
| `ModelViewer` | Three.js canvas; physical mm scaling when `tumblerDims` provided; cylindrical overlay for tumbler, flat overlay for flat-bed; auto-rotate turntable; engravable zone rings |

### CENTER Panel
| Component | Role |
|---|---|
| `LaserBedWorkspace` | Konva Stage; renders bed, placed items with transform handles, guides, mockup overlay, flat bed item footprint. Handles zoom (mouse wheel), pan (middle button / spacebar), drag to move, resize/rotate handles. |

### RIGHT Panel (3 tabs)
**Workflow tab:**
| Component | Role |
|---|---|
| `OrdersPanel` | Create/view customer orders, status transitions |
| `BatchQueuePanel` | Queue multiple orders |
| `BedSettingsPanel` | Mode toggle, dimensions, grid, origin settings |
| `MaterialProfilePanel` | Select material preset (CO₂/fiber/diode × finish × wattage) |
| `TumblerExportPanel` | Rotary preset selection, export SVG + sidecar JSON for LightBurn |
| `SelectedItemInspector` | Edit position/size/rotation, alignment buttons, reset, delete |
| `ProofMockupPanel` | Proof overlay on tumbler background image |
| `ExportHistoryPanel` | Past 200 exports with fingerprint deduplication |

**Tools tab:**
| Component | Role |
|---|---|
| `ColorLayerPanel` | 20-color layer editor; "Detect Colors" from SVG; "Smart Lookup" for stainless steel oxide MOPA presets |
| `FlatBedItemPanel` | Selected flat-bed item info + quick apply |
| `TextToolPanel` | Text → SVG path conversion |
| `TextPersonalizationPanel` | Variable text fields |
| `CameraOverlayPanel` | Live camera feed for alignment |
| `TestGridPanel` | Debug test grid patterns |

**Setup tab:**
| Component | Role |
|---|---|
| `MachineProfilePanel` | Create/select laser machine (type, wattage, bed size, rotary axis) |
| `FiberColorCalibrationPanel` | MOPA fiber color calibration — 5-line bracket test, per-machine profiles, offset multiplier |
| `SprCalibrationPanel` | SPR (steps-per-rotation) calibration workflow |
| `RotaryPresetSharePanel` | Export/import rotary presets |

### Calibration (separate page `/admin/calibration`)
`CalibrationModeSwitcher`, `CalibrationWorkspace`, `CalibrationBedReference`, `CalibrationOverlayToggles`, `LensCalibrationPanel`, `SprCalibrationPanel`, `RotaryPresetList`, `RotaryPresetForm`, `RotaryOffsetPanel`, `RotaryMeasurementGuide`, `RotaryPlacementPreview`, `SplitAlignmentRail`

---

## 6. State Management

**Single source of truth:** `AdminLayoutShell.tsx` holds all state with `useState` and passes values/callbacks as props. There is no global state library (no Redux, Zustand, Context).

**Persistent state (localStorage):**
- `lt316_machine_profiles` — `MachineProfile[]`
- `lt316_active_machine` — selected machine ID
- `lt316_laser_profiles` — `LaserProfile[]`
- `lt316_active_laser_id` / `lt316_active_lens_id`
- `lt316_export_history` — `ExportHistoryEntry[]` (max 200)

**Transient (in-component) state examples:**
- `selectedItemId`, `placementAssetId` — interaction mode flags
- `mockupConfig` — active tumbler background mockup overlay
- `flatBedItemOverlay` — footprint overlay for flat bed items
- `laserLayers[]` — initialized from `buildDefaultLayers()`, edited in place
- `framePreview` — LightBurn export frame visual

---

## 7. Domain-Specific Logic

### Tumbler Wrap Width
```
Straight tumbler:  width = π × outsideDiameterMm
Tapered tumbler:   width = π × ((topDiameterMm + bottomDiameterMm) / 2)
Fallback:          width = π × tumblerDiameterMm
```
Implemented in `normalizeBedConfig()` → `computeTumblerWrapWidthMm()`.

### Coordinate System
- Origin `(0, 0)` = **top-left** of bed
- X increases rightward, Y increases downward
- All measurements in **millimeters**
- Canvas rendering uses `mmToPx(mm, scale)` where `scale` = pixels per mm computed by `calcBedScale()`

### Artwork Bounds vs. Document Bounds
SVG files have two meaningful bounding boxes:
- **Document bounds** (`documentBounds`): the viewBox / width+height attributes — the full SVG canvas
- **Artwork bounds** (`artworkBounds`): the actual rendered content, measured by rendering off-screen and calling `getBBox()`

Placement math uses artwork bounds so items align visually, not by SVG canvas edges. `normalizeSvgToArtworkBounds()` rebases the viewBox to match the artwork.

### Alignment Modes
- `center-bed` — center artwork (not document) in both axes
- `center-x` / `center-y` — center in one axis only
- `fit-bed` — scale uniformly to fit, then center
- `opposite-logo` — shift X by `bedWidth / 2` (180° on tumbler = the other side)

### Color Matching for Stainless Steel (MOPA Fiber)
Used in `ColorLayerPanel` → `steelColorLookup.ts`:
1. Convert user hex color → RGB → XYZ → **CIELAB** (perceptually uniform)
2. Compare against 11 pre-calibrated steel oxide color targets (also in CIELAB)
3. Find closest using **ΔE CIE76** distance
4. Return MOPA laser preset (frequency kHz + pulse width ns + power/speed)

Steel oxide targets: Silver, Gold, Orange, Red, Purple, Dark Blue, Bright Blue, Teal, Green, Black, White/Ablate.

### SVG Laser Readiness
`analyzeSvgForLaser()` checks:
- Has fills (bad for cutting — should be stroke-only)
- Has text elements (should be converted to paths)
- Has strokes (good)
- Path count and estimated total path length in mm
- Returns `LaserAnalysis` with `isLaserReady` flag and warnings

`makeSvgLaserReady()` removes fills and ensures strokes only.

### Tumbler Brand Identification
`identifyTumblerBrand.ts` uses a scoring system:
- Known brands: YETI, Stanley, RTIC, Ozark Trail (with aliases)
- Brand score threshold: **0.64**, margin: **0.12**
- Visual score threshold: **0.56**, margin: **0.10**
- Logo confidence threshold: **0.88**
- Source priority: internal=1.0, official=0.88, retailer=0.64, general=0.34

### LightBurn SVG Export
`buildLightBurnExportSvg()` creates a composite SVG:
- Root SVG uses **mm units**
- Each placed item is a nested `<svg>` element at absolute mm coordinates
- Item `viewBox` scales the SVG content to match the mm dimensions
- This matches LightBurn's "Start From → Absolute Coords" workflow

### 3D Physical Scaling
`ModelViewer.tsx` — when `tumblerDims` is provided, **1 Three.js unit = 1 mm**:
- Load GLB/STL/OBJ → compute native bounding box
- `scale = overallHeightMm / nativeBoundingBoxHeight`
- Auto-orient: if Z-axis is tallest → rotate `[-π/2, 0, 0]`; if X-axis → `[0, 0, π/2]`
- Cylindrical overlay wraps design around tumbler at correct radius
- UV offset `0.75` centers the design on the front face (+Z, facing default camera)
- All camera/shadow/grid distances scale proportionally to `overallHeightMm`

### Tapered Tumbler Warp
`taperWarp.ts` — artwork is horizontally warped to account for the changing diameter so the design looks undistorted when viewed on the physical tapered surface.

### Fiber Laser Color Marking (MOPA)

Color on metal surfaces results from oxide layer interference. Oxide thickness is controlled by energy density:

```
ED (J/mm²) = Power (W) / (Speed (mm/s) × Line Spacing (mm))
```

**MOPA pulse width is always independent** — never derived from power or speed. This distinguishes MOPA from Q-switch for color work.

**Color spectrum** (12 entries, ordered by increasing ED):

| Color | ED range (J/mm²) | Hex |
|---|---|---|
| Bare metal | < 0.30 | #c8c8c8 |
| Pale straw | 0.30 – 0.60 | #eaddaa |
| Gold | 0.60 – 1.10 | #d4a017 |
| Bronze | 1.10 – 1.70 | #a06828 |
| Brown | 1.70 – 2.20 | #7a4520 |
| Purple | 2.20 – 3.00 | #7b5ea7 |
| Violet | 3.00 – 4.00 | #5040a0 |
| Dark blue | 4.00 – 5.50 | #1e3a6e |
| Blue | 5.50 – 7.00 | #2878c8 |
| Light blue | 7.00 – 9.00 | #5ab4d4 |
| Teal | 9.00 – 12.00 | #2a9d8f |
| Charcoal | > 12.00 | #383838 |

**5-line bracket calibration test:**
1. App generates 5 test lines from the machine's rated baseline
2. Line 3 = algorithm's best guess (center), lines 1–2 = cooler, 4–5 = hotter
3. Default sweep parameter: speed (most sensitive). Alternatives: power, pulse width
4. Step sizes: fine (5%), normal (10%), coarse (20%)
5. Speed adjustment: `adjustedSpeed = baseSpeed / (1 + offset × stepPct)` — divide because lower speed = more dwell = more energy
6. Operator runs all 5 lines physically, selects which produced the target color
7. `offsetMultiplier = 1 + (offset × stepPct)` applied to all future ED calculations

**Reverse lookup** (color → parameters):
```
correctedED = baseColorED × machine.offsetMultiplier
speed = machine.power_w / (correctedED × lineSpacing)
```

**Key files:**
- `src/types/fiberColor.ts` — `FiberMachineProfile`, `BracketTestLine`, `FiberBaseParams`
- `src/data/fiberColorSpectrum.ts` — `FIBER_COLOR_SPECTRUM` (12 entries)
- `src/utils/fiberColorCalc.ts` — `computeEnergyDensity`, `generateBracketTest`, `applyCalibration`, `getParamsForColor`, `buildCalibratedColorMapping`
- `src/components/admin/FiberColorCalibrationPanel.tsx` — calibration UI in Setup tab

**localStorage:** `lt316_fiber_profiles` (profiles), `lt316_active_fiber_id` (selected)

---

## 8. Design Decisions — Do Not Change

### CSS Tokens
**Never use raw hex values in module CSS files.** All colors must use CSS custom properties from `globals.css`:
- Surfaces: `var(--bg-base)`, `var(--bg-panel)`, `var(--bg-card)`, `var(--bg-elevated)`, `var(--bg-input)`, `var(--bg-hover)`
- Text: `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--text-dim)`
- Borders: `var(--border-subtle)`, `var(--border-normal)`, `var(--border-strong)`
- Accent: `var(--accent)`, `var(--accent-hover)`, `var(--accent-dim)`, `var(--accent-dark)`
- Semantic: `var(--success/warning/error/info)` each with `-bg` and `-border` variants

**Intentional exceptions:** The LaserBedWorkspace mode button active state uses specific blues (`#5a9fd4`, `#7dbfef`) because they represent a distinct interaction mode, not a semantic state. The warm amber origin chip colors in `LaserBedWorkspace.module.css` are intentional for visual distinction.

### Workspace Mode Gating
`TumblerAutoDetectPanel` is shown **only** in `tumbler-wrap` mode.
`FlatBedAutoDetectPanel` is shown **only** in `flat-bed` mode.
This is intentional — the two workflows are incompatible and must never be shown together.

### Blob URL Safety (React Strict Mode)
In `ModelViewer.tsx`, the blob URL for the 3D model file is created **inside a `useEffect`**, not in `useMemo`. This is required because React Strict Mode double-invokes effects and the cleanup would revoke the URL before Three.js loaders can fetch it. The Canvas is rendered `null` until the URL is set.

### No `Environment preset` in Three.js
`<Environment preset="studio">` makes a CDN fetch that fails offline/restricted networks. All lighting is manual: `hemisphereLight` + three `directionalLight` instances. Do not add `<Environment preset>` back.

### `frameloop="demand"` on Canvas
The Three.js Canvas uses `frameloop="demand"` — it only re-renders on user interaction or explicit `invalidate()`. This is intentional for performance in a tool UI. Do not change to `"always"`.

### Measurements Are Always MM
Internal domain coordinates are always millimeters. Pixel conversion only happens at the Konva rendering layer via `mmToPx(mm, scale)`. Never store pixel values in `PlacedItem`, `BedConfig`, or any domain type.

### LightBurn Color Palette Order
`LAYER_PALETTE` in `laserLayer.ts` is the exact 20-color LightBurn standard palette in LightBurn's native order. The order and hex values must not be changed — they map to LightBurn's internal color indices.

### Fiber Color Calibration
- Calibration **must** come from a physical 5-line test — never from a manually entered correction value.
- `offsetMultiplier` is applied at calculation time only — never persist corrected values as final. Always recompute from `baseED × multiplier`.
- Pulse width is always independent. Never derive it from power or speed.
- Each physical machine gets its own profile. Multi-machine is additive — selecting a machine swaps the active profile, all calculations update.
- Color predictions are approximate until calibrated. Always show calibration status (calibrated vs. uncalibrated) in the UI.
- Energy density is always J/mm². All measurements remain in mm.

---

## 9. API Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/tumbler/auto-size` | Accepts `multipart/form-data` with `image` field; calls Claude Vision; returns `TumblerAutoSizeResponse` |
| POST | `/api/admin/flatbed/auto-detect` | Accepts `multipart/form-data` with `image`; returns detected category, item, dimensions |
| POST | `/api/admin/flatbed/fetch-url` | Accepts `{ url }` JSON; proxies and returns image as base64 data URL |
| POST | `/api/admin/image/remove-bg` | Accepts `multipart/form-data` with `image`; calls Replicate BiRefNet; returns `{ dataUrl }` |
| POST | `/api/admin/image/segment` | Accepts `image` + `points` + `labels`; calls Replicate SAM2; returns `{ maskDataUrl }` |
| GET | `/api/admin/lightburn/validate-paths` | Validates LightBurn install/output paths on the server |
| POST | `/api/admin/models/upload` | Accepts `multipart/form-data` with `file` (GLB/GLTF); saves to `/public/models/templates/`; returns `{ path }` |

**Environment variables:**
```
ANTHROPIC_API_KEY              # Required for Vision features; gracefully degrades if missing
REPLICATE_API_TOKEN            # Required for BiRefNet and SAM2 endpoints
TUMBLER_SPEC_PROVIDER          # "mock" (default) or "remote"
TUMBLER_SPEC_SEARCH_ENDPOINT   # URL for remote tumbler spec lookup
TUMBLER_SPEC_SEARCH_API_KEY    # Optional API key for remote spec search
```

---

## 10. Test Suite

Tests use Node.js native test runner (`node --experimental-strip-types`). Run individually with:
```
npm run test:tumbler-auto-size
npm run test:tumbler-guides
npm run test:tumbler-identification
npm run test:tumbler-export-placement
npm run test:rotary-mode
npm run test:rotary-center
npm run test:rotary-anchoring
npm run test:rotary-base-visual
npm run test:calibration-export-preview
npm run test:admin-calibration
npm run test:calibration-workspace-state
npm run test:calibration-modes
npm run test:calibration-bed-reference
npm run test:staggered-bed-pattern
npm run test:lightburn-path-settings
npm run test:lightburn-path-validation
npm run test:fiber-color
```

---

## 11. What Is Not Yet Built / In Progress

- **3D Template GLB files** — `src/data/glbTemplates.ts` defines 12 template slots but the actual `.glb` files have not been placed in `/public/models/templates/`. The UI will show an error until files are added.
- **Template thumbnails** — `/public/models/thumbnails/` exists but is empty. Template cards fall back to emoji icons.
- **`SvgRepairPanel`** — component file exists but integration into the panel layout is not visible in the main shell.
- **`LaserSimulatorOverlay`** — component file exists but is not wired into the main shell.
- **Remote tumbler spec search** — `TUMBLER_SPEC_PROVIDER=remote` path is scaffolded but the actual remote endpoint is not documented and mock catalog is used by default.
- **Replicate integrations** — BiRefNet and SAM2 endpoints are implemented but require a `REPLICATE_API_TOKEN` that is not documented in any `.env.example`.
- **`.lbrn` native export** — `lightBurnLbrnExport.ts` and `svgToLbrnShapes.ts` exist but it is unclear whether the export UI exposes the `.lbrn` option or only SVG.
- **Batch queue** — `BatchQueuePanel` exists but the full batch processing workflow (multiple orders → single export run) appears incomplete.
- **TextToolPanel / TextPersonalizationPanel** — panels exist; depth of text-to-path conversion implementation is unclear.
- **VideoRedDotAnalysis** — `videoRedDotAnalysis.ts` exists for camera-based red dot calibration but the video capture UI integration is not visible in the main shell.

---

### ProductTemplate system (added March 2026)
Replaces manual per-job dimension/settings entry with a one-click
product catalog.

Storage: localStorage key "lt316_product_templates"
Types: src/types/productTemplate.ts
Storage service: src/lib/templateStorage.ts
Seed data: src/data/builtInTemplates.ts (do not modify glbTemplates.ts)
Thumbnail util: src/lib/generateThumbnail.ts
Components: TemplateGallery.tsx, TemplateCreateForm.tsx

When a template is selected via handleTemplateSelect():
- All TumblerDimensions fields update simultaneously
- Material profile and rotary preset are set automatically
- GLB model loads automatically
- Pre-flight goes from 4 failing checks to 1 (artwork only)

Thumbnails are stored as base64 PNG data URLs (120x120) inside
the template JSON in localStorage. No separate file serving needed.
Edit/delete rules:
- builtIn: true → read-only, no edit or delete controls shown
- builtIn: false → full edit (TemplateCreateForm in edit mode)
  and delete (with inline confirmation, no browser confirm())
- updateTemplate() sets builtIn: false — editing a built-in makes
  it user-owned so loadTemplates() won't overwrite it from source
- After editing the active template, re-run handleTemplateSelect
  with the updated data to keep workspace in sync

GLB files for templates are stored in /public/models/templates/.
Uploaded via POST /api/admin/models/upload (saves to local disk).
Path stored in ProductTemplate.glbPath (e.g. "/models/templates/yeti-rambler-40oz.glb").
Note: Vercel serverless does NOT persist writes to /public.
For production, this route needs to write to S3/R2/Supabase Storage.

Source of truth for tumbler specs: `src/data/tumblerProfiles.ts`.
ProductTemplate.dimensions should always be seeded from
tumblerProfiles.ts values, not from BedConfig defaults.
When adding new templates, check tumblerProfiles.ts first.

Example: YETI Rambler 40oz = diameter 104mm, printHeight 241mm
(the default BedConfig values of 87mm/145mm are fallbacks for
when no template or profile is loaded — not real product specs).
