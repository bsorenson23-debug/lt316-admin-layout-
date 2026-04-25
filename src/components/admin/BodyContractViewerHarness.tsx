"use client";

import React from "react";

import type { ProductTemplate } from "@/types/productTemplate";
import ModelViewer, { type TumblerDimensions } from "./ModelViewer";
import type { EditableBodyOutline } from "@/types/productTemplate";
import type { BodyGeometryContractSeed } from "@/lib/bodyGeometryContract";
import styles from "./BodyContractViewerHarness.module.css";

type BodyContractViewerScenario =
  | "body-cutout-qa-valid"
  | "body-cutout-qa-accessory"
  | "body-cutout-qa-fallback"
  | "body-cutout-qa-stale"
  | "full-model-accessory";

const DEFAULT_SCENARIO: BodyContractViewerScenario = "body-cutout-qa-valid";

const FIXTURE_PATHS: Record<BodyContractViewerScenario, string> = {
  "body-cutout-qa-valid": "/api/admin/debug/body-contract-fixtures/body-cutout-qa-valid.glb",
  "body-cutout-qa-accessory": "/api/admin/debug/body-contract-fixtures/body-cutout-qa-accessory.glb",
  "body-cutout-qa-fallback": "/api/admin/debug/body-contract-fixtures/body-cutout-qa-fallback.glb",
  "body-cutout-qa-stale": "/api/admin/debug/body-contract-fixtures/body-cutout-qa-stale.glb",
  "full-model-accessory": "/api/admin/debug/body-contract-fixtures/full-model-accessory.glb",
};

const MOCK_APPROVED_BODY_OUTLINE: EditableBodyOutline = {
  closed: true,
  version: 1,
  sourceContourMode: "body-only",
  sourceContourViewport: {
    minX: 0,
    minY: 0,
    width: 900,
    height: 1800,
  },
  sourceContourBounds: {
    minX: 180,
    minY: 0,
    maxX: 720,
    maxY: 1800,
    width: 540,
    height: 1800,
  },
  sourceContour: [
    { x: 180, y: 0 },
    { x: 720, y: 0 },
    { x: 720, y: 1800 },
    { x: 180, y: 1800 },
  ],
  directContour: [
    { x: 0, y: 0 },
    { x: 90, y: 0 },
    { x: 90, y: 180 },
    { x: 0, y: 180 },
  ],
  points: [
    { id: "p-top-left", x: 0, y: 0, pointType: "corner", role: "topOuter" },
    { id: "p-mid-left", x: 0, y: 90, pointType: "corner", role: "body" },
    { id: "p-bottom-left", x: 0, y: 180, pointType: "corner", role: "base" },
  ],
};

const MOCK_APPROVED_BODY_OUTLINE_HASH =
  "886546cc2f9db18d8f0a23b644e4c8fe2535ce5024f0d6c9db0deaec62d49a2a";

const HARNESS_TUMBLER_DIMS: TumblerDimensions = {
  overallHeightMm: 180,
  diameterMm: 90,
  printableHeightMm: 180,
  bodyHeightMm: 180,
};

function normalizeScenario(input: string | null | undefined): BodyContractViewerScenario {
  if (
    input === "body-cutout-qa-valid" ||
    input === "body-cutout-qa-accessory" ||
    input === "body-cutout-qa-fallback" ||
    input === "body-cutout-qa-stale" ||
    input === "full-model-accessory"
  ) {
    return input;
  }
  return DEFAULT_SCENARIO;
}

