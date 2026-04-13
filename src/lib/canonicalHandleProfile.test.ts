import assert from "node:assert/strict";
import test from "node:test";
import type { EditableBodyOutline } from "../types/productTemplate.ts";
import { mapOutlineContourToImageSpace } from "./canonicalHandleProfile.ts";

test("mapOutlineContourToImageSpace remaps saved viewport contours into image pixels", () => {
  const outline: EditableBodyOutline = {
    closed: true,
    version: 1,
    points: [],
    sourceContour: [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 250 },
      { x: 100, y: 250 },
    ],
    sourceContourViewport: {
      minX: 100,
      minY: 50,
      width: 400,
      height: 300,
    },
  };

  const mapped = mapOutlineContourToImageSpace({
    outline,
    imageWidth: 800,
    imageHeight: 600,
  });

  assert.deepEqual(mapped, [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 400 },
    { x: 0, y: 400 },
  ]);
});

test("mapOutlineContourToImageSpace preserves contours without a saved viewport", () => {
  const outline: EditableBodyOutline = {
    closed: true,
    version: 1,
    points: [],
    sourceContour: [
      { x: 12.5, y: 30.25 },
      { x: 22.5, y: 42.75 },
      { x: 18, y: 55 },
    ],
  };

  const mapped = mapOutlineContourToImageSpace({
    outline,
    imageWidth: 999,
    imageHeight: 777,
  });

  assert.deepEqual(mapped, outline.sourceContour);
});
