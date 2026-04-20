# Laser Bed Surface Mapping Plan

## Status

Proposed

## Goal

Plan how saved laser bed SVG artwork placements should map onto the 3D tumbler body preview without changing current app behavior.

This plan is not part of the current SVG optimization audit. It does not authorize geometry generation changes, BODY CUTOUT QA rule changes, or any rewrite of the reviewed body-only GLB pipeline.

## Why This Exists

The current BODY CUTOUT QA work now proves body-only runtime truth. That gives the app a reliable body mesh authority for QA.

The next related problem is different:

- operators place artwork on the 2D laser bed or template canvas
- saved placements already live in physical millimeter space
- the 3D viewer should preview that same saved placement on the tumbler body surface
- this preview must stay separate from BODY CUTOUT QA proof

The correct preview intent for that work is `wrap-export`, not `body-cutout-qa`.

## Non-Goals

- Do not change BODY CUTOUT QA validation.
- Do not merge artwork overlays into the body-only GLB.
- Do not regenerate the GLB for each artwork placement in v1.
- Do not make laser-bed artwork preview part of body contour proof.
- Do not bake silver rings or factory logos into the BODY CUTOUT QA GLB.
- Do not treat factory logos as user engraving artwork.
- Do not use ring or logo layers to determine the clean body outline.
- Do not let product appearance layers affect body-only QA pass or fail.
- Do not treat this plan as approval to implement centerline or mirror-body v2 work.

## Desired Workflow

1. User places SVG artwork on the laser bed or template canvas.
2. Template saves the artwork placement in millimeters.
3. The saved template keeps enough wrap/body mapping metadata to replay that placement later.
4. The 3D viewer opens in `wrap-export` preview intent.
5. The viewer renders the same SVG artwork at the corresponding body-surface location.
6. The artwork appears with an engraving-preview material that visually matches the app's silver engraving/rim treatment.
7. BODY CUTOUT QA remains body-only and does not treat the artwork overlay as geometry proof.

## Preview Intent Separation

- `body-cutout-qa`
  - proves body-only geometry truth
  - must ignore artwork overlay for validation
- `hybrid-preview`
  - may show body plus accessory context
  - is not proof of body contour correctness
- `wrap-export`
  - proves export-placement math and printable placement alignment
  - may show engraved-art preview on the body surface
  - is not the same thing as BODY CUTOUT QA

## Coordinate Systems

### 1. Laser bed 2D coordinates

- top-left origin
- X increases to the right
- Y increases downward
- units are millimeters
- this is the authoritative save/export placement space

### 2. Template artwork coordinates

- saved per placed SVG asset
- includes width, height, rotation, and position in millimeters
- may include document bounds and artwork bounds for rebasing

### 3. Body wrap coordinates

- flattened cylindrical or tapered printable surface
- X represents wrap distance around the body
- Y represents vertical position along printable height
- units remain millimeters

### 4. 3D body surface coordinates

- mesh-space coordinates on the loaded body mesh
- v1 should treat the body as cylindrical for placement preview
- later phases may project onto a derived tapered/profile-aware surface

### 5. Seam and front-center angle

- wrap mapping needs one stable seam definition
- front-center should remain explicit and not be inferred ad hoc
- v1 should document one canonical relationship:
  - `xMm = 0` aligns to the wrap seam
  - front-center is a fixed angle offset from the seam
- the chosen seam/front-center convention must match export math and any existing viewer front-face convention

## Factory Logo and Finish Band References

These references exist to provide orientation, finish context, and visual realism in preview without becoming body geometry truth or user-authored engraving.

### Factory logos

- the front factory logo establishes `frontCenterAngleDeg`
- the back factory logo maps to `frontCenterAngleDeg + 180 degrees`
- factory logos are product appearance references
- factory logos are not the same thing as user engraving artwork
- user SVG engraving overlay remains template artwork and must stay independently editable

### Finish bands

- top silver ring and bottom silver ring may define visual material bands in preview
- they may also define possible engraving keep-out references
- these are product appearance references, not body contour inputs

### Preview usage

- WRAP / EXPORT preview may render factory logos, finish bands, and user engraving overlay together
- the UI must label them clearly as different layer types
- BODY CUTOUT QA must ignore factory logos and finish bands completely

## Proposed Data Types

These are planning types only.

