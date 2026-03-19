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
  linkedOrderId?: string;
}

export const EXPORT_HISTORY_KEY = "lt316_export_history";
export const EXPORT_HISTORY_MAX = 200;
