"use client";

/**
 * SvgRepairPanel
 *
 * Detects broken / problematic nodes in the selected SVG asset and offers
 * a one-click "Fix All" repair.  Embedded in SvgAssetLibraryPanel below
 * the Make-Laser-Ready button.
 */

import React, { useEffect, useState, useCallback } from "react";
import { analyzesvgPaths, repairSvgPaths, type PathRepairReport, type PathIssue } from "@/utils/svgPathRepair";

interface Props {
  /** Raw SVG string to analyse */
  svgContent: string;
  /** Called with the repaired SVG string after "Fix All" */
  onRepaired: (fixedSvgContent: string) => void;
}

const SEVERITY_STYLE: Record<PathIssue["severity"], React.CSSProperties> = {
  error: { color: "#ff6666", background: "#2a1a1a", borderColor: "#5a2a2a" },
  warn:  { color: "#ffaa44", background: "#2a1e0a", borderColor: "#5a3a10" },
  info:  { color: "#5ab0d0", background: "#0a1a2a", borderColor: "#1a4060" },
};

const SEVERITY_ICON: Record<PathIssue["severity"], string> = {
  error: "✖",
  warn:  "⚠",
  info:  "ℹ",
};

const ISSUE_TYPE_LABEL: Record<string, string> = {
  OPEN_PATH:          "Open path",
  NEAR_CLOSED_PATH:   "Near-closed path",
  DEGENERATE_SUBPATH: "Orphan moveto",
  DUPLICATE_PATH:     "Duplicate path",
  DUPLICATE_NODES:    "Duplicate nodes",
  TINY_SEGMENT:       "Tiny segment",
};

export function SvgRepairPanel({ svgContent, onRepaired }: Props) {
  const [report, setReport]   = useState<PathRepairReport | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [lastFixMsg, setLastFixMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Re-analyse whenever the SVG changes
  useEffect(() => {
    setReport(null);
    setLastFixMsg(null);
    const timer = setTimeout(() => {
      const r = analyzesvgPaths(svgContent);
      setReport(r);
    }, 80);
    return () => clearTimeout(timer);
  }, [svgContent]);

  const handleFixAll = useCallback(() => {
    setRepairing(true);
    setTimeout(() => {
      try {
        const result = repairSvgPaths(svgContent);
        const parts: string[] = [];
        if (result.closedCount)               parts.push(`Closed ${result.closedCount} path${result.closedCount !== 1 ? "s" : ""}`);
        if (result.removedDegenerateCount)    parts.push(`Removed ${result.removedDegenerateCount} orphan move${result.removedDegenerateCount !== 1 ? "s" : ""}`);
        if (result.removedDuplicatePathCount) parts.push(`Removed ${result.removedDuplicatePathCount} duplicate path${result.removedDuplicatePathCount !== 1 ? "s" : ""}`);
        if (result.removedDuplicateNodeCount) parts.push(`Removed ${result.removedDuplicateNodeCount} duplicate node${result.removedDuplicateNodeCount !== 1 ? "s" : ""}`);
        if (result.removedTinySegmentCount)   parts.push(`Removed ${result.removedTinySegmentCount} tiny segment${result.removedTinySegmentCount !== 1 ? "s" : ""}`);
        setLastFixMsg(parts.length > 0 ? parts.join(" · ") : "Nothing to fix.");
        onRepaired(result.fixed);
      } catch (e) {
        setLastFixMsg(`Repair failed: ${e instanceof Error ? e.message : "unknown error"}`);
      } finally {
        setRepairing(false);
      }
    }, 50);
  }, [svgContent, onRepaired]);

  if (!report) {
    return (
      <div style={{ padding: "4px 0", fontFamily: "monospace", fontSize: 10, color: "#444" }}>
        Analysing paths…
      </div>
    );
  }

  const hasIssues = report.issues.length > 0;
  const errorCount = report.issues.filter(i => i.severity === "error").length;
  const warnCount  = report.issues.filter(i => i.severity === "warn").length;

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>

      {/* ── Stats bar ── */}
      <div style={{
        display: "flex", gap: 6, flexWrap: "wrap",
        padding: "4px 6px", background: "#0a0a0a",
        border: "1px solid #1e1e1e", borderRadius: 4,
      }}>
        <Chip label="Paths"     value={report.pathCount} />
        <Chip label="Nodes"     value={report.nodeCount} />
        <Chip label="Subpaths"  value={report.subpathCount} />
        {errorCount > 0 && <Chip label="Errors" value={errorCount} accent="#ff6666" />}
        {warnCount > 0  && <Chip label="Warnings" value={warnCount}  accent="#ffaa44" />}
        {!hasIssues && (
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#4dbb6a" }}>✓ Clean</span>
        )}
      </div>

      {/* ── Fix All button ── */}
      {hasIssues && (
        <button
          type="button"
          onClick={handleFixAll}
          disabled={repairing || report.fixableCount === 0}
          style={{
            padding: "5px 10px", fontSize: 11, fontFamily: "monospace",
            background: repairing ? "#0a0a0a" : "#0a2a1a",
            border: `1px solid ${repairing ? "#222" : "#1a5a2a"}`,
            color: repairing ? "#444" : "#4dbb6a",
            borderRadius: 4, cursor: repairing ? "wait" : "pointer",
            textAlign: "left",
          }}
        >
          {repairing
            ? "⏳ Repairing…"
            : `🔧 Fix All (${report.fixableCount} fixable issue${report.fixableCount !== 1 ? "s" : ""})`
          }
        </button>
      )}

      {/* ── Last fix message ── */}
      {lastFixMsg && (
        <div style={{
          fontSize: 9, fontFamily: "monospace", padding: "3px 6px",
          background: "#0a2a1a", border: "1px solid #1a5a2a",
          color: "#4dbb6a", borderRadius: 3,
        }}>
          ✓ {lastFixMsg}
        </div>
      )}

      {/* ── Issues list ── */}
      {hasIssues && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            style={{
              padding: "2px 0", fontSize: 9, fontFamily: "monospace",
              background: "none", border: "none", color: "#555",
              cursor: "pointer", textAlign: "left",
            }}
          >
            {expanded ? "▾ Hide issues" : `▸ Show ${report.issues.length} issue${report.issues.length !== 1 ? "s" : ""}`}
          </button>

          {expanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {report.issues.map((issue, i) => (
                <div
                  key={i}
                  style={{
                    padding: "3px 7px",
                    border: `1px solid`,
                    borderRadius: 3,
                    fontSize: 9, fontFamily: "monospace",
                    ...SEVERITY_STYLE[issue.severity],
                  }}
                >
                  <span style={{ marginRight: 4 }}>{SEVERITY_ICON[issue.severity]}</span>
                  <strong>{ISSUE_TYPE_LABEL[issue.type] ?? issue.type}</strong>
                  {" — "}
                  {issue.message}
                  {!issue.fixable && <span style={{ marginLeft: 4, opacity: 0.6 }}>(manual fix required)</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <span style={{ fontSize: 9, fontFamily: "monospace", display: "flex", gap: 3, alignItems: "center" }}>
      <span style={{ color: "#555" }}>{label}</span>
      <span style={{ color: accent ?? "#bbb", fontWeight: "bold" }}>{value}</span>
    </span>
  );
}