function getScenarioConfig(scenario: BodyContractViewerScenario): {
  title: string;
  subtitle: string;
  mode: "body-cutout-qa" | "full-model";
  fixtureUrl: string;
  sourceModelStatus: ProductTemplate["glbStatus"];
  seed?: BodyGeometryContractSeed;
} {
  switch (scenario) {
    case "body-cutout-qa-accessory":
      return {
        title: "BODY CUTOUT QA · accessory mesh fixture",
        subtitle: "Accessory meshes are present, so strict body-only validation must fail.",
        mode: "body-cutout-qa",
        fixtureUrl: FIXTURE_PATHS[scenario],
        sourceModelStatus: "generated-reviewed-model",
        seed: {
          glb: {
            sourceHash: MOCK_APPROVED_BODY_OUTLINE_HASH,
            freshRelativeToSource: true,
          },
        },
      };
    case "body-cutout-qa-fallback":
      return {
        title: "BODY CUTOUT QA · fallback mesh fixture",
        subtitle: "Fallback meshes are present, so strict body-only validation must fail.",
        mode: "body-cutout-qa",
        fixtureUrl: FIXTURE_PATHS[scenario],
        sourceModelStatus: "generated-reviewed-model",
        seed: {
          glb: {
            sourceHash: MOCK_APPROVED_BODY_OUTLINE_HASH,
            freshRelativeToSource: true,
          },
        },
      };
    case "body-cutout-qa-stale":
      return {
        title: "BODY CUTOUT QA · stale lineage fixture",
        subtitle: "Mesh contents are body-only, but lineage marks the GLB as stale and mismatched.",
        mode: "body-cutout-qa",
        fixtureUrl: FIXTURE_PATHS[scenario],
        sourceModelStatus: "generated-reviewed-model",
        seed: {
          glb: {
            freshRelativeToSource: false,
            sourceHash: "stale-lineage-mismatch",
          },
        },
      };
    case "full-model-accessory":
      return {
        title: "FULL MODEL PREVIEW · hybrid-equivalent fixture",
        subtitle: "Body plus accessories are allowed here, but the view is not valid for body contour QA.",
        mode: "full-model",
        fixtureUrl: FIXTURE_PATHS[scenario],
        sourceModelStatus: "verified-product-model",
        seed: {
          glb: {
            sourceHash: MOCK_APPROVED_BODY_OUTLINE_HASH,
            freshRelativeToSource: true,
          },
        },
      };
    case "body-cutout-qa-valid":
    default:
      return {
        title: "BODY CUTOUT QA · body-only fixture",
        subtitle: "Body-only reviewed geometry should validate cleanly in strict QA mode.",
        mode: "body-cutout-qa",
        fixtureUrl: FIXTURE_PATHS["body-cutout-qa-valid"],
        sourceModelStatus: "generated-reviewed-model",
        seed: {
          glb: {
            sourceHash: MOCK_APPROVED_BODY_OUTLINE_HASH,
            freshRelativeToSource: true,
          },
        },
      };
  }
}

export function BodyContractViewerHarness({
  scenario: rawScenario,
}: {
  scenario?: string | null;
}) {
  const scenario = React.useMemo(() => normalizeScenario(rawScenario), [rawScenario]);
  const config = React.useMemo(() => getScenarioConfig(scenario), [scenario]);

  return (
    <main className={styles.page}>
      <div className={styles.shell} data-testid="body-contract-viewer-harness">
        <section className={styles.header}>
          <div className={styles.eyebrow}>Internal QA harness</div>
          <h1 className={styles.title}>Body geometry viewer contract harness</h1>
          <p className={styles.subtitle}>{config.subtitle}</p>
          <div className={styles.metaRow}>
            <span className={styles.pill} data-testid="body-contract-harness-scenario">
              scenario: {scenario}
            </span>
            <span className={styles.pill} data-testid="body-contract-harness-mode">
              requested mode: {config.mode}
            </span>
            <span className={styles.pill} data-testid="body-contract-harness-title">
              {config.title}
            </span>
          </div>
        </section>

        <section className={styles.viewerCard}>
          <div className={styles.viewerWrap} data-testid="body-contract-viewer-viewport">
            <ModelViewer
              modelUrl={config.fixtureUrl}
              glbPath={config.fixtureUrl}
              previewModelMode={config.mode}
              sourceModelStatus={config.sourceModelStatus}
              sourceModelLabel={config.title}
              showModelDebug
              tumblerDims={HARNESS_TUMBLER_DIMS}
              bedWidthMm={Math.PI * HARNESS_TUMBLER_DIMS.diameterMm}
              bedHeightMm={HARNESS_TUMBLER_DIMS.printableHeightMm}
              approvedBodyOutline={MOCK_APPROVED_BODY_OUTLINE}
              bodyGeometryContractSeed={config.seed}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
