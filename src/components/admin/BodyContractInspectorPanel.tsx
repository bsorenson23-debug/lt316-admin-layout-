"use client";

import React from "react";
import { usePathname } from "next/navigation";
import type {
  BodyGeometryContract,
  BodyGeometryRuntimeInspectionValueSource,
  BodyGeometryValidationStatus,
} from "@/lib/bodyGeometryContract";
import type { BodyGeometryAuditArtifactLike } from "@/lib/bodyGeometryDebugReport";
import {
  buildBodyGeometryDebugReport,
  buildBodyGeometryDebugReportFileName,
} from "@/lib/bodyGeometryDebugReport";
import {
  buildWrapExportPreviewState,
  getWrapExportMappingStatusLabel,
  getWrapExportPreviewStatusLabel,
} from "@/lib/wrapExportPreviewState";
import packageJson from "../../../package.json";
import styles from "./BodyContractInspectorPanel.module.css";

interface BodyContractInspectorPanelProps {
  contract: BodyGeometryContract | null;
  auditArtifact?: BodyGeometryAuditArtifactLike | null;
}

function shortenHash(value: string | undefined): string {
  if (!value) return "n/a";
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatBoolean(value: boolean | undefined): string {
  if (typeof value !== "boolean") return "unknown";
  return value ? "yes" : "no";
}

function formatFreshness(value: boolean | undefined): string {
  if (typeof value !== "boolean") return "unknown";
  return value ? "fresh" : "stale";
}

function formatNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "n/a";
}

function formatScaleSource(
  value: BodyGeometryContract["dimensionsMm"]["scaleSource"] | undefined,
): string {
  switch (value) {
    case "svg-viewbox":
      return "svg-viewbox";
    case "lookup-diameter":
      return "lookup-diameter";
    case "physical-wrap":
      return "physical-wrap";
    case "mesh-bounds":
      return "mesh-bounds";
    default:
      return "unknown";
  }
}

function formatInspectionValueSource(
  value: BodyGeometryRuntimeInspectionValueSource | undefined,
): string {
  switch (value) {
    case "runtime-inspection":
      return "runtime-inspection";
    case "audit-provisional":
      return "audit-provisional";
    default:
      return "unavailable";
  }
}

function formatAuditArtifactState(contract: BodyGeometryContract | null, auditArtifact: BodyGeometryAuditArtifactLike | null): string {
  if (contract?.runtimeInspection?.auditArtifactPresent || auditArtifact) {
    return "present";
  }
  if (contract?.runtimeInspection?.auditArtifactRequiredMissing) {
    return "required-missing";
  }
  if (contract?.runtimeInspection?.auditArtifactOptionalMissing) {
    return "optional-missing";
  }
  return "unavailable";
}

function formatBounds(
  bounds: BodyGeometryContract["dimensionsMm"]["bodyBounds"] | undefined,
  units: BodyGeometryContract["dimensionsMm"]["bodyBoundsUnits"] | undefined,
): string {
  if (!bounds) return "n/a";
  const suffix = units === "mm" ? "mm" : units === "scene-units" ? "scene units" : "units";
  return `${bounds.width} × ${bounds.height} × ${bounds.depth} ${suffix}`;
}

function formatSvgQualityBounds(
  report: BodyGeometryContract["svgQuality"] | undefined,
): string {
  if (!report?.bounds) return "n/a";
  const suffix = report.boundsUnits === "mm"
    ? "mm"
    : report.boundsUnits === "source-px"
      ? "source px"
      : "units";
  return `${report.bounds.width} × ${report.bounds.height} ${suffix}`;
}

function getStatusLabel(status: BodyGeometryValidationStatus | undefined): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "WARN";
    case "fail":
      return "FAIL";
    default:
      return "UNKNOWN";
  }
}

function getStatusBadgeClass(status: BodyGeometryValidationStatus | undefined): string {
  switch (status) {
    case "pass":
      return styles.badgePass;
    case "warn":
      return styles.badgeWarn;
    case "fail":
      return styles.badgeFail;
    default:
      return styles.badgeUnknown;
  }
}