```ts
type SurfaceMappingMode =
  | "cylindrical-v1"
  | "profile-derived"
  | "unknown";

type MappingFreshness =
  | "fresh"
  | "stale"
  | "unknown";

type PreviewIntent =
  | "body-cutout-qa"
  | "hybrid-preview"
  | "wrap-export";

interface LaserBedArtworkPlacement {
  id: string;
  assetId: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  documentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  artworkBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface LaserBedSurfaceMapping {
  mappingMode: SurfaceMappingMode;
  wrapDiameterMm?: number;
  wrapWidthMm?: number;
  printableHeightMm?: number;
  expectedBodyWidthMm?: number;
  expectedBodyHeightMm?: number;
  bodyBoundsMm?: {
    width: number;
    height: number;
    depth: number;
  };
  scaleSource?: "physical-wrap" | "mesh-bounds" | "svg-viewbox" | "unknown";
  seamAngleDeg?: number;
  frontCenterAngleDeg?: number;
  sourceHash?: string;
  glbHash?: string;
  mappingSignature?: string;
  freshness?: MappingFreshness;
}

interface TemplateEngravingPreviewState {
  intent: PreviewIntent;
  bodyGeometryValidForQa: boolean;
  exportMappingValid: boolean;
  artworkPlacements: LaserBedArtworkPlacement[];
  mapping: LaserBedSurfaceMapping | null;
  warnings: string[];
  errors: string[];
}

interface EngravingPreviewMaterial {
  id: string;
  label: string;
  style: "engraving-preview-silver" | "frosted-etch" | "dark-etch";
  colorToken: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
}

interface FinishBandReference {
  id: string;
  kind: "top-silver-ring" | "bottom-silver-ring";
  yStartMm?: number;
  yEndMm?: number;
  colorHint?: "silver" | "gray";
  keepOutHint?: boolean;
  referenceOnly: true;
}

interface BrandLogoReference {
  id: string;
  side: "front" | "back";
  centerAngleDeg?: number;
  boundsMm?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  establishesFrontCenter?: boolean;
  referenceOnly: true;
}

interface ProductAppearanceReferenceLayer {
  id: string;
  kind:
    | "top-silver-ring"
    | "bottom-silver-ring"
    | "front-brand-logo"
    | "back-brand-logo";
  visible: boolean;
  finishBand?: FinishBandReference;
  brandLogo?: BrandLogoReference;
  usedForPreviewIntents: Array<"hybrid-preview" | "full-appearance-preview" | "wrap-export">;
}
```

## Mapping Math

### X millimeters to wrap angle

For cylindrical v1:

```ts
wrapCircumferenceMm = wrapWidthMm
normalizedWrap = xMm / wrapCircumferenceMm
angleRad = seamAngleRad + normalizedWrap * Math.PI * 2
```

Key constraints:

- use wrap width in millimeters, not viewBox width
- preserve the saved laser-bed X position directly
- keep front-center offset explicit rather than hiding it in camera assumptions

### Y millimeters to body height

For cylindrical v1:

```ts
normalizedHeight = yMm / printableHeightMm
meshHeightMm = expectedBodyHeightMm or bodyBoundsMm.height
surfaceY = topAnchorMm - normalizedHeight * meshHeightMm
```

The exact top/bottom anchor convention must be documented once and reused everywhere.

### Cylindrical v1 mapping

V1 should assume:

- body surface is approximately cylindrical
- wrap width is the authoritative circumference
- printable height is the authoritative vertical placement range
- body-only mesh is the render target
- overlay is separate from mesh geometry

This is acceptable for initial preview because it is cheap, deterministic, and aligned with export space.

### Future profile-derived mapping

Later work may:

- derive local radius from approved body profile or runtime body shell bounds
- project artwork more accurately on tapered bodies
- support non-uniform vertical radius changes
- preserve the same saved 2D laser-bed placement while improving 3D realism

That should be a later mapping mode, not part of v1 rollout.

## 3D Rendering Approach

### V1 rules

- do not regenerate the GLB for every artwork placement
- keep the reviewed body-only GLB unchanged
- render artwork as a texture, decal, or overlay on top of the body mesh
- keep artwork overlay separate from BODY CUTOUT QA body geometry
- keep product appearance references separate from both user engraving artwork and BODY CUTOUT QA geometry

### Preferred rendering model

V1 should render the artwork using one of:

- a cylindrical overlay mesh bound to wrap math
- a projected decal if distortion remains acceptable
- a dynamic texture mapped to a stable body-surface UV strategy

The important boundary is architectural:

- overlay rendering is preview-only
- body mesh remains the geometry authority

### Preview material

Use an `engraving-preview-silver` material that is visually close to the existing silver rim/engraving look:

- bright metallic silver base
- slightly roughened etched finish
- enough contrast to read artwork placement clearly
- not so reflective that placement becomes ambiguous

This material is visual only. It must not imply a physical laser result beyond a placement preview.

### Proposed appearance-layer color semantics

- top silver ring: silver / gray
- bottom silver ring: silver / gray
- front factory logo: solid white or violet
- back factory logo: dashed violet
- user engraving artwork: `engraving-preview-silver`
- body-truth layers remain green, blue, and cyan per the BODY REFERENCE v2 plan

## Save and Export Behavior

### Template save

Template save should eventually persist:

