import * as THREE from "three";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
} from "../types/productTemplate.ts";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ModelCoordinateOrigin = "center" | "bottom";

export type BodyReferenceSilhouetteAuditRow = {
  yOverallMm: number;
  approvedRadiusMm: number;
  meshRadiusMm: number;
  deviationMm: number;
};

export type BodyReferenceSilhouetteAuditArtifactPaths = {
  jsonPath: string | null;
  svgPath: string | null;
};

export type BodyReferenceSilhouetteAuditReport = {
  authority: "body-cutout-qa-silhouette";
  scaleContract: "canonical sample radiusMm";
  pass: boolean;
  toleranceMm: number;
  maxDeviationMm: number;
  meanDeviationMm: number;
  approvedWidthMm: number;
  meshWidthMm: number;
  widthDeviationMm: number;
  approvedHeightMm: number;
  meshHeightMm: number;
  heightDeviationMm: number;
  wrapDiameterMm: number;
  frontVisibleWidthMm: number;
  approvedContourCount: number;
  meshRowCount: number;
  sampleCount: number;
  rows: BodyReferenceSilhouetteAuditRow[];
  artifactPaths: BodyReferenceSilhouetteAuditArtifactPaths | null;
};

type QuantizedMeshRow = {
  yOverallMm: number;
  radiusMm: number;
};

function overallYToModelY(
  totalHeightMm: number,
  yOverallMm: number,
  origin: ModelCoordinateOrigin,
): number {
  return origin === "bottom"
    ? round2(Math.max(1, totalHeightMm) - yOverallMm)
    : round2((Math.max(1, totalHeightMm) / 2) - yOverallMm);
}

function modelYToOverallY(
  totalHeightMm: number,
  modelYmm: number,
  origin: ModelCoordinateOrigin,
): number {
  return origin === "bottom"
    ? round2(Math.max(1, totalHeightMm) - modelYmm)
    : round2((Math.max(1, totalHeightMm) / 2) - modelYmm);
}

export function buildCanonicalBodyLatheContour(args: {
  canonicalBodyProfile: CanonicalBodyProfile;
  totalHeightMm: number;
  minYOverallMm?: number | null;
  maxYOverallMm?: number | null;
  modelCoordinateOrigin?: ModelCoordinateOrigin;
}): Array<{ radiusMm: number; yMm: number }> {
  const origin = args.modelCoordinateOrigin ?? "bottom";
  const sampleMinY = args.canonicalBodyProfile.samples[0]?.yMm ?? 0;
  const sampleMaxY =
    args.canonicalBodyProfile.samples[args.canonicalBodyProfile.samples.length - 1]?.yMm ?? sampleMinY;
  const minYOverallMm = Math.max(sampleMinY, args.minYOverallMm ?? sampleMinY);
  const maxYOverallMm = Math.min(sampleMaxY, args.maxYOverallMm ?? sampleMaxY);

  return args.canonicalBodyProfile.samples
    .filter((sample) => sample.yMm >= minYOverallMm && sample.yMm <= maxYOverallMm)
    .map((sample) => ({
      radiusMm: round2(Math.max(0.8, sample.radiusMm)),
      yMm: overallYToModelY(args.totalHeightMm, sample.yMm, origin),
    }));
}

function buildApprovedRows(args: {
  canonicalBodyProfile: CanonicalBodyProfile;
  minYOverallMm?: number | null;
  maxYOverallMm?: number | null;
}): BodyReferenceSilhouetteAuditRow[] {
  const sampleMinY = args.canonicalBodyProfile.samples[0]?.yMm ?? 0;
  const sampleMaxY =
    args.canonicalBodyProfile.samples[args.canonicalBodyProfile.samples.length - 1]?.yMm ?? sampleMinY;
  const minYOverallMm = Math.max(sampleMinY, args.minYOverallMm ?? sampleMinY);
  const maxYOverallMm = Math.min(sampleMaxY, args.maxYOverallMm ?? sampleMaxY);

  return args.canonicalBodyProfile.samples
    .filter((sample) => sample.yMm >= minYOverallMm && sample.yMm <= maxYOverallMm)
    .map((sample) => ({
      yOverallMm: round2(sample.yMm),
      approvedRadiusMm: round2(sample.radiusMm),
      meshRadiusMm: 0,
      deviationMm: 0,
    }));
}

