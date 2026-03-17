import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STAGGERED_BED_PATTERN,
  generateStaggeredBedHoles,
  getBedCenter,
  mapBedMmToCanvasPercent,
} from "./staggeredBedPattern.ts";

test("staggered bed holes generate with required diameter and pitch", () => {
  const holes = generateStaggeredBedHoles(
    { widthMm: 100, heightMm: 100 },
    DEFAULT_STAGGERED_BED_PATTERN
  );
  assert.ok(holes.length > 0);
  assert.equal(holes[0].diameterMm, 6);

  const row0 = holes.filter((hole) => hole.rowIndex === 0);
  const row1 = holes.filter((hole) => hole.rowIndex === 1);
  assert.equal(row0[1].xMm - row0[0].xMm, 25);
  assert.equal(row1[1].xMm - row1[0].xMm, 25);

  const yRow0 = row0[0].yMm;
  const yRow1 = row1[0].yMm;
  assert.equal(yRow1 - yRow0, 25);
});

test("even rows start at 0mm and odd rows start at 12.5mm", () => {
  const holes = generateStaggeredBedHoles(
    { widthMm: 120, heightMm: 75 },
    DEFAULT_STAGGERED_BED_PATTERN
  );
  const row0 = holes.filter((hole) => hole.rowIndex === 0);
  const row1 = holes.filter((hole) => hole.rowIndex === 1);
  const row2 = holes.filter((hole) => hole.rowIndex === 2);

  assert.equal(row0[0].xMm, 0);
  assert.equal(row1[0].xMm, 12.5);
  assert.equal(row2[0].xMm, 0);
});

test("mapBedMmToCanvasPercent converts mm-space coordinates correctly", () => {
  const mapped = mapBedMmToCanvasPercent(75, 50, {
    widthMm: 300,
    heightMm: 200,
  });
  assert.equal(mapped.xPercent, 25);
  assert.equal(mapped.yPercent, 25);
});

test("getBedCenter returns midpoint in mm-space", () => {
  const center = getBedCenter({ widthMm: 273.32, heightMm: 145 });
  assert.equal(center.xMm, 136.66);
  assert.equal(center.yMm, 72.5);
});
