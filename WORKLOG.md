# LT316 Admin — Work Log & Status Map

Last updated: 2026-03-23

---

## Legend

| Status | Meaning |
|--------|---------|
| DONE | Complete, polished, no known issues |
| WIRED | Functional and integrated but has rough edges |
| BUILT | Code exists and compiles but not yet wired into the UI |
| NEEDS ASSETS | Code is ready but waiting on external files |
| TODO | Not yet started |

---

## 1. Core Layout & Navigation

| Feature | Status | Files |
|---------|--------|-------|
| App shell (3-column layout) | DONE | `AdminLayoutShell.tsx`, `AdminMainPageShell.tsx` |
| Left / Center / Right panels | DONE | Rendered in `AdminLayoutShell.tsx` |
| Tab system (Workflow / Tools / Setup) | DONE | `AdminLayoutShell.tsx` |
| Calibration page | DONE | `app/admin/calibration/page.tsx`, `AdminCalibrationPage.tsx` |
| Home redirect (/ -> /admin) | DONE | `app/page.tsx` |

---

## 2. Laser Bed Canvas (Center Panel)

| Feature | Status | Files |
|---------|--------|-------|
| Konva stage with zoom/pan | DONE | `LaserBedWorkspace.tsx` |
| Bed background + grid | DONE | `LaserBedWorkspace.tsx` |
| Place/select/drag/resize/rotate items | DONE | `LaserBedWorkspace.tsx` |
| Origin marker + crosshair modes | DONE | `LaserBedWorkspace.tsx` |
| Tumbler wrap guides (front line, seam) | DONE | `LaserBedWorkspace.tsx` |
| Schematic overlay (dimension-based) | WIRED | `generateTumblerSchematic.ts`, `LaserBedWorkspace.tsx` |
| Photo overlay (product image) | WIRED | `overlayGenerator.ts`, `removeBlackBg.ts`, `LaserBedWorkspace.tsx` |
| Flat-bed item footprint overlay | DONE | `LaserBedWorkspace.tsx` |
| Mockup overlay (proof background) | DONE | `LaserBedWorkspace.tsx` |
| Laser simulator animation | BUILT | `LaserSimulatorOverlay.tsx` — not wired into shell |
| Video red dot calibration | BUILT | `videoRedDotAnalysis.ts` — no capture UI in shell |

---

## 3. SVG Asset Library (Left Panel)

| Feature | Status | Files |
|---------|--------|-------|
| Upload SVG files | DONE | `SvgAssetLibraryPanel.tsx` |
| Thumbnail grid | DONE | `SvgAssetLibraryPanel.tsx` |
| Quality analysis | DONE | `svgQualityCheck.ts` |
| "Make Laser Ready" | DONE | `svgLaserUtils.ts` |
| SVG path repair | DONE | `svgPathRepair.ts`, `SvgRepairPanel.tsx` — panel not in shell |
| Place / Replace / Remove | DONE | `SvgAssetLibraryPanel.tsx` |

---

## 4. Product Template System

| Feature | Status | Files |
|---------|--------|-------|
| Template gallery with filter | DONE | `TemplateGallery.tsx` |
| Create / edit / delete templates | DONE | `TemplateCreateForm.tsx` |
| Built-in seed templates | DONE | `builtInTemplates.ts` |
| Template select -> auto-apply dims | DONE | `AdminLayoutShell.tsx` `handleTemplateSelect` |
| Template thumbnails (base64) | DONE | `generateThumbnail.ts` |
| Product photo front/back capture | DONE | `TemplateCreateForm.tsx` |
| Mirror front for back | DONE | `TemplateCreateForm.tsx` |
| Manual BG removal button | WIRED | `TemplateCreateForm.tsx` — uses @imgly client-side |
| Tumbler mapping wizard (3D) | WIRED | `TumblerMappingWizard.tsx`, `TumblerPlacementView.tsx` |
| Tumbler mesh analysis | WIRED | `analyzeTumblerMesh.ts` |
| localStorage persistence | DONE | `templateStorage.ts` |

---

## 5. 3D Model Viewer

