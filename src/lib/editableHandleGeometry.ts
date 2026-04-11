export interface HandleGuidePoint {
  x: number;
  y: number;
}

export interface EditableHandlePreview {
  side: "left" | "right";
  topFromOverallMm: number;
  bottomFromOverallMm: number;
  outerTopFromOverallMm: number;
  outerBottomFromOverallMm: number;
  reachMm: number;
  outerOffsetMm: number;
  upperCornerFromOverallMm: number;
  lowerCornerFromOverallMm: number;
  upperCornerReachMm: number;
  lowerCornerReachMm: number;
  upperTransitionFromOverallMm: number;
  lowerTransitionFromOverallMm: number;
  upperTransitionReachMm: number;
  lowerTransitionReachMm: number;
  tubeDiameterMm?: number;
}

export interface HandleGuideSolveInput {
  side: "left" | "right";
  outerOffset: number;
  inner: {
    attachTop: HandleGuidePoint;
    upperTransition: HandleGuidePoint;
    upperCorner: HandleGuidePoint;
    lowerCorner: HandleGuidePoint;
    lowerTransition: HandleGuidePoint;
    attachBottom: HandleGuidePoint;
  };
}

export interface HandleGuideSolvedGeometry {
  innerPath: string;
  outerPath: string;
  centerline: HandleGuidePoint[];
  innerPoints: HandleGuideSolveInput["inner"];
  outerPoints: HandleGuideSolveInput["inner"];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clonePoint(point: HandleGuidePoint): HandleGuidePoint {
  return {
    x: round1(point.x),
    y: round1(point.y),
  };
}

function offsetNormal(
  from: HandleGuidePoint,
  to: HandleGuidePoint,
  side: "left" | "right",
): HandleGuidePoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1e-6, Math.hypot(dx, dy));
  const nx = side === "right" ? (dy / length) : (-dy / length);
  const ny = side === "right" ? (-dx / length) : (dx / length);
  return { x: nx, y: ny };
}

function normalize(point: HandleGuidePoint): HandleGuidePoint {
  const length = Math.max(1e-6, Math.hypot(point.x, point.y));
  return {
    x: point.x / length,
    y: point.y / length,
  };
}

function solveOffsetPoint(args: {
  points: HandleGuidePoint[];
  index: number;
  side: "left" | "right";
  offset: number;
}): HandleGuidePoint {
  const { points, index, side, offset } = args;
  const point = points[index]!;
  if (index === 0) {
    const normal = offsetNormal(points[index]!, points[index + 1]!, side);
    return {
      x: round1(point.x + (normal.x * offset)),
      y: round1(point.y + (normal.y * offset)),
    };
  }
  if (index === points.length - 1) {
    const normal = offsetNormal(points[index - 1]!, points[index]!, side);
    return {
      x: round1(point.x + (normal.x * offset)),
      y: round1(point.y + (normal.y * offset)),
    };
  }

  const prevNormal = offsetNormal(points[index - 1]!, points[index]!, side);
  const nextNormal = offsetNormal(points[index]!, points[index + 1]!, side);
  const averaged = normalize({
    x: prevNormal.x + nextNormal.x,
    y: prevNormal.y + nextNormal.y,
  });
  const dot = Math.max(0.35, averaged.x * nextNormal.x + averaged.y * nextNormal.y);
  const miterLength = Math.min(offset / dot, offset * 1.65);

  return {
    x: round1(point.x + (averaged.x * miterLength)),
    y: round1(point.y + (averaged.y * miterLength)),
  };
}

function buildRoundedHandlePath(points: HandleGuideSolveInput["inner"]): string {
  const topAttach = clonePoint(points.attachTop);
  const upperTransition = clonePoint(points.upperTransition);
  const upperCorner = clonePoint(points.upperCorner);
  const lowerCorner = clonePoint(points.lowerCorner);
  const lowerTransition = clonePoint(points.lowerTransition);
  const bottomAttach = clonePoint(points.attachBottom);

  return [
    `M ${topAttach.x} ${topAttach.y}`,
    `L ${upperTransition.x} ${upperTransition.y}`,
    `Q ${upperCorner.x} ${upperTransition.y} ${upperCorner.x} ${upperCorner.y}`,
    `L ${lowerCorner.x} ${lowerCorner.y}`,
    `Q ${lowerCorner.x} ${lowerTransition.y} ${lowerTransition.x} ${lowerTransition.y}`,
    `L ${bottomAttach.x} ${bottomAttach.y}`,
  ].join(" ");
}

