import type { LightBurnExportPayload } from "./export";

export interface ExportHistoryMaterialSettingsSnapshot {
  label: string;
  powerPct: number;
  maxPowerPct: number;
  speedMmS: number;
  lpi: number;
  passes: number;
}

export interface ExportHistoryEntry {
  id: string;
  exportedAt: string;           // ISO timestamp
  tumblerBrand?: string;
  tumblerModel?: string;
  tumblerProfileId?: string;
  rotaryPresetId?: string;
  rotaryPresetName?: string;
  materialLabel?: string;
  templateWidthMm: number;
  templateHeightMm: number;
  /** SHA-1-like fingerprint of placed item SVG texts */
  artworkFingerprint: string;
  /** Placed item positions snapshot */
  itemsSnapshot: Array<{
    name: string;
    x: number; y: number;
    width: number; height: number;
    rotation: number;
  }>;
  exportOriginXmm: number;
  exportOriginYmm: number;
  exportPayloadSnapshot?: LightBurnExportPayload;
  materialSettingsSnapshot?: ExportHistoryMaterialSettingsSnapshot | null;
  linkedOrderId?: string;
  traceId?: string;
  sectionId?: string;
  runId?: string;
}

export const EXPORT_HISTORY_KEY = "lt316_export_history";
export const EXPORT_HISTORY_MAX = 200;