| Feature | Status | Files |
|---------|--------|-------|
| GLB/GLTF/STL/OBJ loading | DONE | `ModelViewer.tsx` |
| Physical mm scaling | DONE | `ModelViewer.tsx` |
| Auto-orient (axis correction) | DONE | `modelAxisCorrection.ts` |
| Cylindrical overlay (tumbler wrap) | DONE | `ModelViewer.tsx` |
| Flat overlay (flat-bed) | DONE | `ModelViewer.tsx` |
| Auto-rotate turntable | DONE | `ModelViewer.tsx` |
| Engravable zone rings | DONE | `ModelViewer.tsx` |
| Upload drop zone | DONE | `Model3DPanel.tsx` |
| Admin template picker grid | DONE | `Model3DPanel.tsx` |
| "Snap Design to 3D" | DONE | `Model3DPanel.tsx` |
| YETI Rambler 40oz model | DONE | `models/YetiRambler40oz.tsx` |
| GLB template library (12 slots) | NEEDS ASSETS | `glbTemplates.ts` — only `yeti-40oz-body.glb` exists |

---

## 6. AI / Vision Detection

| Feature | Status | Files |
|---------|--------|-------|
| Tumbler auto-detect (Claude Vision) | DONE | `TumblerAutoDetectPanel.tsx`, `server/tumbler/*` |
| Brand identification (scoring) | DONE | `identifyTumblerBrand.ts` |
| Tumbler spec lookup (mock catalog) | DONE | `searchTumblerSpecs.ts`, `mockCatalog.ts` |
| Tumbler spec lookup (remote) | BUILT | `searchTumblerSpecs.ts` — endpoint not configured |
| Flat-bed auto-detect (Claude Vision) | DONE | `FlatBedAutoDetectPanel.tsx`, `server/flatbed/*` |
| BiRefNet BG removal (Replicate) | DONE | API route works, needs `REPLICATE_API_TOKEN` |
| SAM2 segmentation (Replicate) | DONE | API route works, needs `REPLICATE_API_TOKEN` |

---

## 7. LightBurn Export

| Feature | Status | Files |
|---------|--------|-------|
| SVG export (mm units, absolute coords) | BUILT | `_unused/utils/lightBurnSvgExport.ts` — needs wiring |
| .lbrn native export | BUILT | `lightBurnLbrnExport.ts`, `svgToLbrnShapes.ts` — unclear if UI exposes |
| Rotary placement presets | DONE | `TumblerExportPanel.tsx`, `rotaryPlacementPresets.ts` |
| Export sidecar JSON | DONE | `TumblerExportPanel.tsx` |
| Path validation | DONE | `lightBurnPathSettings.ts`, API route |
| Calibration sequences | DONE | `lightBurnCalSequence.ts` |
| Export history (200 max, dedup) | DONE | `ExportHistoryPanel.tsx` |

---

## 8. Color & Material System

| Feature | Status | Files |
|---------|--------|-------|
| 20-color LightBurn layer editor | DONE | `ColorLayerPanel.tsx`, `laserLayer.ts` |
| Detect colors from SVG | DONE | `ColorLayerPanel.tsx` |
| Steel oxide CIELAB matching | DONE | `steelColorLookup.ts` |
| Material preset selection | DONE | `MaterialProfilePanel.tsx` |
| 60+ material presets | DONE | `laserMaterialPresets.ts` |
| Fiber color calibration (5-line) | DONE | `FiberColorCalibrationPanel.tsx`, `fiberColorCalc.ts` |
| Fiber color spectrum (12 entries) | DONE | `fiberColorSpectrum.ts` |

---

## 9. Rotary & Calibration

| Feature | Status | Files |
|---------|--------|-------|
| Rotary axis calibration | DONE | `rotaryCalibration.ts` |
| SPR calibration workflow | DONE | `SprCalibrationPanel.tsx` |
| Lens focal calibration | DONE | `LensCalibrationPanel.tsx` |
| Rotary center X resolution | DONE | `rotaryCenter.ts` |
| Rotary anchoring/offset | DONE | `rotaryAnchoring.ts` |
| Rotary base visual | DONE | `rotaryBaseVisual.ts` |
| Calibration mode switcher | DONE | `CalibrationModeSwitcher.tsx` |
| Calibration bed reference | DONE | `CalibrationBedReference.tsx` |
| Calibration overlay toggles | DONE | `CalibrationOverlayToggles.tsx` |
| Calibration export preview | DONE | `calibrationExportPreview.ts` |
| Rotary preset share (import/export) | DONE | `RotaryPresetSharePanel.tsx` |

