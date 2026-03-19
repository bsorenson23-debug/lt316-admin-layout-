import type { RotaryMountReferenceMode } from "../types/export.ts";
import type { BedHole } from "./staggeredBedPattern.ts";
import { isFiniteNumber } from "./guards.ts";
import { round4 as roundTo4 } from "./geometry.ts";

export type BedHoleReference = {
  row: number;
  col: number;
  xMm: number;
  yMm: number;
};

export type RotaryHoleAnchorSelection = {
  primaryHole?: BedHoleReference;
  secondaryHole?: BedHoleReference;
};

export interface ResolvedRotaryAxisFromAnchor {
  rotaryAxisXmm?: number;
  rotaryAxisYmm?: number;
  isResolved: boolean;
  missing: string[];
}

export function toBedHoleReference(
  hole: Pick<BedHole, "rowIndex" | "columnIndex" | "xMm" | "yMm">
): BedHoleReference {
  return {
    row: hole.rowIndex,
    col: hole.columnIndex,
    xMm: roundTo4(hole.xMm),
    yMm: roundTo4(hole.yMm),
  };
}

export function isSameBedHole(
  a?: BedHoleReference,
  b?: BedHoleReference
): boolean {
  if (!a || !b) return false;
  return a.row === b.row && a.col === b.col;
}

export function selectRotaryAnchorHole(args: {
  current: RotaryHoleAnchorSelection;
  hole: BedHoleReference;
  asSecondary?: boolean;
}): RotaryHoleAnchorSelection {
  if (!args.asSecondary) {
    return {
      primaryHole: args.hole,
      secondaryHole: isSameBedHole(args.current.secondaryHole, args.hole)
        ? undefined
        : args.current.secondaryHole,
    };
  }

  if (!args.current.primaryHole) {
    return { primaryHole: args.hole };
  }
  if (isSameBedHole(args.current.primaryHole, args.hole)) {
    return {
      primaryHole: args.current.primaryHole,
      secondaryHole: undefined,
    };
  }
  if (isSameBedHole(args.current.secondaryHole, args.hole)) {
    return {
      primaryHole: args.current.primaryHole,
      secondaryHole: undefined,
    };
  }
  return {
    primaryHole: args.current.primaryHole,
    secondaryHole: args.hole,
  };
}

export function resolveRotaryAxisFromAnchor(args: {
  selection?: RotaryHoleAnchorSelection | null;
  referenceToAxisOffsetXmm?: number | null;
  referenceToAxisOffsetYmm?: number | null;
}): ResolvedRotaryAxisFromAnchor {
  const missing: string[] = [];

  const primaryHole = args.selection?.primaryHole;
  if (!primaryHole) {
    missing.push("No bed hole anchor selected.");
  }
  if (!isFiniteNumber(args.referenceToAxisOffsetXmm)) {
    missing.push("Reference-to-axis offset X is missing.");
  }
  if (!isFiniteNumber(args.referenceToAxisOffsetYmm)) {
    missing.push("Reference-to-axis offset Y is missing.");
  }

  if (
    !primaryHole ||
    !isFiniteNumber(args.referenceToAxisOffsetXmm) ||
    !isFiniteNumber(args.referenceToAxisOffsetYmm)
  ) {
    return {
      isResolved: false,
      missing,
    };
  }

  return {
    rotaryAxisXmm: roundTo4(primaryHole.xMm + args.referenceToAxisOffsetXmm),
    rotaryAxisYmm: roundTo4(primaryHole.yMm + args.referenceToAxisOffsetYmm),
    isResolved: true,
    missing,
  };
}

export function buildRotaryFootprintFromAnchor(args: {
  selection?: RotaryHoleAnchorSelection | null;
  mountReferenceMode?: RotaryMountReferenceMode | null;
  mountPatternXmm?: number | null;
  mountPatternYmm?: number | null;
  resolvedAxisXmm?: number | null;
  resolvedAxisYmm?: number | null;
}):
  | {
      xMm: number;
      yMm: number;
      widthMm: number;
      heightMm: number;
    }
  | null {
  if (!isFiniteNumber(args.mountPatternXmm) || args.mountPatternXmm <= 0) return null;
  if (!isFiniteNumber(args.mountPatternYmm) || args.mountPatternYmm <= 0) return null;

  const widthMm = args.mountPatternXmm;
  const heightMm = args.mountPatternYmm;
  const mode = args.mountReferenceMode ?? "custom";
  const primary = args.selection?.primaryHole;

  if (mode === "axis-center") {
    if (primary) {
      return {
        xMm: roundTo4(primary.xMm - widthMm / 2),
        yMm: roundTo4(primary.yMm - heightMm / 2),
        widthMm,
        heightMm,
      };
    }
    if (isFiniteNumber(args.resolvedAxisXmm) && isFiniteNumber(args.resolvedAxisYmm)) {
      return {
        xMm: roundTo4(args.resolvedAxisXmm - widthMm / 2),
        yMm: roundTo4(args.resolvedAxisYmm - heightMm / 2),
        widthMm,
        heightMm,
      };
    }
    return null;
  }

  if (!primary) return null;

  if (mode === "front-left-bolt" || mode === "custom") {
    return {
      xMm: roundTo4(primary.xMm),
      yMm: roundTo4(primary.yMm),
      widthMm,
      heightMm,
    };
  }
  if (mode === "front-right-bolt") {
    return {
      xMm: roundTo4(primary.xMm - widthMm),
      yMm: roundTo4(primary.yMm),
      widthMm,
      heightMm,
    };
  }
  if (mode === "front-edge-center") {
    return {
      xMm: roundTo4(primary.xMm - widthMm / 2),
      yMm: roundTo4(primary.yMm),
      widthMm,
      heightMm,
    };
  }

  return null;
}

export function formatAnchorReadout(hole?: BedHoleReference): string {
  if (!hole) return "None selected";
  return `R${hole.row + 1} C${hole.col + 1} (${hole.xMm.toFixed(1)}, ${hole.yMm.toFixed(
    1
  )} mm)`;
}

export function isManualRotaryOverrideActive(args: {
  manualOverrideEnabled: boolean;
  manualRotaryCenterXmm?: number | null;
}): boolean {
  return args.manualOverrideEnabled && isFiniteNumber(args.manualRotaryCenterXmm);
}