export function solveEditableHandleGuideGeometry(
  input: HandleGuideSolveInput,
): HandleGuideSolvedGeometry {
  const offset = Math.max(2, input.outerOffset);
  const orderedInnerPoints: HandleGuidePoint[] = [
    input.inner.attachTop,
    input.inner.upperTransition,
    input.inner.upperCorner,
    input.inner.lowerCorner,
    input.inner.lowerTransition,
    input.inner.attachBottom,
  ];
  const orderedOuterPoints = orderedInnerPoints.map((_, index) => solveOffsetPoint({
    points: orderedInnerPoints,
    index,
    side: input.side,
    offset,
  }));

  const outerPoints: HandleGuideSolveInput["inner"] = {
    attachTop: orderedOuterPoints[0]!,
    upperTransition: orderedOuterPoints[1]!,
    upperCorner: orderedOuterPoints[2]!,
    lowerCorner: orderedOuterPoints[3]!,
    lowerTransition: orderedOuterPoints[4]!,
    attachBottom: orderedOuterPoints[5]!,
  };

  const centerline: HandleGuidePoint[] = [
    {
      x: round1((input.inner.attachTop.x + outerPoints.attachTop.x) / 2),
      y: round1((input.inner.attachTop.y + outerPoints.attachTop.y) / 2),
    },
    {
      x: round1((input.inner.upperTransition.x + outerPoints.upperTransition.x) / 2),
      y: round1((input.inner.upperTransition.y + outerPoints.upperTransition.y) / 2),
    },
    {
      x: round1((input.inner.upperCorner.x + outerPoints.upperCorner.x) / 2),
      y: round1((input.inner.upperCorner.y + outerPoints.upperCorner.y) / 2),
    },
    {
      x: round1((input.inner.lowerCorner.x + outerPoints.lowerCorner.x) / 2),
      y: round1((input.inner.lowerCorner.y + outerPoints.lowerCorner.y) / 2),
    },
    {
      x: round1((input.inner.lowerTransition.x + outerPoints.lowerTransition.x) / 2),
      y: round1((input.inner.lowerTransition.y + outerPoints.lowerTransition.y) / 2),
    },
    {
      x: round1((input.inner.attachBottom.x + outerPoints.attachBottom.x) / 2),
      y: round1((input.inner.attachBottom.y + outerPoints.attachBottom.y) / 2),
    },
  ];

  return {
    innerPath: buildRoundedHandlePath(input.inner),
    outerPath: buildRoundedHandlePath(outerPoints),
    centerline,
    innerPoints: {
      attachTop: clonePoint(input.inner.attachTop),
      upperTransition: clonePoint(input.inner.upperTransition),
      upperCorner: clonePoint(input.inner.upperCorner),
      lowerCorner: clonePoint(input.inner.lowerCorner),
      lowerTransition: clonePoint(input.inner.lowerTransition),
      attachBottom: clonePoint(input.inner.attachBottom),
    },
    outerPoints,
  };
}

export function solveEditableHandlePreviewGeometry(args: {
  handle: EditableHandlePreview;
  toPoint: (fromOverallMm: number, reachMm: number) => HandleGuidePoint;
}): HandleGuideSolvedGeometry {
  const { handle, toPoint } = args;
  const outerOffset = Math.max(
    2,
    handle.outerOffsetMm > 0
      ? handle.outerOffsetMm
      : (handle.tubeDiameterMm ?? 0),
  );

  return solveEditableHandleGuideGeometry({
    side: handle.side,
    outerOffset,
    inner: {
      attachTop: toPoint(handle.topFromOverallMm, 0),
      attachBottom: toPoint(handle.bottomFromOverallMm, 0),
      upperTransition: toPoint(handle.upperTransitionFromOverallMm, handle.upperTransitionReachMm),
      upperCorner: toPoint(handle.upperCornerFromOverallMm, handle.upperCornerReachMm),
      lowerCorner: toPoint(handle.lowerCornerFromOverallMm, handle.lowerCornerReachMm),
      lowerTransition: toPoint(handle.lowerTransitionFromOverallMm, handle.lowerTransitionReachMm),
    },
  });
}