---

## 10. Orders & Batch

| Feature | Status | Files |
|---------|--------|-------|
| Create/view orders | DONE | `OrdersPanel.tsx` |
| Order status transitions | DONE | `OrdersPanel.tsx` |
| Batch queue (group by model) | WIRED | `BatchQueuePanel.tsx` — basic grouping, full batch flow incomplete |

---

## 11. Tools & Extras

| Feature | Status | Files |
|---------|--------|-------|
| Text -> SVG path conversion | DONE | `TextToolPanel.tsx` |
| Variable text personalization | DONE | `TextPersonalizationPanel.tsx` |
| Camera overlay (live feed) | DONE | `CameraOverlayPanel.tsx` |
| Test grid patterns | DONE | `TestGridPanel.tsx` |
| Machine profile CRUD | DONE | `MachineProfilePanel.tsx` |
| Laser type selection | DONE | `LaserTypePanel.tsx` |
| Proof mockup panel | DONE | `ProofMockupPanel.tsx` |
| Selected item inspector | DONE | `SelectedItemInspector.tsx` |
| Bed settings (mode, dims, grid) | DONE | `BedSettingsPanel.tsx` |
| Flat-bed item quick-apply | DONE | `FlatBedItemPanel.tsx` |
| Staggered bed pattern | DONE | `staggeredBedPattern.ts` |
| Taper warp for artwork | DONE | `taperWarp.ts` |

---

## 12. Staged / Not Yet Wired (src/_unused/)

These are fully implemented but disconnected. See `src/_unused/INDEX.md` for wiring instructions.

| File | What It Does | Priority |
|------|-------------|----------|
| `lightBurnSvgExport.ts` | Build composite mm-unit SVG for LightBurn | HIGH — core export feature |
| `engravableDimensions.ts` | Compute printable zone from tumbler profile | MEDIUM |
| `removeBg.ts` | 3-tier bg removal fallback chain | LOW — manual button approach replaced this |
| `curvedPhotoOverlay.ts` | Cylindrical perspective photo distortion | LOW — schematic approach replaced this |
| `BedNudgeControl.tsx` | 3x3 directional nudge buttons | LOW |
| `CalibrationToolsToggle.tsx` | Link to calibration page | LOW |
| `RotaryOffsetPanel.tsx` | Full rotary preset manager | LOW — preset management exists elsewhere |
| `SplitAlignmentRail.tsx` | Split-screen alignment overlay | LOW |

---

## 13. Missing Assets

| Asset | Location | Needed By |
|-------|----------|-----------|
| 11 GLB template models | `public/models/templates/` | `glbTemplates.ts` (12 slots, 1 filled) |
| Template thumbnails | `public/models/thumbnails/` | Template cards (fall back to emoji) |
| `.env.example` | project root | Document `REPLICATE_API_TOKEN`, `ANTHROPIC_API_KEY` |

---

## 14. Priority Backlog

### P0 — Should wire next
- [ ] Wire `lightBurnSvgExport.ts` into TumblerExportPanel export button
- [ ] Expose `.lbrn` export option in UI (code exists in `lightBurnLbrnExport.ts`)
- [ ] Verify schematic overlay renders correctly on all tumbler sizes
- [ ] Complete batch queue workflow (multi-order -> single export)

### P1 — Nice to have
- [ ] Wire `LaserSimulatorOverlay.tsx` into shell (export preview animation)
- [ ] Wire `SvgRepairPanel.tsx` into Tools tab
- [ ] Add remaining GLB template models (11 of 12 missing)
- [ ] Add `.env.example` documenting all API keys
- [ ] Wire video red dot calibration UI into calibration page

### P2 — Polish
- [ ] Generate real PNG thumbnails for template cards
- [ ] Configure remote tumbler spec provider endpoint
- [ ] Improve batch queue with progress tracking
- [ ] Add template import/export (share between machines)