function quantizeMeshRows(args: {
  mesh: THREE.Object3D;
  totalHeightMm: number;
  modelCoordinateOrigin?: ModelCoordinateOrigin;
}): QuantizedMeshRow[] {
  const origin = args.modelCoordinateOrigin ?? "bottom";
  const rowMap = new Map<number, number>();

  args.mesh.updateWorldMatrix(true, true);
  args.mesh.traverse((child) => {
    const maybeMesh = child as THREE.Mesh;
    if (!maybeMesh.isMesh) return;
    const geometry = maybeMesh.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions) return;

    const worldPosition = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      worldPosition.fromBufferAttribute(positions, index);
      worldPosition.applyMatrix4(maybeMesh.matrixWorld);
      const yOverallMm = modelYToOverallY(args.totalHeightMm, worldPosition.y, origin);
      const rowKey = round2(yOverallMm);
      const radiusMm = round2(Math.sqrt((worldPosition.x ** 2) + (worldPosition.z ** 2)));
      const current = rowMap.get(rowKey) ?? 0;
      if (radiusMm > current) {
        rowMap.set(rowKey, radiusMm);
      }
    }
  });

  return [...rowMap.entries()]
    .map(([yOverallMm, radiusMm]) => ({
      yOverallMm: round2(yOverallMm),
      radiusMm: round2(radiusMm),
    }))
    .sort((left, right) => left.yOverallMm - right.yOverallMm);
}

function interpolateMeshRadius(rows: QuantizedMeshRow[], yOverallMm: number): number {
  if (rows.length === 0) return 0;
  if (rows.length === 1) return round2(rows[0]?.radiusMm ?? 0);

  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    if (!current || !next) continue;
    if (Math.abs(yOverallMm - current.yOverallMm) < 0.0001) {
      return round2(current.radiusMm);
    }
    if (yOverallMm < current.yOverallMm || yOverallMm > next.yOverallMm) {
      continue;
    }
    const span = next.yOverallMm - current.yOverallMm;
    if (Math.abs(span) < 0.0001) {
      return round2(next.radiusMm);
    }
    const t = clamp((yOverallMm - current.yOverallMm) / span, 0, 1);
    return round2(current.radiusMm + ((next.radiusMm - current.radiusMm) * t));
  }

  const nearest = rows.reduce<QuantizedMeshRow | null>((best, row) => {
    if (!best) return row;
    return Math.abs(row.yOverallMm - yOverallMm) < Math.abs(best.yOverallMm - yOverallMm)
      ? row
      : best;
  }, null);
  return round2(nearest?.radiusMm ?? 0);
}

function toleranceForWidth(widthMm: number): number {
  return round2(Math.max(0.25, widthMm * 0.004));
}

function polylinePoints(
  rows: BodyReferenceSilhouetteAuditRow[],
  centerX: number,
  radiusKey: "approvedRadiusMm" | "meshRadiusMm",
): string {
  const left = rows.map((row) => `${round2(centerX - row[radiusKey])},${round2(row.yOverallMm)}`);
  const right = [...rows]
    .reverse()
    .map((row) => `${round2(centerX + row[radiusKey])},${round2(row.yOverallMm)}`);
  return [...left, ...right, left[0] ?? `${centerX},0`].join(" ");
}