- placed SVG artwork in millimeter coordinates
- placement dimensions and rotation
- mapping signature
- wrap/body dimensions used to validate the preview

### Export behavior

Export remains driven by laser-bed millimeter coordinates.

The viewer should not become the export authority.

Instead:

- export uses saved 2D placement data
- viewer uses the same placement data plus mapping metadata to render a 3D preview

### Stale mapping detection

The mapping should become `stale` when any of these change materially:

- source SVG hash
- approved body source hash
- reviewed GLB hash
- front or back factory-logo reference hash or orientation anchor
- finish-band reference geometry
- wrap diameter or wrap width
- printable height
- expected body dimensions

Stale mapping should warn clearly and disable any claim that the 3D preview exactly matches export placement.

## Validation Rules

### Required fields for wrap/export preview

At minimum:

- `wrapDiameterMm`
- `wrapWidthMm`
- `printableHeightMm`
- `bodyBoundsMm` or another accepted body-height authority
- stable source/hash lineage for mapping freshness checks

### Preview warnings

- warn if artwork is partially or fully outside printable area
- warn if mapping freshness is `unknown`
- warn if mapping freshness is `stale`
- warn if body bounds are missing and only fallback wrap math is available
- warn if wrap dimensions and body dimensions disagree beyond tolerance
- warn if front or back factory-logo orientation references disagree with the saved mapping signature
- warn if finish-band references suggest likely engraving keep-out overlap

### Preview failures

- fail wrap/export validity if required dimensions are missing
- fail wrap/export validity if mapping signature is stale and exact preview is required
- fail if the body mesh needed for the overlay cannot be loaded

### QA separation rule

Never let `wrap-export` preview count as BODY CUTOUT QA proof.

Examples:

- BODY CUTOUT QA can pass while wrap/export preview is invalid
- wrap/export preview can be valid while BODY CUTOUT QA is not loaded
- hybrid/full preview can show accessory context without becoming QA-valid

## Proposed Inspector and Badge Reporting

The real UI should eventually expose:

### Badge

- `WRAP / EXPORT PREVIEW`
- export mapping status: `PASS / WARN / FAIL / UNKNOWN`
- mapping freshness: `Fresh / Stale / Unknown`
- explicit note: `Not BODY CUTOUT QA`

### Inspector

- wrap diameter
- wrap width
- printable height
- expected body width and height
- body bounds used for preview
- mapping mode
- seam/front-center settings
- front logo reference and back logo reference
- top and bottom finish-band references
- mapping signature
- freshness state
- artwork outside printable-area warnings

## Implementation Phases

### Phase 0: planning doc only

- write the plan
- confirm vocabulary and non-goals
- keep current app behavior unchanged

### Phase 1: data model and pure mapping helpers

- define placement and mapping types
- add pure conversion helpers for wrap-space and body-surface mapping
- add stale mapping signature helpers

### Phase 2: WRAP / EXPORT preview UI

- expose `wrap-export` as a first-class review intent
- show wrap/export validity and mapping freshness
- keep it visibly separate from BODY CUTOUT QA

### Phase 3: saved template artwork placement state

- persist artwork placements and mapping signature with the template
- reuse laser-bed millimeter coordinates as the placement source of truth

### Phase 4: 3D SVG overlay preview

- render saved artwork over the body mesh
- do not regenerate GLB
- keep overlay rendering separate from body-only geometry

### Product Appearance Reference Layers v1

- data model only
- editor layer display
- manual or detected ring and logo capture
- viewer rendering in hybrid, full / appearance, and wrap/export preview
- no BODY CUTOUT QA geometry changes

### Phase 5: engraving-preview material matching silver rim

- add the silver engraving preview material
- tune roughness, contrast, and readability
- keep this as preview rendering only

### Phase 6: production/export validation

- add mapping freshness checks
- add printable-area warnings
- validate export/viewer agreement
- harden real admin verification

## Risks

- seam/front-center conventions can drift if not formalized early
- cylindrical v1 mapping may look slightly off on strongly tapered products
- large SVGs may need careful rasterization/texture handling for performance
- operators may confuse wrap/export preview with BODY CUTOUT QA unless labels are explicit
- stale mapping can look visually plausible while still being mathematically wrong
- operators may confuse factory logos or finish bands with user engraving if the overlay legend is weak

## Recommended Acceptance Criteria for Future Implementation

- Template save preserves artwork placement in millimeters.
- WRAP / EXPORT preview renders the same saved placement on the 3D body.
- BODY CUTOUT QA remains body-only and unaffected by artwork overlay rendering.
- Stale mapping is detected when source hashes or wrap/body dimensions change.
- Inspector and badge clearly distinguish WRAP / EXPORT from BODY CUTOUT QA.

## Explicit Scope Reminder

This document is planning only.

It is not part of the current SVG optimization audit, and it should not change app behavior until a later implementation phase is explicitly approved.
