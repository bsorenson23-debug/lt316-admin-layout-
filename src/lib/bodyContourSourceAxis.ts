"use client";

import { buildContourSvgPath } from "@/lib/editableBodyOutline";

type LinearPathPoint = { x: number; y: number };

type ContourRow = {
  y: number;
  leftX: number;
  rightX: number;
  centerX: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  return finite[Math.floor(finite.length / 2)] ?? null;
}

export function parseLinearContourPathPoints(path: string | null): {
  points: LinearPathPoint[];
  closed: boolean;
} | null {
  if (!path) return null;
  const tokens = path.trim().split(/\s+/);
  const points: LinearPathPoint[] = [];
  let closed = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === "M" || token === "L") {
      const x = Number(tokens[index + 1]);
      const y = Number(tokens[index + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      points.push({ x, y });
      index += 2;
      continue;
    }
    if (token === "Z") {
      closed = true;
      continue;
    }
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
    index += 1;
  }
  return points.length >= 2 ? { points, closed } : null;
}

function buildContourRows(points: LinearPathPoint[]): ContourRow[] {
  const rowsByY = new Map<number, { leftX: number; rightX: number }>();
  for (const point of points) {
    const y = round2(point.y);
    const existing = rowsByY.get(y);
    if (existing) {
      existing.leftX = Math.min(existing.leftX, point.x);
      existing.rightX = Math.max(existing.rightX, point.x);
      continue;
    }
    rowsByY.set(y, { leftX: point.x, rightX: point.x });
  }
  return [...rowsByY.entries()]
    .map(([y, row]) => ({
      y,
      leftX: row.leftX,
      rightX: row.rightX,
      centerX: (row.leftX + row.rightX) / 2,
    }))
    .filter((row) => Number.isFinite(row.leftX) && Number.isFinite(row.rightX) && row.rightX > row.leftX)
    .sort((left, right) => left.y - right.y);
}

function getContourIntersectionsAtY(points: LinearPathPoint[], y: number): number[] {
  if (points.length < 2) return [];
  const xs: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    if (y < minY || y > maxY) continue;
    if (Math.abs(next.y - current.y) < 0.0001) {
      xs.push(current.x, next.x);
      continue;
    }
    const t = (y - current.y) / (next.y - current.y);
    if (t < 0 || t > 1) continue;
    xs.push(round2(current.x + ((next.x - current.x) * t)));
  }
  return xs.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

function buildInterpolatedContourRows(points: LinearPathPoint[]): ContourRow[] {
  if (points.length < 6) return [];
  const ys = points.map((point) => point.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const height = maxY - minY;
  if (!(height > 4)) return [];
  const sampleCount = Math.max(48, Math.min(120, Math.round(height / 3.5)));
  const rows: ContourRow[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round2(minY + (height * t));
    const intersections = getContourIntersectionsAtY(points, y);
    if (intersections.length < 2) continue;
    const leftX = intersections[0]!;
    const rightX = intersections[intersections.length - 1]!;
    if (!(rightX > leftX)) continue;
    rows.push({
      y,
      leftX: round2(leftX),
      rightX: round2(rightX),
      centerX: round2((leftX + rightX) / 2),
    });
  }
  return rows;
}

function smoothContourRows(rows: ContourRow[]): ContourRow[] {
  if (rows.length < 3) return rows;
  return rows.map((row, index) => {
    const neighbors = rows.slice(Math.max(0, index - 1), Math.min(rows.length, index + 2));
    const smoothedCenter = median(neighbors.map((candidate) => candidate.centerX)) ?? row.centerX;
    return {
      ...row,
      centerX: round2(smoothedCenter),
    };
  });
}

function buildLinearSvgPath(points: LinearPathPoint[]): string | null {
  if (points.length < 2) return null;
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${round1(point.x)} ${round1(point.y)}`)
    .join(" ");
}

function getSmoothedRowsFromPath(path: string | null): ContourRow[] | null {
  const parsed = parseLinearContourPathPoints(path);
  if (!parsed?.closed || parsed.points.length < 6) return null;
  const interpolatedRows = buildInterpolatedContourRows(parsed.points);
  const rows = interpolatedRows.length >= 12
    ? interpolatedRows
    : buildContourRows(parsed.points);
  if (rows.length < 4) return null;
  return smoothContourRows(rows);
}

export function buildSourceAxisCenterlineSvgPath(path: string | null): string | null {
  const rows = getSmoothedRowsFromPath(path);
  if (!rows || rows.length < 2) return null;
  return buildLinearSvgPath(
    rows.map((row) => ({
      x: row.centerX,
      y: row.y,
    })),
  );
}

export function buildSymmetricContourFromSourceAxis(path: string | null, options: {
  bodyTopMm: number;
  bodyBottomMm: number;
  topDiameterMm: number;
}): Array<{ x: number; y: number }> | null {
  const rows = getSmoothedRowsFromPath(path);
  if (!rows || rows.length < 4) return null;

  const topRow = rows[0] ?? null;
  const bottomRow = rows[rows.length - 1] ?? null;
  if (!topRow || !bottomRow) return null;

  const heightPx = bottomRow.y - topRow.y;
  if (!(heightPx > 1)) return null;

  const heightMm = options.bodyBottomMm - options.bodyTopMm;
  if (!(heightMm > 1)) return null;

  const topBandEndY = topRow.y + (heightPx * 0.18);
  const topRows = rows.filter((row) => row.y <= topBandEndY);
  const topHalfWidthPx = median(
    (topRows.length > 0 ? topRows : [topRow]).map((row) => row.centerX - row.leftX),
  );
  if (!(topHalfWidthPx && topHalfWidthPx > 0.5)) return null;

  const scaleX = options.topDiameterMm / (topHalfWidthPx * 2);
  const scaleY = heightMm / heightPx;

  const left = rows.map((row) => ({
    x: round2(-Math.max(0.5, row.centerX - row.leftX) * scaleX),
    y: round2(options.bodyTopMm + ((row.y - topRow.y) * scaleY)),
  }));
  const right = [...left]
    .reverse()
    .map((point) => ({
      x: round2(-point.x),
      y: point.y,
    }));

  const contour = [...left, ...right];
  return contour.length >= 6
    ? contour
    : null;
}

export function buildPhotoSpaceContourPath(points: Array<{ x: number; y: number }>): string | null {
  return buildContourSvgPath(points);
}