export function buildBodyReferenceSilhouetteAudit(args: {
  bodyMesh: THREE.Object3D;
  canonicalBodyProfile: CanonicalBodyProfile;
  canonicalDimensionCalibration: CanonicalDimensionCalibration;
  modelCoordinateOrigin?: ModelCoordinateOrigin;
  minYOverallMm?: number | null;
  maxYOverallMm?: number | null;
}): BodyReferenceSilhouetteAuditReport {
  const approvedRows = buildApprovedRows({
    canonicalBodyProfile: args.canonicalBodyProfile,
    minYOverallMm: args.minYOverallMm,
    maxYOverallMm: args.maxYOverallMm,
  });
  const meshRows = quantizeMeshRows({
    mesh: args.bodyMesh,
    totalHeightMm: args.canonicalDimensionCalibration.totalHeightMm,
    modelCoordinateOrigin: args.modelCoordinateOrigin,
  });

  const rows = approvedRows.map((row) => {
    const meshRadiusMm = interpolateMeshRadius(meshRows, row.yOverallMm);
    return {
      ...row,
      meshRadiusMm,
      deviationMm: round2(Math.abs(meshRadiusMm - row.approvedRadiusMm)),
    };
  });

  const approvedWidthMm = round2(
    rows.reduce((max, row) => Math.max(max, row.approvedRadiusMm * 2), 0),
  );
  const meshWidthMm = round2(
    rows.reduce((max, row) => Math.max(max, row.meshRadiusMm * 2), 0),
  );
  const approvedHeightMm = round2(
    rows.length > 1 ? (rows[rows.length - 1]!.yOverallMm - rows[0]!.yOverallMm) : 0,
  );
  const meshHeightMm = round2(
    meshRows.length > 1 ? (meshRows[meshRows.length - 1]!.yOverallMm - meshRows[0]!.yOverallMm) : 0,
  );
  const maxDeviationMm = round2(
    rows.reduce((max, row) => Math.max(max, row.deviationMm), 0),
  );
  const meanDeviationMm = round2(
    rows.length > 0
      ? rows.reduce((sum, row) => sum + row.deviationMm, 0) / rows.length
      : 0,
  );
  const toleranceMm = toleranceForWidth(Math.max(approvedWidthMm, meshWidthMm));

  return {
    authority: "body-cutout-qa-silhouette",
    scaleContract: "canonical sample radiusMm",
    pass:
      maxDeviationMm <= toleranceMm &&
      Math.abs(meshWidthMm - approvedWidthMm) <= toleranceMm &&
      Math.abs(meshHeightMm - approvedHeightMm) <= toleranceMm,
    toleranceMm,
    maxDeviationMm,
    meanDeviationMm,
    approvedWidthMm,
    meshWidthMm,
    widthDeviationMm: round2(Math.abs(meshWidthMm - approvedWidthMm)),
    approvedHeightMm,
    meshHeightMm,
    heightDeviationMm: round2(Math.abs(meshHeightMm - approvedHeightMm)),
    wrapDiameterMm: round2(args.canonicalDimensionCalibration.wrapDiameterMm),
    frontVisibleWidthMm: round2(args.canonicalDimensionCalibration.frontVisibleWidthMm),
    approvedContourCount: approvedRows.length,
    meshRowCount: meshRows.length,
    sampleCount: rows.length,
    rows,
    artifactPaths: null,
  };
}

export function buildBodyReferenceSilhouetteAuditSvg(
  report: BodyReferenceSilhouetteAuditReport,
): string {
  const padding = 12;
  const width = round2(Math.max(report.approvedWidthMm, report.meshWidthMm) + (padding * 2));
  const height = round2(Math.max(report.approvedHeightMm, report.meshHeightMm) + (padding * 2));
  const centerX = round2(width / 2);
  const approvedPoints = polylinePoints(report.rows, centerX, "approvedRadiusMm");
  const meshPoints = polylinePoints(report.rows, centerX, "meshRadiusMm");
  const centerLineY1 = report.rows[0]?.yOverallMm ?? 0;
  const centerLineY2 = report.rows[report.rows.length - 1]?.yOverallMm ?? 0;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#101114" />`,
    `<g transform="translate(0 ${padding})">`,
    `<line x1="${centerX}" y1="${round2(centerLineY1)}" x2="${centerX}" y2="${round2(centerLineY2)}" stroke="#f59e0b" stroke-dasharray="4 4" stroke-width="0.8" opacity="0.9" />`,
    `<polygon points="${approvedPoints}" fill="none" stroke="#22c55e" stroke-width="1.4" />`,
    `<polygon points="${meshPoints}" fill="none" stroke="#fb923c" stroke-width="1.2" opacity="0.9" />`,
    `<text x="10" y="14" fill="#f3f4f6" font-family="ui-monospace, monospace" font-size="8">approved contour (green) vs body_mesh silhouette (orange)</text>`,
    `<text x="10" y="24" fill="#f3f4f6" font-family="ui-monospace, monospace" font-size="8">max deviation ${report.maxDeviationMm.toFixed(2)} mm, tolerance ${report.toleranceMm.toFixed(2)} mm</text>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
