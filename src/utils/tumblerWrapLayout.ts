export interface TumblerWrapLayout {
  frontAnchorU: number;
  frontCenterRatio: number;
  backCenterRatio: number | null;
  handleCenterRatio: number | null;
  isSideHandleLayout: boolean;
}

export function hasSideHandleLayout(handleArcDeg?: number): boolean {
  return Number.isFinite(handleArcDeg) && (handleArcDeg ?? 0) > 0;
}

export function getTumblerWrapLayout(handleArcDeg?: number): TumblerWrapLayout {
  if (hasSideHandleLayout(handleArcDeg)) {
    return {
      frontAnchorU: 0.75,
      frontCenterRatio: 0.75,
      backCenterRatio: 0.25,
      handleCenterRatio: 0.5,
      isSideHandleLayout: true,
    };
  }

  return {
    frontAnchorU: 0.5,
    frontCenterRatio: 0.5,
    backCenterRatio: null,
    handleCenterRatio: null,
    isSideHandleLayout: false,
  };
}

export function getWrapFrontCenter(value: number, handleArcDeg?: number): number {
  return value * getTumblerWrapLayout(handleArcDeg).frontCenterRatio;
}

export function getWrapBackCenter(value: number, handleArcDeg?: number): number | null {
  const ratio = getTumblerWrapLayout(handleArcDeg).backCenterRatio;
  return ratio == null ? null : value * ratio;
}

export function getWrapHandleCenter(value: number, handleArcDeg?: number): number | null {
  const ratio = getTumblerWrapLayout(handleArcDeg).handleCenterRatio;
  return ratio == null ? null : value * ratio;
}