function CopyButton({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }).catch(() => {
      setCopied(false);
    });
  }, [value]);

  return (
    <button
      type="button"
      className={small ? styles.miniCopyBtn : styles.copyBtn}
      onClick={handleCopy}
      disabled={!value}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function Field({
  label,
  value,
  code = false,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  code?: boolean;
  testId?: string;
}) {
  return (
    <div className={styles.field} data-testid={testId}>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={`${styles.fieldValue} ${code ? styles.fieldCode : ""}`}>{value}</div>
    </div>
  );
}

function HashField({
  label,
  value,
  testId,
}: {
  label: string;
  value?: string;
  testId?: string;
}) {
  return (
    <Field
      label={label}
      testId={testId}
      value={(
        <span className={styles.fieldInline}>
          <span className={styles.hashValue} title={value ?? "n/a"}>
            {shortenHash(value)}
          </span>
          {value ? <CopyButton label="Copy" value={value} small /> : null}
        </span>
      )}
    />
  );
}

function ListField({
  label,
  values,
  testId,
}: {
  label: string;
  values: readonly string[] | undefined;
  testId?: string;
}) {
  const items = values?.filter(Boolean) ?? [];
  return (
    <Field
      label={label}
      testId={testId}
      value={items.length > 0 ? (
        <span className={styles.list}>
          {items.map((item) => (
            <span key={`${label}-${item}`} className={styles.pill}>{item}</span>
          ))}
        </span>
      ) : "none"}
    />
  );
}

export function BodyContractInspectorPanel({
  contract,
  auditArtifact = null,
}: BodyContractInspectorPanelProps) {
  const pathname = usePathname();
  const [browserContext, setBrowserContext] = React.useState<{
    href: string | null;
    userAgent: string | null;
  }>({
    href: null,
    userAgent: null,
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setBrowserContext({
      href: window.location.href,
      userAgent: navigator.userAgent ?? null,
    });
  }, []);
  const exportedAt = React.useMemo(() => new Date().toISOString(), [contract, auditArtifact, pathname, browserContext.href, browserContext.userAgent]);
  const featureFlags = React.useMemo(() => ({
    adminDebug: process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1",
    showBodyContractInspector: process.env.NEXT_PUBLIC_SHOW_BODY_CONTRACT_INSPECTOR === "1",
    allowInvalidBodyCutoutQaApproval: process.env.NEXT_PUBLIC_ALLOW_INVALID_BODY_CUTOUT_QA_APPROVAL === "1",
  }), []);
  const debugReport = React.useMemo(
    () => buildBodyGeometryDebugReport({
      contract,
      auditArtifact,
      exportedAt,
      environment: {
        appVersion: packageJson.version ?? null,
        gitCommit: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
          ?? process.env.NEXT_PUBLIC_GIT_COMMIT_SHA
          ?? null,
        pathname,
        href: browserContext.href,
        page: pathname,
        userAgent: browserContext.userAgent,
        featureFlags,
      },
    }),
    [auditArtifact, browserContext.href, browserContext.userAgent, contract, exportedAt, featureFlags, pathname],
  );
  const rawJson = React.useMemo(() => stringifyJson(debugReport), [debugReport]);
  const wrapExportPreviewState = React.useMemo(
    () => buildWrapExportPreviewState(contract),
    [contract],
  );
  const validationStatus = contract?.mode === "wrap-export"
    ? wrapExportPreviewState.status
    : contract?.validation.status ?? "unknown";
  const bodyBoundsUnits = contract?.dimensionsMm.bodyBoundsUnits;
  const showBodyUnitsWarning = bodyBoundsUnits === "scene-units";
  const showUnknownScaleSourceWarning = !contract?.dimensionsMm.scaleSource || contract.dimensionsMm.scaleSource === "unknown";
  const hasWarnings = (contract?.validation.warnings.length ?? 0) > 0;
  const hasErrors = (contract?.validation.errors.length ?? 0) > 0;
  const hasSvgQualityWarnings = (contract?.svgQuality?.warnings.length ?? 0) > 0;
  const hasSvgQualityErrors = (contract?.svgQuality?.errors.length ?? 0) > 0;
  const showWrapExportSection = contract?.mode === "wrap-export";
  const handleDownloadDebugReport = React.useCallback(() => {
    const fileName = buildBodyGeometryDebugReportFileName({ exportedAt });
    const blob = new Blob([rawJson], { type: "application/json;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }, [exportedAt, rawJson]);

  return (
    <div className={styles.panel} data-testid="body-contract-inspector">
      <details className={styles.root}>
        <summary className={styles.summary} data-testid="body-contract-inspector-summary">
          <div className={styles.summaryText}>
            <div className={styles.title} data-testid="body-contract-inspector-title">Body Contract Inspector</div>
            <div className={styles.metaRow} data-testid="body-contract-inspector-meta">
              <span
                className={`${styles.badge} ${getStatusBadgeClass(validationStatus)}`}
                data-testid="body-contract-inspector-status"
              >
                {getStatusLabel(validationStatus)}
              </span>
              <span className={styles.badge}>mode: {contract?.mode ?? "unknown"}</span>
              <span className={styles.badge}>source: {contract?.source.type ?? "unknown"}</span>
              <span className={styles.badge}>fresh: {formatFreshness(contract?.glb.freshRelativeToSource)}</span>
              <span className={styles.badge}>fallback: {formatBoolean(contract?.meshes.fallbackDetected)}</span>
              {showWrapExportSection ? (
                <span className={styles.badge}>
                  mapping: {getWrapExportMappingStatusLabel(wrapExportPreviewState.mappingStatus).toLowerCase()}
                </span>
              ) : null}
            </div>
          </div>
          <div className={styles.chevron}>Open</div>
        </summary>

        <div className={styles.content}>
          <div className={styles.toolbar} data-testid="body-contract-inspector-toolbar">
            <button
              type="button"
              className={styles.copyBtn}
              onClick={handleDownloadDebugReport}
              data-testid="body-contract-download-debug-report"
            >
              Download debug report
            </button>
            <CopyButton label="Copy JSON" value={rawJson} />
          </div>

          {!contract ? (
            <div className={styles.empty} data-testid="body-contract-inspector-empty">Body Geometry Contract is not available yet for this viewer state.</div>
          ) : (
            <>
              <details className={styles.section} open data-testid="body-contract-inspector-source-section">
                <summary className={styles.sectionSummary}>Source</summary>
                <div className={styles.sectionBody}>
                  <div className={styles.fieldList}>
                    <Field label="Type" value={contract.source.type} testId="body-contract-inspector-source-type" />
                    <Field label="Filename" value={contract.source.filename ?? "n/a"} code testId="body-contract-inspector-source-filename" />
                    <HashField label="SVG hash" value={contract.source.hash} testId="body-contract-inspector-source-hash" />
                    <Field label="Raw width (px)" value={formatNumber(contract.source.widthPx)} testId="body-contract-inspector-source-width" />
                    <Field label="Raw height (px)" value={formatNumber(contract.source.heightPx)} testId="body-contract-inspector-source-height" />
                    <Field label="ViewBox" value={contract.source.viewBox ?? "n/a"} code testId="body-contract-inspector-source-viewbox" />
                    <Field label="Body only" value={formatBoolean(contract.source.detectedBodyOnly)} testId="body-contract-inspector-source-body-only" />
                    <Field label="Generation mode" value={contract.source.generationSourceMode ?? "n/a"} testId="body-contract-inspector-source-generation-mode" />
                    <Field label="Centerline captured" value={formatBoolean(contract.source.centerlineCaptured)} testId="body-contract-inspector-source-centerline" />
                    <Field label="Left body captured" value={formatBoolean(contract.source.leftBodyOutlineCaptured)} testId="body-contract-inspector-source-left-body" />
                    <Field label="Mirrored body generated" value={formatBoolean(contract.source.mirroredBodyGenerated)} testId="body-contract-inspector-source-mirrored-body" />
                    <Field label="Blocked regions" value={contract.source.blockedRegionCount != null ? String(contract.source.blockedRegionCount) : "n/a"} testId="body-contract-inspector-source-blocked-regions" />
                    <Field label="Lookup authority status" value={contract.source.lookupDimensionAuthorityStatus ?? "n/a"} testId="body-contract-inspector-source-lookup-authority-status" />
                    <Field
                      label="Reference layers excluded"
                      value={contract.source.referenceLayersExcluded?.length ? contract.source.referenceLayersExcluded.join(", ") : "n/a"}
                      testId="body-contract-inspector-source-reference-layers-excluded"
                    />
                    <Field
                      label="Non-body exclusions"
                      value={contract.source.nonBodyGenerationExclusions?.length ? contract.source.nonBodyGenerationExclusions.join(", ") : "n/a"}
                      testId="body-contract-inspector-source-non-body-exclusions"
                    />
                    <Field
                      label="V1 fallback available"
                      value={formatBoolean(contract.source.fallbackGenerationModeAvailable)}
                      testId="body-contract-inspector-source-v1-fallback-available"
                    />
                  </div>
                  <div className={styles.note}>
                    Source width, height, and viewBox are raw SVG-space values. They are not assumed to be millimeters.
                  </div>
                </div>
              </details>

              <details className={styles.section} data-testid="body-contract-inspector-glb-section">
                <summary className={styles.sectionSummary}>GLB</summary>
                <div className={styles.sectionBody}>
                  <div className={styles.fieldList}>
                    <Field label="Path" value={contract.glb.path ?? "n/a"} code testId="body-contract-inspector-glb-path" />
                    <HashField label="GLB hash" value={contract.glb.hash} testId="body-contract-inspector-glb-hash" />
                    <HashField label="GLB source hash" value={contract.glb.sourceHash} testId="body-contract-inspector-glb-source-hash" />
                    <Field label="Generated at" value={contract.glb.generatedAt ?? "n/a"} testId="body-contract-inspector-glb-generated-at" />
                    <Field label="Fresh relative to source" value={formatFreshness(contract.glb.freshRelativeToSource)} testId="body-contract-inspector-glb-fresh" />
                    <Field
                      label="Audit artifact"
                      value={formatAuditArtifactState(contract, auditArtifact)}
                      testId="body-contract-inspector-glb-audit"
                    />
                  </div>
                </div>
              </details>

              <details className={styles.section} data-testid="body-contract-inspector-runtime-section">
                <summary className={styles.sectionSummary}>Runtime Inspection</summary>
                <div className={styles.sectionBody}>
                  <div className={styles.fieldList}>
                    <Field
                      label="Status"
                      value={contract.runtimeInspection?.status ?? "unknown"}
                      testId="body-contract-inspector-runtime-status"
                    />
                    <Field
                      label="Error"
                      value={contract.runtimeInspection?.error ?? "none"}
                      code
                      testId="body-contract-inspector-runtime-error"
                    />
                    <Field
                      label="Audit present"
                      value={formatBoolean(contract.runtimeInspection?.auditArtifactPresent)}
                      testId="body-contract-inspector-runtime-audit-present"
                    />
                    <Field
                      label="Audit optional missing"
                      value={formatBoolean(contract.runtimeInspection?.auditArtifactOptionalMissing)}
                      testId="body-contract-inspector-runtime-audit-optional-missing"
                    />
                    <Field
                      label="Audit required missing"
                      value={formatBoolean(contract.runtimeInspection?.auditArtifactRequiredMissing)}
                      testId="body-contract-inspector-runtime-audit-required-missing"
                    />
                    <Field
                      label="Using audit provisional truth"
                      value={formatBoolean(contract.runtimeInspection?.auditArtifactUsedAsProvisionalTruth)}
                      testId="body-contract-inspector-runtime-audit-provisional"
                    />
                    <Field
                      label="Loaded mesh names source"
                      value={formatInspectionValueSource(contract.runtimeInspection?.loadedMeshNamesSource)}
                      testId="body-contract-inspector-runtime-mesh-source"
                    />
                    <Field
                      label="Body bounds source"
                      value={formatInspectionValueSource(contract.runtimeInspection?.bodyBoundsSource)}
                      testId="body-contract-inspector-runtime-bounds-source"
                    />
                  </div>
                </div>
              </details>

              <details className={styles.section} data-testid="body-contract-inspector-meshes-section">
                <summary className={styles.sectionSummary}>Meshes</summary>
                <div className={styles.sectionBody}>
                  <div className={styles.fieldList}>
                    <ListField label="All meshes" values={contract.meshes.names} testId="body-contract-inspector-all-meshes" />
                    <ListField label="Body meshes" values={contract.meshes.bodyMeshNames} testId="body-contract-inspector-body-meshes" />
                    <ListField label="Accessory meshes" values={contract.meshes.accessoryMeshNames} testId="body-contract-inspector-accessory-meshes" />
                    <ListField label="Fallback meshes" values={contract.meshes.fallbackMeshNames} testId="body-contract-inspector-fallback-meshes" />
                    <ListField label="Unexpected meshes" values={contract.meshes.unexpectedMeshes} testId="body-contract-inspector-unexpected-meshes" />
                  </div>
                </div>
              </details>

              <details className={styles.section} data-testid="body-contract-inspector-dimensions-section">
                <summary className={styles.sectionSummary}>Dimensions</summary>
                <div className={styles.sectionBody}>
                  <div className={styles.fieldList}>
                    <Field
                      label="Body bounds"
                      value={formatBounds(contract.dimensionsMm.bodyBounds, contract.dimensionsMm.bodyBoundsUnits)}
                      testId="body-contract-inspector-body-bounds"
                    />
                    <Field label="Scale source" value={formatScaleSource(contract.dimensionsMm.scaleSource)} testId="body-contract-inspector-scale-source" />
                    <Field label="Front visible width" value={formatNumber(contract.dimensionsMm.frontVisibleWidthMm)} testId="body-contract-inspector-front-visible-width" />
                    <Field label="Wrap diameter" value={formatNumber(contract.dimensionsMm.wrapDiameterMm)} testId="body-contract-inspector-wrap-diameter" />
                    <Field label="Wrap width" value={formatNumber(contract.dimensionsMm.wrapWidthMm)} testId="body-contract-inspector-wrap-width" />
                    <Field label="Expected width" value={formatNumber(contract.dimensionsMm.expectedBodyWidthMm)} testId="body-contract-inspector-expected-width" />
                    <Field label="Expected height" value={formatNumber(contract.dimensionsMm.expectedBodyHeightMm)} testId="body-contract-inspector-expected-height" />
                    <Field label="Bounds units" value={contract.dimensionsMm.bodyBoundsUnits ?? "unknown"} testId="body-contract-inspector-bounds-units" />
                  </div>
                  {showBodyUnitsWarning ? (
                    <div className={styles.note} data-testid="body-contract-inspector-units-warning">
                      Body bounds are in scene units, so mm-scale verification is warning-only.
                    </div>
                  ) : null}
                  {showUnknownScaleSourceWarning ? (
                    <div className={styles.note} data-testid="body-contract-inspector-scale-source-warning">
                      Scale source is unknown, so raw SVG width and physical dimensions cannot be compared confidently yet.
                    </div>
                  ) : null}
                </div>
              </details>

              {showWrapExportSection ? (
                <details
                  className={styles.section}
                  open
                  data-testid="body-contract-inspector-wrap-export-section"
                >
                  <summary className={styles.sectionSummary}>Wrap / Export</summary>
                  <div className={styles.sectionBody}>
                    <div className={styles.fieldList}>
                      <Field
                        label="Status"
                        value={getWrapExportPreviewStatusLabel(wrapExportPreviewState.status)}
                        testId="body-contract-inspector-wrap-export-status"
                      />
                      <Field
                        label="Mapping status"
                        value={getWrapExportMappingStatusLabel(wrapExportPreviewState.mappingStatus)}
                        testId="body-contract-inspector-wrap-export-mapping-status"
                      />
                      <Field
                        label="Ready for preview"
                        value={formatBoolean(wrapExportPreviewState.readyForPreview)}
                        testId="body-contract-inspector-wrap-export-ready-preview"
                      />
                      <Field
                        label="Ready for exact placement"
                        value={formatBoolean(wrapExportPreviewState.readyForExactPlacement)}
                        testId="body-contract-inspector-wrap-export-ready-exact"
                      />
                      <Field
                        label="Is BODY CUTOUT QA proof"
                        value={formatBoolean(wrapExportPreviewState.isBodyCutoutQaProof)}
                        testId="body-contract-inspector-wrap-export-is-qa-proof"
                      />
                      <Field
                        label="Wrap diameter"
                        value={formatNumber(wrapExportPreviewState.wrapDiameterMm)}
                        testId="body-contract-inspector-wrap-export-diameter"
                      />
                      <Field
                        label="Wrap width"
                        value={formatNumber(wrapExportPreviewState.wrapWidthMm)}
                        testId="body-contract-inspector-wrap-export-width"
                      />
                      <Field
                        label="Printable top"
                        value={formatNumber(wrapExportPreviewState.printableTopMm)}
                        testId="body-contract-inspector-wrap-export-printable-top"
                      />
                      <Field
                        label="Printable bottom"
                        value={formatNumber(wrapExportPreviewState.printableBottomMm)}
                        testId="body-contract-inspector-wrap-export-printable-bottom"
                      />
                      <Field
                        label="Printable height"
                        value={formatNumber(wrapExportPreviewState.printableHeightMm)}
                        testId="body-contract-inspector-wrap-export-printable-height"
                      />
                      <Field
                        label="Expected width"
                        value={formatNumber(wrapExportPreviewState.expectedBodyWidthMm)}
                        testId="body-contract-inspector-wrap-export-expected-width"
                      />
                      <Field
                        label="Expected height"
                        value={formatNumber(wrapExportPreviewState.expectedBodyHeightMm)}
                        testId="body-contract-inspector-wrap-export-expected-height"
                      />
                      <Field
                        label="Body bounds"
                        value={formatBounds(wrapExportPreviewState.bodyBounds, contract.dimensionsMm.bodyBoundsUnits)}
                        testId="body-contract-inspector-wrap-export-body-bounds"
                      />
                      <Field
                        label="Scale source"
                        value={formatScaleSource(wrapExportPreviewState.scaleSource)}
                        testId="body-contract-inspector-wrap-export-scale-source"
                      />
                      <Field
                        label="Freshness"
                        value={wrapExportPreviewState.freshness}
                        testId="body-contract-inspector-wrap-export-freshness"
                      />
                      <HashField
                        label="Source hash"
                        value={contract.source.hash}
                        testId="body-contract-inspector-wrap-export-source-hash"
                      />
                      <HashField
                        label="GLB source hash"
                        value={contract.glb.sourceHash}
                        testId="body-contract-inspector-wrap-export-glb-source-hash"
                      />
                    </div>
                    <div className={styles.validationList} data-testid="body-contract-inspector-wrap-export-messages">
                      {wrapExportPreviewState.errors.map((error) => (
                        <div key={`wrap-error-${error}`} className={`${styles.message} ${styles.messageError}`}>
                          {error}
                        </div>
                      ))}
                      {wrapExportPreviewState.warnings.map((warning) => (
                        <div key={`wrap-warn-${warning}`} className={`${styles.message} ${styles.messageWarn}`}>
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ) : null}

              <details
                className={styles.section}
                open={hasSvgQualityWarnings || hasSvgQualityErrors}
                data-testid="body-contract-inspector-svg-quality-section"
              >
                <summary className={styles.sectionSummary}>SVG / Cutout Quality</summary>
                <div className={styles.sectionBody}>
                  <div className={styles.fieldList}>
                    <Field
                      label="Status"
                      value={contract.svgQuality ? getStatusLabel(contract.svgQuality.status) : "n/a"}
                      testId="body-contract-inspector-svg-quality-status"
                    />
                    <Field
                      label="Contour source"
                      value={contract.svgQuality?.contourSource ?? "n/a"}
                      testId="body-contract-inspector-svg-quality-source"
                    />
                    <Field
                      label="Closed"
                      value={contract.svgQuality ? formatBoolean(contract.svgQuality.closed) : "n/a"}
                      testId="body-contract-inspector-svg-quality-closed"
                    />
                    <Field
                      label="Closeable"
                      value={contract.svgQuality ? formatBoolean(contract.svgQuality.closeable) : "n/a"}
                      testId="body-contract-inspector-svg-quality-closeable"
                    />
                    <Field
                      label="Point count"
                      value={contract.svgQuality ? String(contract.svgQuality.pointCount) : "n/a"}
                      testId="body-contract-inspector-svg-quality-point-count"
                    />
                    <Field
                      label="Segment count"
                      value={contract.svgQuality ? String(contract.svgQuality.segmentCount) : "n/a"}
                      testId="body-contract-inspector-svg-quality-segment-count"
                    />
                    <Field
                      label="Bounds"
                      value={formatSvgQualityBounds(contract.svgQuality)}
                      testId="body-contract-inspector-svg-quality-bounds"
                    />
                    <Field
                      label="Bounds units"
                      value={contract.svgQuality?.boundsUnits ?? "n/a"}
                      testId="body-contract-inspector-svg-quality-bounds-units"
                    />
                    <Field
                      label="Aspect ratio"
                      value={formatNumber(contract.svgQuality?.aspectRatio)}
                      testId="body-contract-inspector-svg-quality-aspect-ratio"
                    />
                    <Field
                      label="Duplicate points"
                      value={contract.svgQuality ? String(contract.svgQuality.duplicatePointCount) : "n/a"}
                      testId="body-contract-inspector-svg-quality-duplicate-count"
                    />
                    <Field
                      label="Near-duplicate points"
                      value={contract.svgQuality ? String(contract.svgQuality.nearDuplicatePointCount) : "n/a"}
                      testId="body-contract-inspector-svg-quality-near-duplicate-count"
                    />
                    <Field
                      label="Tiny segments"
                      value={contract.svgQuality ? String(contract.svgQuality.tinySegmentCount) : "n/a"}
                      testId="body-contract-inspector-svg-quality-tiny-segment-count"
                    />
                    <Field
                      label="Suspicious spikes"
                      value={contract.svgQuality ? String(contract.svgQuality.suspiciousSpikeCount) : "n/a"}
                      testId="body-contract-inspector-svg-quality-spike-count"
                    />
                    <Field
                      label="Suspicious jumps"
                      value={contract.svgQuality ? String(contract.svgQuality.suspiciousJumpCount) : "n/a"}
                      testId="body-contract-inspector-svg-quality-jump-count"
                    />
                    {(contract.svgQuality?.expectedBridgeSegmentCount ?? 0) > 0 ? (
                      <Field
                        label="Expected bridge segments"
                        value={String(contract.svgQuality?.expectedBridgeSegmentCount ?? 0)}
                        testId="body-contract-inspector-svg-quality-expected-bridge-count"
                      />
                    ) : null}
                  </div>
                  <div className={styles.validationList} data-testid="body-contract-inspector-svg-quality-messages">
                    {hasSvgQualityErrors ? contract.svgQuality?.errors.map((error) => (
                      <div key={`svg-error-${error}`} className={`${styles.message} ${styles.messageError}`}>
                        {error}
                      </div>
                    )) : null}
                    {hasSvgQualityWarnings ? contract.svgQuality?.warnings.map((warning) => (
                      <div key={`svg-warn-${warning}`} className={`${styles.message} ${styles.messageWarn}`}>
                        {warning}
                      </div>
                    )) : null}
                    {!contract.svgQuality ? (
                      <div className={styles.note} data-testid="body-contract-inspector-svg-quality-none">
                        SVG cutout quality is not available for this viewer state.
                      </div>
                    ) : (!hasSvgQualityErrors && !hasSvgQualityWarnings ? (
                      <div className={styles.note}>No SVG cutout quality messages.</div>
                    ) : null)}
                  </div>
                </div>
              </details>

              <details className={styles.section} open={hasWarnings || hasErrors} data-testid="body-contract-inspector-validation-section">
                <summary className={styles.sectionSummary}>Validation</summary>
                <div className={styles.sectionBody}>
                  <div className={styles.fieldList}>
                    <Field label="Status" value={getStatusLabel(validationStatus)} testId="body-contract-inspector-validation-status" />
                  </div>
                  <div className={styles.validationList} data-testid="body-contract-inspector-validation-messages">
                    {hasErrors ? contract.validation.errors.map((error) => (
                      <div key={`error-${error}`} className={`${styles.message} ${styles.messageError}`} data-testid="body-contract-inspector-validation-error">{error}</div>
                    )) : null}
                    {hasWarnings ? contract.validation.warnings.map((warning) => (
                      <div key={`warn-${warning}`} className={`${styles.message} ${styles.messageWarn}`} data-testid="body-contract-inspector-validation-warning">{warning}</div>
                    )) : null}
                    {!hasErrors && !hasWarnings ? (
                      <div className={styles.note} data-testid="body-contract-inspector-validation-none">No validation messages.</div>
                    ) : null}
                  </div>
                </div>
              </details>

              <details className={styles.section} data-testid="body-contract-inspector-raw-json-section">
                <summary className={styles.sectionSummary}>Raw JSON</summary>
                <div className={styles.sectionBody}>
                  <pre className={styles.rawJson} data-testid="body-contract-inspector-raw-json">{rawJson}</pre>
                </div>
              </details>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
