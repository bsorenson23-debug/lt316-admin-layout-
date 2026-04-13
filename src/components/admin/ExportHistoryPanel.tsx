"use client";

import React from "react";
import type { ExportHistoryEntry } from "@/types/exportHistory";
import { EXPORT_HISTORY_KEY, EXPORT_HISTORY_MAX } from "@/types/exportHistory";
import type { PlacedItem } from "@/types/admin";
import { exportHistoryEntrySchema, parseExportHistoryEntries } from "@/lib/exportHistory.schema";
import { buildLightBurnLbrn, downloadLbrnFile } from "@/utils/lightBurnLbrnExport";
import styles from "./ExportHistoryPanel.module.css";

function loadHistory(): ExportHistoryEntry[] {
  try {
    return parseExportHistoryEntries(JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function saveHistory(entries: ExportHistoryEntry[]) {
  let trimmed = parseExportHistoryEntries(entries).slice(0, EXPORT_HISTORY_MAX);

  while (trimmed.length > 0) {
    try {
      localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(trimmed));
      return;
    } catch {
      if (trimmed.length === 1) break;
      trimmed = trimmed.slice(0, Math.max(1, Math.floor(trimmed.length / 2)));
    }
  }
}

/** Called by TumblerExportPanel after every successful export */
export function appendExportHistory(
  entry: Omit<ExportHistoryEntry, "id" | "exportedAt">,
): void {
  const current = loadHistory();
  const candidate: ExportHistoryEntry = {
    ...entry,
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    exportedAt: new Date().toISOString(),
  };
  const parsed = exportHistoryEntrySchema.safeParse(candidate);
  if (!parsed.success) {
    return;
  }
  const trimmed = [parsed.data as ExportHistoryEntry, ...current].slice(0, EXPORT_HISTORY_MAX);
  saveHistory(trimmed);
}

/** Derive a lightweight fingerprint from item SVG texts */
export function fingerprintItems(items: PlacedItem[]): string {
  const raw = items.map((i) => `${i.name}:${i.width.toFixed(1)}x${i.height.toFixed(1)}`).join("|");
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function ExportHistoryPanel() {
  const [open, setOpen] = React.useState(false);
  const [history, setHistory] = React.useState<ExportHistoryEntry[]>([]);
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    if (open) setHistory(loadHistory());
  }, [open]);

  const filtered = filter.trim()
    ? history.filter((entry) =>
        [entry.tumblerBrand, entry.tumblerModel, entry.materialLabel]
          .join(" ")
          .toLowerCase()
          .includes(filter.toLowerCase()),
      )
    : history;

  const handleReexport = (entry: ExportHistoryEntry) => {
    if (!entry.exportPayloadSnapshot) return;

    const name = `lt316-reexport-${entry.id.slice(-6)}`;
    downloadLbrnFile(
      buildLightBurnLbrn(
        entry.exportPayloadSnapshot,
        entry.materialSettingsSnapshot ?? undefined,
        undefined,
        { mode: "minimal" },
      ),
      `${name}.lbrn2`,
    );
  };

  const handleClearAll = () => {
    saveHistory([]);
    setHistory([]);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((value) => !value)} type="button">
        <span className={styles.toggleLabel}>
          Export History
          {history.length > 0 && !open && <span className={styles.countBadge}>{history.length}</span>}
        </span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {history.length > 0 && (
            <input
              className={styles.searchInput}
              placeholder="Filter by brand, model, material..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          )}

          {filtered.length === 0 && (
            <div className={styles.empty}>
              {history.length === 0
                ? "No exports recorded yet. Each .lbrn2 export is logged here automatically."
                : "No matches for that filter."}
            </div>
          )}

          {filtered.map((entry) => {
            const canReexport = Boolean(entry.exportPayloadSnapshot);

            return (
              <div key={entry.id} className={styles.entryCard}>
                <div className={styles.entryTop}>
                  <span className={styles.entryDate}>{formatDate(entry.exportedAt)}</span>
                  <button
                    className={styles.reexportBtn}
                    onClick={() => handleReexport(entry)}
                    title={
                      canReexport
                        ? "Re-export this configuration"
                        : "Exact re-export is only available for newer history entries"
                    }
                    disabled={!canReexport}
                  >
                    ↓ Re-export
                  </button>
                </div>
                <div className={styles.entryMeta}>
                  {entry.tumblerBrand && <span className={styles.chip}>{entry.tumblerBrand}</span>}
                  {entry.tumblerModel && <span className={styles.chip}>{entry.tumblerModel}</span>}
                  {entry.materialLabel && <span className={styles.chipMat}>{entry.materialLabel}</span>}
                </div>
                <div className={styles.entryDims}>
                  {entry.templateWidthMm.toFixed(1)}×{entry.templateHeightMm.toFixed(1)} mm
                  {" · "}
                  {entry.itemsSnapshot.length} item{entry.itemsSnapshot.length !== 1 ? "s" : ""}
                  {entry.rotaryPresetName && ` · ${entry.rotaryPresetName}`}
                </div>
                {!canReexport && (
                  <div className={styles.entryDims}>
                    Exact re-export is unavailable for older entries saved before snapshot history.
                  </div>
                )}
              </div>
            );
          })}

          {history.length > 0 && (
            <button className={styles.clearBtn} onClick={handleClearAll}>
              Clear History ({history.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
