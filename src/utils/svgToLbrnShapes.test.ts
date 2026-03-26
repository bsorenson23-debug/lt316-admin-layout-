import test from "node:test";
import assert from "node:assert/strict";

import { extractLbrnShapesFromItem } from "./svgToLbrnShapes.ts";

test("extractLbrnShapesFromItem ignores helper geometry inside defs-like containers", () => {
  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <path id="clip-shape" d="M5 5 L95 5 L95 95 L5 95 Z" />
      </defs>
      <clipPath id="clipper">
        <path d="M10 10 L90 10 L90 90 L10 90 Z" />
      </clipPath>
      <path d="M0 50 L100 50" />
    </svg>
  `;

  const shapes = extractLbrnShapesFromItem(
    {
      xMm: 0,
      yMm: 0,
      widthMm: 100,
      heightMm: 100,
      svgText,
    },
    0
  );

  assert.equal(shapes.length, 1);
  assert.match(shapes[0], /Type="Path"/);
});
