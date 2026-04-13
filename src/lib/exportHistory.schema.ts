import { z } from "zod";
import type { ExportHistoryEntry } from "@/types/exportHistory";

const finiteNumber = z.number().finite();

const exportHistoryMaterialSettingsSnapshotSchema = z.object({
  label: z.string(),
  powerPct: finiteNumber,
  maxPowerPct: finiteNumber,
  speedMmS: finiteNumber,
  lpi: finiteNumber,
  passes: finiteNumber,
}).passthrough();

export const exportHistoryEntrySchema = z.object({
  id: z.string().min(1),
  exportedAt: z.string().min(1),
  tumblerBrand: z.string().optional(),
  tumblerModel: z.string().optional(),
  tumblerProfileId: z.string().optional(),
  rotaryPresetId: z.string().optional(),
  rotaryPresetName: z.string().optional(),
  materialLabel: z.string().optional(),
  templateWidthMm: finiteNumber,
  templateHeightMm: finiteNumber,
  artworkFingerprint: z.string().min(1),
  itemsSnapshot: z.array(z.object({
    name: z.string(),
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber,
    height: finiteNumber,
    rotation: finiteNumber,
  }).passthrough()),
  exportOriginXmm: finiteNumber,
  exportOriginYmm: finiteNumber,
  exportPayloadSnapshot: z.unknown().optional(),
  materialSettingsSnapshot: exportHistoryMaterialSettingsSnapshotSchema.nullable().optional(),
  linkedOrderId: z.string().optional(),
  traceId: z.string().optional(),
  sectionId: z.string().optional(),
  runId: z.string().optional(),
}).passthrough();

export function parseExportHistoryEntries(value: unknown): ExportHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ExportHistoryEntry[] = [];
  for (const candidate of value) {
    const parsed = exportHistoryEntrySchema.safeParse(candidate);
    if (parsed.success) {
      entries.push(parsed.data as ExportHistoryEntry);
    }
  }
  return entries;
}
