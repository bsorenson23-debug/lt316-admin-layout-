"use client";

import React from "react";
import styles from "./PipelineDebugDrawer.module.css";

export interface PipelineDebugField {
  label: string;
  value: string;
  source?: string;
  formula?: string;
  confidence?: string;
  override?: string;
  warning?: string;
}

export interface PipelineDebugSection {
  id: string;
  title: string;
  defaultOpen?: boolean;
  fields: PipelineDebugField[];
  note?: string;
}

export interface PipelineDebugRawObject {
  id: string;
  label: string;
  value: unknown;
}

interface Props {
  title?: string;
  subtitle?: string;
  sections: PipelineDebugSection[];
  warnings?: string[];
  rawObjects?: PipelineDebugRawObject[];
  exportSummary?: string[];
  debugJson: unknown;
  formulas?: string[];
  compact?: boolean;
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [value]);

  return (
    <button type="button" className={styles.copyBtn} onClick={handleCopy}>
      {copied ? `${label} copied` : label}
    </button>
  );
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function PipelineDebugDrawer({
  title = "Pipeline Debug",
  subtitle,
  sections,
  warnings = [],
  rawObjects = [],
  exportSummary = [],
  debugJson,
  formulas = [],
  compact = false,
}: Props) {
  const jsonText = React.useMemo(() => stringify(debugJson), [debugJson]);
  const formulasText = React.useMemo(() => formulas.join("\n"), [formulas]);

  return (
    <details className={`${styles.drawer} ${compact ? styles.drawerCompact : ""}`}>
      <summary className={styles.summary}>
        <div className={styles.summaryText}>
          <div className={styles.title}>{title}</div>
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        <div className={styles.summaryMeta}>
          {warnings.length > 0 && <span className={styles.warningBadge}>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>}
          <span className={styles.chevron}>Open</span>
        </div>
      </summary>

      <div className={styles.actions}>
        <CopyButton label="Copy debug JSON" value={jsonText} />
        <CopyButton label="Copy formulas" value={formulasText || "No formulas"} />
      </div>

      {warnings.length > 0 && (
        <div className={styles.warningList}>
          {warnings.map((warning) => (
            <div key={warning} className={styles.warningItem}>{warning}</div>
          ))}
        </div>
      )}

      {exportSummary.length > 0 && (
        <div className={styles.summaryBlock}>
          {exportSummary.map((line) => (
            <div key={line} className={styles.summaryLine}>{line}</div>
          ))}
        </div>
      )}

      <div className={styles.sectionList}>
        {sections.map((section) => (
          <details key={section.id} className={styles.section} open={section.defaultOpen}>
            <summary className={styles.sectionTitle}>{section.title}</summary>
            <div className={styles.fieldList}>
              {section.fields.map((field) => (
                <div key={`${section.id}-${field.label}`} className={styles.field}>
                  <div className={styles.fieldHeader}>
                    <span className={styles.fieldLabel}>{field.label}</span>
                    <span className={styles.fieldValue}>{field.value}</span>
                  </div>
                  {(field.source || field.formula || field.confidence || field.override || field.warning) && (
                    <div className={styles.fieldMeta}>
                      {field.source ? <div><strong>source:</strong> {field.source}</div> : null}
                      {field.formula ? <div><strong>formula:</strong> {field.formula}</div> : null}
                      {field.confidence ? <div><strong>confidence:</strong> {field.confidence}</div> : null}
                      {field.override ? <div><strong>override:</strong> {field.override}</div> : null}
                      {field.warning ? <div className={styles.fieldWarning}><strong>warning:</strong> {field.warning}</div> : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {section.note ? <div className={styles.note}>{section.note}</div> : null}
          </details>
        ))}
      </div>

      {rawObjects.length > 0 && (
        <div className={styles.rawObjects}>
          {rawObjects.map((raw) => (
            <details key={raw.id} className={styles.rawObject}>
              <summary className={styles.rawObjectTitle}>{raw.label}</summary>
              <pre className={styles.rawObjectValue}>{stringify(raw.value)}</pre>
            </details>
          ))}
        </div>
      )}
    </details>
  );
}
