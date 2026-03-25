# Unused — Ready to Wire

Files moved here are fully implemented but not connected to the app.
Move them back to their original paths when ready to integrate.

---

## Components

| File | Original Path | What It Does | To Wire Up |
|------|--------------|--------------|------------|
| `BedNudgeControl.tsx` | `components/admin/` | 3x3 arrow-key grid for nudging bed origin | Import into `BedSettingsPanel` or `SelectedItemInspector` |
| `CalibrationToolsToggle.tsx` | `components/admin/` | Button that links to `/admin/calibration` | Import into right panel Setup tab |
| `RotaryOffsetPanel.tsx` | `components/admin/` | Full rotary preset manager (form + list + preview) | Import into calibration page or Setup tab |
| `SplitAlignmentRail.tsx` | `components/admin/` | Split-screen alignment overlay for camera calibration | Import into `CalibrationWorkspace` |

## Libs

| File | Original Path | What It Does | To Wire Up |
|------|--------------|--------------|------------|
| `removeBg.ts` | `lib/` | 3-tier bg removal (@imgly client -> Replicate server -> original) | Call from "Remove BG" button in overlay controls |

## Utils

| File | Original Path | What It Does | To Wire Up |
|------|--------------|--------------|------------|
| `lightBurnSvgExport.ts` | `utils/` | `buildLightBurnExportSvg()` — builds composite mm-unit SVG for LightBurn import | **HIGH PRIORITY** — call from `TumblerExportPanel` export button |

## CSS Modules

| File | Pairs With |
|------|-----------|
| `CalibrationToolsToggle.module.css` | `CalibrationToolsToggle.tsx` |
| `RotaryOffsetPanel.module.css` | `RotaryOffsetPanel.tsx` |
| `SplitAlignmentRail.module.css` | `SplitAlignmentRail.tsx` |
