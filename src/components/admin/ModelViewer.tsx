"use client";

import {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  Component,
  type ReactNode,
} from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  Bounds,
  useBounds,
  ContactShadows,
  Grid,
  Html,
  useProgress,
  Decal,
} from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import * as THREE from "three";
import type { PlacedItem } from "@/types/admin";
import {
  BODY_RADIUS_TOLERANCE_DEFAULT,
  BODY_RADIUS_TOLERANCE_WITH_HANDLE,
  buildWrapTexture,
  CYL_OVERLAY_FRAGMENT_SHADER,
  CYL_OVERLAY_VERTEX_SHADER,
  YetiRambler40oz,
} from "./models/YetiRambler40oz";
import type { DecalItem } from "./models/YetiRambler40oz";
import { getTumblerWrapLayout, getWrapFrontCenter } from "@/utils/tumblerWrapLayout";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  CanonicalHandleProfile,
} from "@/types/productTemplate";
import type { TemplatePipelineStageRecord } from "@/types/templatePipelineDiagnostics";
import { resolveCanonicalHandleRenderMode } from "@/lib/canonicalDimensionCalibration";
import {
  solveEditableHandlePreviewGeometry,
  type EditableHandlePreview,
} from "@/lib/editableHandleGeometry";
import type { LidAssemblyPreset } from "@/lib/lidPresets";
import {
  deriveTumblerPreviewModelState,
  type TumblerPreviewBoundsSnapshot,
  type TumblerPreviewModelState,
} from "@/lib/tumblerPreviewModelState";

// ---------------------------------------------------------------------------
// Suppress noisy Three.js deprecation warnings
// ---------------------------------------------------------------------------
if (typeof window !== "undefined") {
  const _origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && (
      args[0].includes("PCFSoftShadowMap") ||
      args[0].includes("THREE.Clock") ||
      args[0].includes("THREE.THREE.Clock")
    )) return;
    _origWarn.apply(console, args);
  };
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface TumblerDimensions {
  /** Total height of the tumbler in mm */
  overallHeightMm: number;
  /** Nominal diameter (equator) in mm */
  diameterMm: number;
  topDiameterMm?: number;
  bottomDiameterMm?: number;
  /** Distance from mesh top to the physical tumbler body top in mm */
  bodyTopOffsetMm?: number;
  /** Full powder-coated body height in mm */
  bodyHeightMm?: number;
  /** Height of the laser-engravable zone in mm */
  printableHeightMm: number;
  /** Distance from mesh top to printable zone top in mm */
  printableTopOffsetMm?: number;
  /** Top edge of the silver ring / lid seam measured from the overall top in mm */
  lidSeamFromOverallMm?: number;
  /** Bottom edge of the top silver ring measured from the overall top in mm */
  silverBandBottomFromOverallMm?: number;
}

/** Per-item rasterized texture for 3D Decal projection */
export interface ItemTexture {
  itemId: string;
  canvas: HTMLCanvasElement;
}

export interface FlatPreviewDimensions {
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  familyKey?: string;
  label?: string;
  material?: string;
}

export interface ModelViewerProps {
  file?: File | null;
  modelUrl?: string | null;
  flatPreview?: FlatPreviewDimensions | null;
  placedItems?: PlacedItem[];
  itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number;
  bedHeightMm?: number;
  tumblerDims?: TumblerDimensions | null;
  handleArcDeg?: number;
  /** Original GLB path — used to select specific model components */
  glbPath?: string | null;
  /** Tumbler mapping from the wizard — orients the front face */
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping;
  manufacturerLogoStamp?: import("@/types/productTemplate").ManufacturerLogoStamp;
  /** Body tint hex color (e.g. "#b0b8c4" for stainless, "#1a1a2e" for matte black) */
  bodyTintColor?: string;
  /** Lid cap tint hex color */
  lidTintColor?: string;
  /** Rim / engraved artwork tint */
  rimTintColor?: string;
  ringFinish?: import("@/types/productTemplate").ProductTemplateRingFinish;
  lidAssemblyPreset?: LidAssemblyPreset | null;
  /** Template preview only: render tumbler surface zones */
  showTemplateSurfaceZones?: boolean;
  /** Shared front-view and wrap calibration used by template preview consumers. */
  dimensionCalibration?: CanonicalDimensionCalibration | null;
  canonicalBodyProfile?: CanonicalBodyProfile | null;
  canonicalHandleProfile?: CanonicalHandleProfile | null;
  editableHandlePreview?: EditableHandlePreview | null;
  previewModelMode?: "alignment-model" | "full-model" | "source-traced";
  onPipelineStage?: (stage: TemplatePipelineStageRecord) => void;
  onPreviewStateChange?: (state: TumblerPreviewModelState | null) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function logoDataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create logo canvas."));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error("Could not load manufacturer logo stamp."));
    image.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Physical scale computation
// Scene units = mm when tumblerDims are provided.
// Detects Z-up / X-up models and corrects orientation to Y-up.
// ---------------------------------------------------------------------------

interface ModelTransform {
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
}

function cloneOpaqueMaterial(
  material: THREE.Material | THREE.Material[] | null | undefined,
): THREE.Material | THREE.Material[] | null | undefined {
  const normalize = (candidate: THREE.Material): THREE.Material => {
    const next = candidate.clone();
    if ("transparent" in next) next.transparent = false;
    if ("opacity" in next) next.opacity = 1;
    if ("alphaTest" in next) next.alphaTest = 0;
    if ("depthWrite" in next) next.depthWrite = true;
    if ("premultipliedAlpha" in next) next.premultipliedAlpha = false;
    if ("transmission" in next) next.transmission = 0;
    next.needsUpdate = true;
    return next;
  };

  if (!material) return material;
  return Array.isArray(material) ? material.map(normalize) : normalize(material);
}

/**
 * Decal projection depth needed to cover cylindrical curvature for a given arc width.
 * With a shallow projector, wide artwork gets clipped near the sides.
 */
function computeDecalDepthMm(itemWidthMm: number, radiusMm: number): number {
  if (!Number.isFinite(itemWidthMm) || itemWidthMm <= 0) return 24;
  if (!Number.isFinite(radiusMm) || radiusMm <= 0) return Math.min(120, Math.max(24, itemWidthMm * 0.6));

  const halfArc = THREE.MathUtils.clamp(itemWidthMm / (2 * radiusMm), 0, Math.PI * 0.99);
  const sagittaMm = radiusMm * (1 - Math.cos(halfArc));
  const inwardNeededMm = sagittaMm + Math.max(4, itemWidthMm * 0.04);
  return THREE.MathUtils.clamp(inwardNeededMm * 1.8, 20, 110);
}

function computeModelTransform(
  rawBounds: THREE.Box3,
  dims: TumblerDimensions | null | undefined,
  options?: { flipVertical?: boolean },
): ModelTransform {
  const rawSize = rawBounds.getSize(new THREE.Vector3());
  const flipVertical = options?.flipVertical ?? false;
  if (!dims || dims.overallHeightMm <= 0) {
    const isFlatSlab =
      rawSize.y > 0 &&
      rawSize.x > 0 &&
      rawSize.z > 0 &&
      rawSize.y < rawSize.x * 0.4 &&
      rawSize.y < rawSize.z * 0.4;
    if (isFlatSlab) {
      // Flat items are usually authored lying on the XZ plane, which reads edge-on
      // from the default front camera. Tilt them upright for a usable preview.
      return { scale: 1, rotation: [Math.PI / 2 + (flipVertical ? Math.PI : 0), 0, 0], position: [0, 0, 0] };
    }
    return { scale: 1, rotation: [flipVertical ? Math.PI : 0, 0, 0], position: [0, 0, 0] };
  }

  let rotation: [number, number, number] = [0, 0, 0];

  // Auto-orient: if the longest axis is not Y, rotate to make it Y
  if (rawSize.z > rawSize.y * 1.15 && rawSize.z > rawSize.x) {
    rotation = [-Math.PI / 2, 0, 0]; // Z-up → tilt forward
  } else if (rawSize.x > rawSize.y * 1.15 && rawSize.x > rawSize.z) {
    rotation = [0, 0, Math.PI / 2]; // X-up → rotate sideways
  }

  if (flipVertical) {
    rotation = [rotation[0] + Math.PI, rotation[1], rotation[2]];
  }
  const rotationEuler = new THREE.Euler(...rotation, "XYZ");
  const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(rotationEuler);
  const rotatedBounds = rawBounds.clone().applyMatrix4(rotationMatrix);
  const rotatedSize = rotatedBounds.getSize(new THREE.Vector3());
  const rotatedCenter = rotatedBounds.getCenter(new THREE.Vector3());
  const heightInNativeUnits = rotatedSize.y;

  const scale = heightInNativeUnits > 0
    ? dims.overallHeightMm / heightInNativeUnits
    : 1;

  return {
    scale,
    rotation,
    position: [
      -rotatedCenter.x * scale,
      -rotatedCenter.y * scale,
      -rotatedCenter.z * scale,
    ],
  };
}

// ---------------------------------------------------------------------------
// Loading indicator
// ---------------------------------------------------------------------------

function LoadingIndicator() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{
        color: "#aaa", fontSize: 11,
        background: "rgba(10,10,16,0.85)",
        padding: "6px 14px", borderRadius: 4,
        border: "1px solid #333", whiteSpace: "nowrap",
        fontFamily: "monospace",
      }}>
        {Math.round(progress)}%
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Auto-fit on first load
// ---------------------------------------------------------------------------

function AutoFit({ url }: { url: string }) {
  const bounds = useBounds();
  const camera = useThree((state) => state.camera);
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    // Fit camera once per unique model URL — not on every render
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    const timer = setTimeout(() => {
      bounds.refresh().clip().fit();
      const { center, distance } = bounds.getSize();
      const isFlatView = url.startsWith("flat:");
      const direction = isFlatView
        ? new THREE.Vector3(0.95, 0.72, 1.18)
        : camera.position.clone().sub(center);
      if (direction.lengthSq() < 1e-6) {
        direction.set(0.35, 0.25, 1);
      }
      direction.normalize();
      bounds
        .moveTo(center.clone().addScaledVector(direction, distance * (isFlatView ? 1.72 : 1.58)))
        .lookAt({ target: center });
    }, 180);
    return () => clearTimeout(timer);
  }, [url, bounds, camera]);
  return null;
}

// ---------------------------------------------------------------------------
// Studio lighting — manual three-point + rim, no CDN fetch
// ---------------------------------------------------------------------------

function StudioLights() {
  return (
    <>
      <hemisphereLight args={["#fff3de", "#31445f", 0.95]} />
      <directionalLight position={[5, 9, 4]} intensity={2.25} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} color="#fff8f0" />
      <directionalLight position={[-5, 3, -2]} intensity={0.8} color="#d4e3ff" />
      <directionalLight position={[0, 4, -9]} intensity={0.55} color="#ffffff" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Engravable zone rings — shown when tumbler is loaded but no overlay yet
// ---------------------------------------------------------------------------

function EngravableZoneRing({
  dims, modelBounds,
}: { dims: TumblerDimensions; modelBounds: THREE.Box3 }) {
  const size = modelBounds.getSize(new THREE.Vector3());
  const center = modelBounds.getCenter(new THREE.Vector3());

  // Radius: slightly proud of the model surface
  const radMm = Math.max(size.x, size.z) / 2 + 1.2;

  // Zone spans from center ± half the printable height
  const halfH = dims.printableHeightMm / 2;

  return (
    <group position={[center.x, center.y, center.z]}>
      {/* Translucent zone fill */}
      <mesh>
        <cylinderGeometry args={[radMm, radMm, dims.printableHeightMm, 64, 1, true]} />
        <meshBasicMaterial
          color="#4a8fe8" transparent opacity={0.06}
          side={THREE.BackSide} depthWrite={false}
        />
      </mesh>
      {/* Top boundary ring */}
      <mesh position={[0, halfH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radMm, 0.7, 8, 64]} />
        <meshBasicMaterial color="#4a8fe8" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {/* Bottom boundary ring */}
      <mesh position={[0, -halfH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radMm, 0.7, 8, 64]} />
        <meshBasicMaterial color="#4a8fe8" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CalibratedFrontView({
  enabled,
  modelBounds,
}: {
  enabled: boolean;
  modelBounds: THREE.Box3 | null;
}) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    if (!enabled || !modelBounds) return;
    const center = modelBounds.getCenter(new THREE.Vector3());
    const size = modelBounds.getSize(new THREE.Vector3());
    const fov = "fov" in camera ? THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) : THREE.MathUtils.degToRad(35);
    const fitHeight = size.y / Math.max(0.1, 2 * Math.tan(fov / 2));
    const fitWidth = size.x / Math.max(0.1, 2 * Math.tan(fov / 2));
    const distance = Math.max(fitHeight, fitWidth) * 1.18;
    camera.position.set(center.x, center.y, center.z + Math.max(distance, size.z + 40));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, enabled, modelBounds]);
  return null;
}

function AlignmentOrthoCamera({
  enabled,
  modelBounds,
  viewBoxMm,
}: {
  enabled: boolean;
  modelBounds: THREE.Box3 | null;
  viewBoxMm?: CanonicalDimensionCalibration["svgFrontViewBoxMm"] | null;
}) {
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const size = useThree((state) => state.size);

  useEffect(() => {
    if (!enabled || !cameraRef.current) return;
    const modelCenter = modelBounds?.getCenter(new THREE.Vector3()) ?? null;
    const modelSize = modelBounds?.getSize(new THREE.Vector3()) ?? null;
    const center = viewBoxMm
      ? new THREE.Vector3(
          viewBoxMm.x + (viewBoxMm.width / 2),
          (viewBoxMm.height / 2) - (viewBoxMm.y + (viewBoxMm.height / 2)),
          modelCenter?.z ?? 0,
        )
      : modelCenter;
    const boundsSize = viewBoxMm
      ? new THREE.Vector3(
          Math.max(viewBoxMm.width, modelSize?.x ?? 0),
          Math.max(viewBoxMm.height, modelSize?.y ?? 0),
          Math.max(1, modelSize?.z ?? 0),
        )
      : modelSize;
    if (!center || !boundsSize) return;
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
    const worldHeight = Math.max(boundsSize.y * 1.08, (boundsSize.x / Math.max(aspect, 0.1)) * 1.08, 1);
    cameraRef.current.position.set(center.x, center.y, center.z + Math.max(400, boundsSize.z + 200));
    cameraRef.current.zoom = size.height / worldHeight;
    cameraRef.current.near = 0.1;
    cameraRef.current.far = 5000;
    cameraRef.current.lookAt(center);
    cameraRef.current.updateProjectionMatrix();
  }, [enabled, modelBounds, size.height, size.width, viewBoxMm]);

  if (!enabled) return null;
  return <OrthographicCamera ref={cameraRef} makeDefault />;
}

function PreviewPerspectiveCamera({
  enabled,
  modelBounds,
  focusCenter,
  previewMode,
}: {
  enabled: boolean;
  modelBounds: THREE.Box3 | null;
  focusCenter?: THREE.Vector3 | null;
  previewMode?: "alignment-model" | "full-model" | "source-traced";
}) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const viewport = useThree((state) => state.size);
  const controls = useThree((state) => state.controls as unknown as { target: THREE.Vector3; update?: () => void } | undefined);

  useEffect(() => {
    if (!enabled || !cameraRef.current || !modelBounds) return;
    const center = focusCenter?.clone() ?? modelBounds.getCenter(new THREE.Vector3());
    const size = modelBounds.getSize(new THREE.Vector3());
    const fov = THREE.MathUtils.degToRad(cameraRef.current.fov);
    const aspect = viewport.width > 0 && viewport.height > 0
      ? viewport.width / viewport.height
      : 1;
    const isFullPreview = previewMode === "full-model";
    const tanHalfFov = Math.max(0.1, Math.tan(fov / 2));
    const fitDistanceHeight = (size.y / 2) / tanHalfFov;
    const fitDistanceWidth = (size.x / 2) / Math.max(0.1, tanHalfFov * aspect);
    const fitDistance = Math.max(
      fitDistanceHeight,
      fitDistanceWidth,
      1,
    );
    const fitMargin = isFullPreview ? 0.62 : 1.02;
    const depthPadding = Math.max(
      size.z * (isFullPreview ? 0.006 : 0.18),
      size.y * (isFullPreview ? 0.01 : 0.035),
      isFullPreview ? 1.2 : 8,
    );
    const distance = Math.max(
      (fitDistance * fitMargin) + depthPadding,
      (size.z / 2) + (isFullPreview ? 0.9 : 12),
    );
    const compositionCenter = new THREE.Vector3(
      center.x,
      center.y - size.y * (isFullPreview ? 0.012 : -0.016),
      center.z,
    );
    cameraRef.current.position.set(
      compositionCenter.x,
      compositionCenter.y,
      compositionCenter.z + distance,
    );
    cameraRef.current.lookAt(compositionCenter);
    cameraRef.current.near = 0.1;
    cameraRef.current.far = 8000;
    cameraRef.current.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(compositionCenter);
      controls.update?.();
    }
  }, [
    controls,
    enabled,
    focusCenter?.x,
    focusCenter?.y,
    focusCenter?.z,
    modelBounds,
    previewMode,
    viewport.height,
    viewport.width,
  ]);

  if (!enabled) return null;
  return <PerspectiveCamera ref={cameraRef} makeDefault fov={35} near={0.1} far={8000} />;
}

function buildZoneSpanFromTopOffsets(args: {
  topOffsetMm?: number;
  bottomOffsetMm?: number;
  fallbackTopOffsetMm?: number;
  fallbackBottomOffsetMm?: number;
  meshTopY: number;
}): { centerY: number; heightMm: number } | null {
  const topOffset = Number.isFinite(args.topOffsetMm)
    ? Math.max(0, args.topOffsetMm ?? 0)
    : Number.isFinite(args.fallbackTopOffsetMm)
      ? Math.max(0, args.fallbackTopOffsetMm ?? 0)
      : null;
  const bottomOffset = Number.isFinite(args.bottomOffsetMm)
    ? Math.max(0, args.bottomOffsetMm ?? 0)
    : Number.isFinite(args.fallbackBottomOffsetMm)
      ? Math.max(0, args.fallbackBottomOffsetMm ?? 0)
      : null;

  if (topOffset == null || bottomOffset == null || bottomOffset <= topOffset) {
    return null;
  }

  const topY = args.meshTopY - topOffset;
  const bottomY = args.meshTopY - bottomOffset;

  return {
    centerY: (topY + bottomY) / 2,
    heightMm: bottomOffset - topOffset,
  };
}

function SurfaceZoneBand({
  center,
  radiusMm,
  zone,
  color,
  fillOpacity,
  ringOpacity,
}: {
  center: THREE.Vector3;
  radiusMm: number;
  zone: { centerY: number; heightMm: number };
  color: string;
  fillOpacity: number;
  ringOpacity: number;
}) {
  const halfH = zone.heightMm / 2;

  return (
    <group position={[center.x, zone.centerY, center.z]}>
      <mesh>
        <cylinderGeometry args={[radiusMm, radiusMm, zone.heightMm, 64, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={fillOpacity}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, halfH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radiusMm, 0.7, 8, 64]} />
        <meshBasicMaterial color={color} transparent opacity={ringOpacity} depthWrite={false} />
      </mesh>
      <mesh position={[0, -halfH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radiusMm, 0.7, 8, 64]} />
        <meshBasicMaterial color={color} transparent opacity={ringOpacity} depthWrite={false} />
      </mesh>
    </group>
  );
}

function TemplateSurfaceZones({
  dims,
  modelBounds,
}: {
  dims: TumblerDimensions;
  modelBounds: THREE.Box3;
}) {
  const size = modelBounds.getSize(new THREE.Vector3());
  const center = modelBounds.getCenter(new THREE.Vector3());
  const meshTopY = center.y + size.y / 2;
  const radiusMm = Math.max(size.x, size.z) / 2 + 1.2;

  const powderTopOffsetMm = Number.isFinite(dims.bodyTopOffsetMm)
    ? Math.max(0, dims.bodyTopOffsetMm ?? 0)
    : Number.isFinite(dims.printableTopOffsetMm)
      ? Math.max(0, dims.printableTopOffsetMm ?? 0)
      : 0;
  const powderBottomOffsetMm = Number.isFinite(dims.bodyHeightMm)
    ? powderTopOffsetMm + Math.max(0, dims.bodyHeightMm ?? 0)
    : powderTopOffsetMm + Math.max(0, dims.printableHeightMm);

  const powderZone = buildZoneSpanFromTopOffsets({
    topOffsetMm: powderTopOffsetMm,
    bottomOffsetMm: powderBottomOffsetMm,
    meshTopY,
  });

  const silverZone = buildZoneSpanFromTopOffsets({
    topOffsetMm: dims.lidSeamFromOverallMm,
    bottomOffsetMm: dims.silverBandBottomFromOverallMm,
    fallbackTopOffsetMm: dims.bodyTopOffsetMm,
    fallbackBottomOffsetMm: dims.printableTopOffsetMm,
    meshTopY,
  });

  return (
    <>
      {powderZone && (
        <SurfaceZoneBand
          center={center}
          radiusMm={radiusMm}
          zone={powderZone}
          color="#4ade80"
          fillOpacity={0.08}
          ringOpacity={0.28}
        />
      )}
      {silverZone && (
        <SurfaceZoneBand
          center={center}
          radiusMm={radiusMm + 0.2}
          zone={silverZone}
          color="#d8dde6"
          fillOpacity={0.16}
          ringOpacity={0.34}
        />
      )}
    </>
  );
}

function buildSolidLatheCupGeometry(
  outerProfilePoints: THREE.Vector2[],
  options?: {
    wallThicknessMm?: number;
    bottomThicknessMm?: number;
    rimDropMm?: number;
    segments?: number;
  },
): THREE.BufferGeometry | null {
  if (outerProfilePoints.length < 4) return null;
  const topPoint = outerProfilePoints[0]!;
  const bottomPoint = outerProfilePoints[outerProfilePoints.length - 1]!;
  const closedProfile = [
    new THREE.Vector2(0.01, topPoint.y),
    ...outerProfilePoints,
    new THREE.Vector2(0.01, bottomPoint.y),
  ];

  const geometry = new THREE.LatheGeometry(closedProfile, options?.segments ?? 96);
  geometry.rotateY(Math.PI);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildCanonicalBodyGeometry(bodyProfile: CanonicalBodyProfile, totalHeightMm: number): THREE.BufferGeometry | null {
  if (bodyProfile.samples.length < 4) return null;
  const profilePoints = bodyProfile.samples.map(
    (sample) => new THREE.Vector2(
      Math.max(sample.radiusMm, 0.1),
      (totalHeightMm / 2) - sample.yMm,
    ),
  );
  return buildSolidLatheCupGeometry(profilePoints, {
    wallThicknessMm: Math.max(2, Math.min(3.4, totalHeightMm * 0.0105)),
    bottomThicknessMm: Math.max(3.2, Math.min(5.4, totalHeightMm * 0.018)),
    rimDropMm: 1.6,
    segments: 96,
  });
}

function interpolateBodyRadiusMm(bodyProfile: CanonicalBodyProfile, yMm: number): number {
  const samples = bodyProfile.samples;
  if (!samples.length) return 0;
  if (samples.length === 1) return Math.max(samples[0]!.radiusMm, 0);
  const clampedY = clamp(yMm, samples[0]!.yMm, samples[samples.length - 1]!.yMm);
  for (let index = 1; index < samples.length; index += 1) {
    const prev = samples[index - 1]!;
    const next = samples[index]!;
    if (clampedY <= next.yMm) {
      const span = Math.max(0.0001, next.yMm - prev.yMm);
      const t = clamp((clampedY - prev.yMm) / span, 0, 1);
      return THREE.MathUtils.lerp(prev.radiusMm, next.radiusMm, t);
    }
  }
  return Math.max(samples[samples.length - 1]!.radiusMm, 0);
}

function buildRegistrationShellGeometry(args: {
  svgPath: string;
  viewBoxMm: CanonicalDimensionCalibration["svgFrontViewBoxMm"];
  extrusionDepthMm?: number;
}): THREE.ExtrudeGeometry | null {
  const svgPath = args.svgPath.trim();
  if (!svgPath) return null;
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${svgPath}" /></svg>`;
  const data = new SVGLoader().parse(svgText);
  const shapes = data.paths.flatMap((path) => SVGLoader.createShapes(path));
  if (!shapes.length) return null;
  const extrusionDepthMm = Math.max(0.6, args.extrusionDepthMm ?? 1.6);
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: extrusionDepthMm,
    bevelEnabled: false,
    curveSegments: 32,
    steps: 1,
  });
  // Canonical SVG/front space is Y-down from the top of the overall product.
  // Normalize exactly once into the viewer's centered Y-up world space.
  geometry.scale(1, -1, 1);
  geometry.translate(0, args.viewBoxMm.y + (args.viewBoxMm.height / 2), 0);
  geometry.translate(0, 0, -extrusionDepthMm / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function computeCanonicalBodyBounds(bodyProfile: CanonicalBodyProfile, totalHeightMm: number): THREE.Box3 | null {
  if (bodyProfile.samples.length < 2) return null;
  const maxRadius = bodyProfile.samples.reduce((max, sample) => Math.max(max, sample.radiusMm), 0);
  if (!(maxRadius > 0)) return null;
  return new THREE.Box3(
    new THREE.Vector3(-maxRadius, -totalHeightMm / 2, -maxRadius),
    new THREE.Vector3(maxRadius, totalHeightMm / 2, maxRadius),
  );
}

function computeRegistrationShellBounds(viewBoxMm: CanonicalDimensionCalibration["svgFrontViewBoxMm"]): THREE.Box3 {
  const minX = viewBoxMm.x;
  const maxX = viewBoxMm.x + viewBoxMm.width;
  const maxY = (viewBoxMm.height / 2) - viewBoxMm.y;
  const minY = maxY - viewBoxMm.height;
  return new THREE.Box3(
    new THREE.Vector3(minX, minY, -1),
    new THREE.Vector3(maxX, maxY, 1),
  );
}

function computePreviewFitBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const fitBounds = new THREE.Box3();
  const childBounds = new THREE.Box3();
  let hasIncludedGeometry = false;

  root.traverse((child) => {
    let current: THREE.Object3D | null = child;
    while (current) {
      if (current.userData?.excludeFromPreviewFit) return;
      current = current.parent;
    }

    const maybeMesh = child as THREE.Mesh;
    const geometry = maybeMesh.geometry;
    if (!geometry || typeof geometry.computeBoundingBox !== "function") return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;

    childBounds.copy(geometry.boundingBox).applyMatrix4(maybeMesh.matrixWorld);
    fitBounds.union(childBounds);
    hasIncludedGeometry = true;
  });

  if (!hasIncludedGeometry || fitBounds.isEmpty()) {
    return new THREE.Box3().setFromObject(root);
  }

  return fitBounds;
}

function box3ApproximatelyEquals(a: THREE.Box3 | null, b: THREE.Box3, epsilon = 0.01): boolean {
  if (!a) return false;
  return (
    Math.abs(a.min.x - b.min.x) <= epsilon &&
    Math.abs(a.min.y - b.min.y) <= epsilon &&
    Math.abs(a.min.z - b.min.z) <= epsilon &&
    Math.abs(a.max.x - b.max.x) <= epsilon &&
    Math.abs(a.max.y - b.max.y) <= epsilon &&
    Math.abs(a.max.z - b.max.z) <= epsilon
  );
}

function box3ToPreviewBoundsSnapshot(bounds: THREE.Box3 | null): TumblerPreviewBoundsSnapshot | null {
  if (!bounds || bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  return {
    widthMm: Math.max(size.x, 0),
    heightMm: Math.max(size.y, 0),
    depthMm: Math.max(size.z, 0),
  };
}

function buildCanonicalHandleGeometry(args: {
  handleProfile: CanonicalHandleProfile;
  calibration: CanonicalDimensionCalibration;
  totalHeightMm: number;
}): { geometry: THREE.BufferGeometry; extrusionDepthMm: number } | null {
  const { handleProfile, calibration, totalHeightMm } = args;
  if (handleProfile.outerContour.length < 3 || handleProfile.widthProfile.length < 1) {
    return null;
  }

  const [sx = 1, , tx = 0, , sy = 1, ty = 0] = calibration.photoToFrontTransform.matrix;
  const pxToMmX = (xPx: number) => (xPx * sx) + tx;
  const pxToMmY = (yPx: number) => (yPx * sy) + ty;
  const yToScene = (yMm: number) => (totalHeightMm / 2) - yMm;
  const robustWidths = handleProfile.widthProfile
    .map((sample) => Math.max(1.2, Math.abs(sample.widthPx * sx)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (robustWidths.length === 0) return null;
  const profileExtrusionDepthMm = robustWidths[Math.floor(robustWidths.length / 2)] ?? 6;
  const extrusionDepthMm = handleProfile.symmetricExtrusionWidthPx && Number.isFinite(handleProfile.symmetricExtrusionWidthPx)
    ? Math.max(1.2, Math.abs(handleProfile.symmetricExtrusionWidthPx * sx))
    : profileExtrusionDepthMm;

  const toFrontPoint = (point: { x: number; y: number }) => new THREE.Vector2(
    pxToMmX(point.x),
    yToScene(pxToMmY(point.y)),
  );

  const outerPoints = handleProfile.outerContour.map(toFrontPoint);
  const innerPoints = handleProfile.innerContour.map(toFrontPoint);
  if (outerPoints.length < 3) return null;

  const shape = new THREE.Shape();
  shape.setFromPoints(outerPoints);
  if (innerPoints.length >= 3) {
    const hole = new THREE.Path();
    hole.setFromPoints(innerPoints);
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: extrusionDepthMm,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.9, extrusionDepthMm * 0.12),
    bevelThickness: Math.min(0.7, extrusionDepthMm * 0.1),
    curveSegments: 24,
  });
  geometry.translate(0, 0, -extrusionDepthMm / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    extrusionDepthMm,
  };
}

function buildSweptCanonicalHandleGeometry(args: {
  handleProfile: CanonicalHandleProfile;
  calibration: CanonicalDimensionCalibration;
  totalHeightMm: number;
}): { geometry: THREE.BufferGeometry; extrusionDepthMm: number } | null {
  const { handleProfile, calibration, totalHeightMm } = args;
  if (handleProfile.centerline.length < 3) {
    return null;
  }

  const [sx = 1, , tx = 0, , sy = 1, ty = 0] = calibration.photoToFrontTransform.matrix;
  const pxToMmX = (xPx: number) => (xPx * sx) + tx;
  const pxToMmY = (yPx: number) => (yPx * sy) + ty;
  const yToScene = (yMm: number) => (totalHeightMm / 2) - yMm;

  const robustDepths = [
    handleProfile.symmetricExtrusionWidthPx && Number.isFinite(handleProfile.symmetricExtrusionWidthPx)
      ? Math.max(1.2, Math.abs(handleProfile.symmetricExtrusionWidthPx * sx))
      : null,
    handleProfile.upperAttachmentWidthPx && Number.isFinite(handleProfile.upperAttachmentWidthPx)
      ? Math.max(1.2, Math.abs(handleProfile.upperAttachmentWidthPx * sx))
      : null,
    handleProfile.lowerAttachmentWidthPx && Number.isFinite(handleProfile.lowerAttachmentWidthPx)
      ? Math.max(1.2, Math.abs(handleProfile.lowerAttachmentWidthPx * sx))
      : null,
  ].filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const extrusionDepthMm = robustDepths.length > 0
    ? robustDepths.reduce((sum, value) => sum + value, 0) / robustDepths.length
    : 6;
  const tubeRadiusMm = THREE.MathUtils.clamp(extrusionDepthMm * 0.5, 1.4, 18);

  const points: THREE.Vector3[] = [];
  const upperAnchor = new THREE.Vector3(
    pxToMmX(handleProfile.anchors.upper.xPx),
    yToScene(pxToMmY(handleProfile.anchors.upper.yPx)),
    0,
  );
  const lowerAnchor = new THREE.Vector3(
    pxToMmX(handleProfile.anchors.lower.xPx),
    yToScene(pxToMmY(handleProfile.anchors.lower.yPx)),
    0,
  );
  points.push(upperAnchor);
  handleProfile.centerline.forEach((point) => {
    points.push(new THREE.Vector3(
      pxToMmX(point.x),
      yToScene(pxToMmY(point.y)),
      0,
    ));
  });
  points.push(lowerAnchor);

  const dedupedPoints = points.filter((point, index) => {
    if (index === 0) return true;
    return point.distanceTo(points[index - 1]!) > 0.35;
  });
  if (dedupedPoints.length < 4) {
    return null;
  }

  const curve = new THREE.CatmullRomCurve3(dedupedPoints, false, "centripetal", 0.35);
  const tubularSegments = THREE.MathUtils.clamp(dedupedPoints.length * 12, 48, 180);
  const radialSegments = 18;
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, tubeRadiusMm, radialSegments, false);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    extrusionDepthMm: tubeRadiusMm * 2,
  };
}

function createRoundedRectPath(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}): THREE.Shape {
  const { x, y, width, height } = args;
  const radius = clamp(args.radius, 0, Math.min(width, height) / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function buildSimplifiedCanonicalHandleGeometry(args: {
  handleProfile: CanonicalHandleProfile;
  calibration: CanonicalDimensionCalibration;
  totalHeightMm: number;
}): { geometry: THREE.BufferGeometry; extrusionDepthMm: number } | null {
  const extracted = buildCanonicalHandleGeometry(args);
  if (!args.handleProfile.outerContour.length || !args.handleProfile.widthProfile.length) {
    return null;
  }

  const [sx = 1, , tx = 0, , sy = 1, ty = 0] = args.calibration.photoToFrontTransform.matrix;
  const pxToMmX = (xPx: number) => (xPx * sx) + tx;
  const pxToMmY = (yPx: number) => (yPx * sy) + ty;
  const yToScene = (yMm: number) => (args.totalHeightMm / 2) - yMm;
  const outerXs = args.handleProfile.outerContour.map((point) => pxToMmX(point.x));
  const outerYs = args.handleProfile.outerContour.map((point) => yToScene(pxToMmY(point.y)));
  if (!outerXs.length || !outerYs.length) return extracted;
  const outerMinX = Math.min(...outerXs);
  const outerMaxX = Math.max(...outerXs);
  const outerMinY = Math.min(...outerYs);
  const outerMaxY = Math.max(...outerYs);
  const outerWidth = Math.max(4, outerMaxX - outerMinX);
  const outerHeight = Math.max(8, outerMaxY - outerMinY);

  const robustWidths = args.handleProfile.widthProfile
    .map((sample) => Math.max(1.2, Math.abs(sample.widthPx * sx)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const profileExtrusionDepthMm = robustWidths[Math.floor(robustWidths.length / 2)] ?? extracted?.extrusionDepthMm ?? 8;
  const extrusionDepthMm = args.handleProfile.symmetricExtrusionWidthPx && Number.isFinite(args.handleProfile.symmetricExtrusionWidthPx)
    ? Math.max(1.2, Math.abs(args.handleProfile.symmetricExtrusionWidthPx * sx))
    : profileExtrusionDepthMm;

  const innerWidth = args.handleProfile.openingBox
    ? Math.max(outerWidth * 0.28, args.handleProfile.openingBox.w * sx)
    : Math.max(outerWidth * 0.34, outerWidth - (extrusionDepthMm * 2.2));
  const innerHeight = args.handleProfile.openingBox
    ? Math.max(outerHeight * 0.28, args.handleProfile.openingBox.h * sy)
    : Math.max(outerHeight * 0.52, outerHeight - (extrusionDepthMm * 1.8));
  const insetX = Math.max(extrusionDepthMm * 0.55, (outerWidth - innerWidth) / 2);
  const insetY = Math.max(extrusionDepthMm * 0.5, (outerHeight - innerHeight) / 2);

  const shape = createRoundedRectPath({
    x: outerMinX,
    y: outerMinY,
    width: outerWidth,
    height: outerHeight,
    radius: Math.min(outerWidth, outerHeight) * 0.16,
  });
  const hole = createRoundedRectPath({
    x: outerMinX + insetX,
    y: outerMinY + insetY,
    width: Math.max(2, innerWidth),
    height: Math.max(2, innerHeight),
    radius: Math.min(innerWidth, innerHeight) * 0.18,
  });
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: extrusionDepthMm,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.8, extrusionDepthMm * 0.12),
    bevelThickness: Math.min(0.6, extrusionDepthMm * 0.1),
    curveSegments: 20,
  });
  geometry.translate(0, 0, -extrusionDepthMm / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    extrusionDepthMm,
  };
}

function buildEditableHandleGeometry(args: {
  bodyProfile: CanonicalBodyProfile;
  totalHeightMm: number;
  handle: EditableHandlePreview;
}): { geometry: THREE.BufferGeometry; extrusionDepthMm: number } | null {
  const { bodyProfile, totalHeightMm, handle } = args;
  if (
    !(handle.bottomFromOverallMm > handle.topFromOverallMm) ||
    !(handle.reachMm > 0)
  ) {
    return null;
  }

  const tubeDiameterMm = THREE.MathUtils.clamp(
    handle.tubeDiameterMm ?? Math.max(8, handle.reachMm * 0.34),
    5,
    28,
  );
  const outerOffsetMm = THREE.MathUtils.clamp(
    handle.outerOffsetMm > 0 ? handle.outerOffsetMm : tubeDiameterMm,
    2,
    Math.max(4, handle.reachMm * 0.72),
  );
  const sideSign = handle.side === "left" ? -1 : 1;
  const yToScene = (yMm: number) => (totalHeightMm / 2) - yMm;
  const clampReach = (value: number | undefined | null, fallback: number) => (
    THREE.MathUtils.clamp(
      Number.isFinite(value) ? value ?? fallback : fallback,
      0,
      Math.max(2, handle.reachMm + outerOffsetMm),
    )
  );
  const signedX = (yMm: number, reachMm: number) => {
    const radiusMm = interpolateBodyRadiusMm(bodyProfile, yMm);
    return sideSign * (radiusMm + Math.max(0, reachMm));
  };
  const toFrontPoint = (yMm: number, reachMm: number) => ({
    x: signedX(yMm, reachMm),
    y: yToScene(yMm),
  });
  const innerUpperTransitionReach = clampReach(handle.upperTransitionReachMm, handle.reachMm * 0.55);
  const innerUpperCornerReach = clampReach(handle.upperCornerReachMm, handle.reachMm * 0.76);
  const innerLowerCornerReach = clampReach(handle.lowerCornerReachMm, handle.reachMm * 0.76);
  const innerLowerTransitionReach = clampReach(handle.lowerTransitionReachMm, handle.reachMm * 0.55);
  const solved = solveEditableHandlePreviewGeometry({
    handle: {
      ...handle,
      outerOffsetMm,
      upperTransitionReachMm: innerUpperTransitionReach,
      upperCornerReachMm: innerUpperCornerReach,
      lowerCornerReachMm: innerLowerCornerReach,
      lowerTransitionReachMm: innerLowerTransitionReach,
    },
    toPoint: (fromOverallMm, reachMm) => toFrontPoint(fromOverallMm, reachMm),
  });

  const shape = new THREE.Shape();
  shape.moveTo(solved.outerPoints.attachTop.x, solved.outerPoints.attachTop.y);
  shape.lineTo(solved.outerPoints.upperTransition.x, solved.outerPoints.upperTransition.y);
  shape.quadraticCurveTo(
    solved.outerPoints.upperCorner.x,
    solved.outerPoints.upperTransition.y,
    solved.outerPoints.upperCorner.x,
    solved.outerPoints.upperCorner.y,
  );
  shape.lineTo(solved.outerPoints.lowerCorner.x, solved.outerPoints.lowerCorner.y);
  shape.quadraticCurveTo(
    solved.outerPoints.lowerCorner.x,
    solved.outerPoints.lowerTransition.y,
    solved.outerPoints.lowerTransition.x,
    solved.outerPoints.lowerTransition.y,
  );
  shape.lineTo(solved.outerPoints.attachBottom.x, solved.outerPoints.attachBottom.y);
  shape.lineTo(solved.innerPoints.attachBottom.x, solved.innerPoints.attachBottom.y);
  shape.lineTo(solved.innerPoints.lowerTransition.x, solved.innerPoints.lowerTransition.y);
  shape.quadraticCurveTo(
    solved.innerPoints.lowerCorner.x,
    solved.innerPoints.lowerTransition.y,
    solved.innerPoints.lowerCorner.x,
    solved.innerPoints.lowerCorner.y,
  );
  shape.lineTo(solved.innerPoints.upperCorner.x, solved.innerPoints.upperCorner.y);
  shape.quadraticCurveTo(
    solved.innerPoints.upperCorner.x,
    solved.innerPoints.upperTransition.y,
    solved.innerPoints.upperTransition.x,
    solved.innerPoints.upperTransition.y,
  );
  shape.lineTo(solved.innerPoints.attachTop.x, solved.innerPoints.attachTop.y);
  shape.lineTo(solved.outerPoints.attachTop.x, solved.outerPoints.attachTop.y);

  const outlineDepthMm = THREE.MathUtils.clamp(
    Math.max(tubeDiameterMm * 0.96, outerOffsetMm * 0.82),
    5.5,
    26,
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: outlineDepthMm,
    bevelEnabled: true,
    steps: 8,
    bevelSegments: 24,
    bevelSize: THREE.MathUtils.clamp(outlineDepthMm * 0.32, 1.8, 6.2),
    bevelThickness: THREE.MathUtils.clamp(outlineDepthMm * 0.4, 1.9, 6.4),
    curveSegments: 96,
  });
  geometry.translate(0, 0, -outlineDepthMm / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    extrusionDepthMm: outlineDepthMm,
  };
}

function resolveTopAssemblyMeasurements(args: {
  dims: TumblerDimensions;
  totalHeightMm: number;
}) {
  const { dims, totalHeightMm } = args;
  const topRadius = Math.max(1, (dims.topDiameterMm ?? dims.diameterMm) / 2);
  const measuredBodyTopMm = Number.isFinite(dims.bodyTopOffsetMm)
    ? Math.max(0, dims.bodyTopOffsetMm ?? 0)
    : null;
  const fallbackRingTopMm = clamp(topRadius * 0.105, 7, 13.5);
  const measuredRingTopMm = clamp(
    dims.lidSeamFromOverallMm ?? fallbackRingTopMm,
    2.2,
    measuredBodyTopMm != null ? Math.max(2.2, measuredBodyTopMm - 1.1) : totalHeightMm * 0.18,
  );
  const defaultSilverBandHeightMm = clamp(topRadius * 0.054, 3.8, 5.8);
  const measuredRingBottomMm =
    dims.silverBandBottomFromOverallMm != null && dims.silverBandBottomFromOverallMm > measuredRingTopMm
      ? dims.silverBandBottomFromOverallMm
      : (measuredRingTopMm + defaultSilverBandHeightMm);
  const bodyTopMm = measuredBodyTopMm != null
    ? measuredBodyTopMm
    : measuredRingBottomMm;
  const measuredVisibleBandHeightMm = Math.max(0.8, measuredRingBottomMm - measuredRingTopMm);
  const silverBandHeightMm = clamp(
    measuredVisibleBandHeightMm,
    defaultSilverBandHeightMm * 0.92,
    defaultSilverBandHeightMm,
  );
  const bandBottomGapMm = clamp(topRadius * 0.006, 0.04, 0.16);
  const ringBottomMm = Math.max(measuredRingTopMm + silverBandHeightMm, bodyTopMm - bandBottomGapMm);
  const ringTopMm = Math.max(2.2, ringBottomMm - silverBandHeightMm);
  const lidHeightMm = Math.max(1.1, ringTopMm);
  const gasketHeightMm = clamp(silverBandHeightMm * 0.032, 0.09, 0.2);
  const gasketTopMm = Math.min(
    ringBottomMm + 0.06,
    bodyTopMm > ringBottomMm ? bodyTopMm - gasketHeightMm : ringBottomMm + 0.06,
  );

  return {
    topRadius,
    bodyTopMm,
    ringTopMm,
    ringBottomMm,
    lidHeightMm,
    silverBandHeightMm,
    gasketHeightMm,
    gasketTopMm,
  };
}

function SimplifiedRim({
  dims,
  calibration,
  totalHeightMm,
  bodyTintColor,
  lidTintColor,
  rimTintColor,
  ringFinish,
  lidAssemblyPreset,
}: {
  dims: TumblerDimensions;
  calibration?: CanonicalDimensionCalibration | null;
  totalHeightMm: number;
  bodyTintColor?: string;
  lidTintColor?: string;
  rimTintColor?: string;
  ringFinish?: import("@/types/productTemplate").ProductTemplateRingFinish;
  lidAssemblyPreset?: LidAssemblyPreset | null;
}) {
  void calibration;
  const {
    topRadius,
    bodyTopMm,
    ringTopMm,
    ringBottomMm,
    lidHeightMm,
    silverBandHeightMm,
    gasketHeightMm,
    gasketTopMm,
  } = useMemo(
    () => resolveTopAssemblyMeasurements({ dims, totalHeightMm }),
    [dims, totalHeightMm],
  );
  const lidShellCenterY = (totalHeightMm / 2) - (lidHeightMm / 2);
  const silverBandCenterY = (totalHeightMm / 2) - ((ringTopMm + ringBottomMm) / 2);
  const gasketCenterY = (totalHeightMm / 2) - (gasketTopMm + (gasketHeightMm / 2));
  const topInsetHeightMm = lidAssemblyPreset?.topInsetHeightMm ?? clamp(topRadius * 0.0068, 0.18, 0.34);
  const topInsetCenterY = (totalHeightMm / 2) - (topInsetHeightMm / 2) - 0.06;
  const topInsetRadius = topRadius * (lidAssemblyPreset?.topInsetRadiusScale ?? 0.57);
  const lidShellRadius = topRadius * (lidAssemblyPreset?.lidShellRadiusScale ?? 1.004);
  const lidLipHeightMm = lidAssemblyPreset?.lidLipHeightMm ?? clamp(topRadius * 0.0105, 0.26, 0.52);
  const lidLipInsetMm = lidAssemblyPreset?.lidLipInsetMm ?? clamp(topRadius * 0.018, 0.52, 0.96);
  const strawRadiusMm = clamp(topRadius * (lidAssemblyPreset?.strawRadiusScale ?? 0.053), 2.6, 4.1);
  const strawHeightMm = lidAssemblyPreset?.strawHeightMm ?? clamp(totalHeightMm * 0.034, 5.8, 8.6);
  const strawCenterY = (totalHeightMm / 2) + (strawHeightMm / 2) - 0.05;
  const grommetRadius = topRadius * (lidAssemblyPreset?.grommetRadiusScale ?? 0.115);
  const grommetHeightMm = lidAssemblyPreset?.grommetHeightMm ?? clamp(topRadius * 0.0045, 0.12, 0.2);
  const strawGrommetY = (totalHeightMm / 2) - (grommetHeightMm / 2) - 0.04;
  const strawX = 0;
  const strawZ = 0;
  const lidShellGeometry = useMemo(() => {
    const halfHeight = lidHeightMm / 2;
    const upperShoulderDrop = lidAssemblyPreset?.upperShoulderDropMm ?? clamp(lidHeightMm * 0.035, 0.22, 0.44);
    const lowerShoulderRise = lidAssemblyPreset?.lowerShoulderRiseMm ?? clamp(lidHeightMm * 0.05, 0.24, 0.54);
    const outerRadius = lidShellRadius;
    const lowerRadius = topRadius * (lidAssemblyPreset?.lidLowerRadiusScale ?? 0.992);
    const topPlateauRadius = outerRadius * (lidAssemblyPreset?.lidTopPlateauScale ?? 0.94);
    const lipRadius = Math.max(topPlateauRadius - lidLipInsetMm, outerRadius * 0.84);
    const points = [
      new THREE.Vector2(0.01, halfHeight),
      new THREE.Vector2(topPlateauRadius, halfHeight),
      new THREE.Vector2(lipRadius, halfHeight - (lidLipHeightMm * 0.24)),
      new THREE.Vector2(outerRadius * 0.982, halfHeight - lidLipHeightMm),
      new THREE.Vector2(outerRadius * 0.992, halfHeight - upperShoulderDrop),
      new THREE.Vector2(outerRadius, -halfHeight + lowerShoulderRise),
      new THREE.Vector2(lowerRadius, -halfHeight),
    ];
    const geometry = new THREE.LatheGeometry(points, 112);
    geometry.rotateY(Math.PI);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [lidAssemblyPreset, lidHeightMm, lidLipHeightMm, lidLipInsetMm, lidShellRadius, topRadius]);
  useEffect(() => () => {
    lidShellGeometry.dispose();
  }, [lidShellGeometry]);
  const lidBaseColor = lidTintColor ?? bodyTintColor ?? "#f1f3f5";
  const lidInsetColor = (() => {
    const base = new THREE.Color(lidBaseColor);
    return `#${base.clone().offsetHSL(0, -0.02, -0.04).getHexString()}`;
  })();
  const lidShellColor = lidBaseColor;
  const strawColor = (() => {
    const base = new THREE.Color("#edf2f7");
    return `#${base.clone().offsetHSL(0.01, -0.02, -0.01).getHexString()}`;
  })();
  const silverBandColor = (() => {
    const base = new THREE.Color(
      ringFinish === "tinted"
        ? (rimTintColor ?? "#edf2f6")
        : "#edf2f6",
    );
    return `#${base.getHexString()}`;
  })();
  const resolvedSilverBandHeightMm = lidAssemblyPreset?.silverBandHeightMm ?? silverBandHeightMm;
  const resolvedGasketHeightMm = lidAssemblyPreset?.gasketHeightMm ?? gasketHeightMm;
  const resolvedGasketTopMm = Math.min(
    ringBottomMm + (lidAssemblyPreset?.gasketGapMm ?? 0.06),
    Math.max(ringBottomMm, bodyTopMm - resolvedGasketHeightMm),
  );
  const resolvedGasketCenterY = (totalHeightMm / 2) - (resolvedGasketTopMm + (resolvedGasketHeightMm / 2));
  const silverBandOuterRadius = topRadius * (lidAssemblyPreset?.silverBandRadiusScale ?? 1.0005);
  return (
    <group>
      <mesh geometry={lidShellGeometry} position={[0, lidShellCenterY, 0]}>
        <meshPhysicalMaterial
          color={lidShellColor}
          metalness={0.01}
          roughness={0.32}
          clearcoat={0.26}
          clearcoatRoughness={0.18}
          transparent={false}
          opacity={1}
        />
      </mesh>
      <mesh position={[0, topInsetCenterY, 0]}>
        <cylinderGeometry args={[topInsetRadius, topInsetRadius * 1.002, topInsetHeightMm, 112]} />
        <meshPhysicalMaterial
          color={lidInsetColor}
          metalness={0.015}
          roughness={0.42}
          clearcoat={0.08}
          clearcoatRoughness={0.24}
          transparent={false}
          opacity={1}
        />
      </mesh>
      <mesh position={[0, resolvedGasketCenterY, 0]}>
        <cylinderGeometry args={[topRadius * 0.998, topRadius * 1.001, resolvedGasketHeightMm, 112]} />
        <meshPhysicalMaterial
          color="#14191f"
          metalness={0.02}
          roughness={0.62}
          clearcoat={0.02}
          clearcoatRoughness={0.28}
          transparent={false}
          opacity={1}
        />
      </mesh>
      <mesh position={[0, silverBandCenterY, 0]}>
        <cylinderGeometry args={[silverBandOuterRadius * 1.012, silverBandOuterRadius * 1.015, resolvedSilverBandHeightMm, 144]} />
        <meshStandardMaterial
          color={silverBandColor}
          metalness={0.56}
          roughness={0.18}
          emissive="#0f1318"
          emissiveIntensity={0.08}
          transparent={false}
          opacity={1}
        />
      </mesh>
      <mesh position={[strawX, strawCenterY, strawZ]} userData={{ excludeFromPreviewFit: true }}>
        <cylinderGeometry args={[strawRadiusMm * 0.98, strawRadiusMm, strawHeightMm, 36]} />
        <meshPhysicalMaterial
          color={strawColor}
          metalness={0.01}
          roughness={0.42}
          transmission={0.01}
          clearcoat={0.18}
          clearcoatRoughness={0.18}
          transparent={false}
          opacity={1}
        />
      </mesh>
      <mesh position={[strawX, strawGrommetY, strawZ]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[grommetRadius, grommetHeightMm, 16, 64]} />
        <meshPhysicalMaterial
          color={lidInsetColor}
          metalness={0.04}
          roughness={0.36}
          clearcoat={0.14}
          clearcoatRoughness={0.2}
          transparent={false}
          opacity={1}
        />
      </mesh>
    </group>
  );
}

export function CanonicalAlignmentTumbler({
  dims,
  bodyProfile,
  handleProfile,
  editableHandlePreview,
  calibration,
  previewMode,
  bodyTintColor,
  lidTintColor,
  rimTintColor,
  ringFinish,
  lidAssemblyPreset,
  decalItems,
  wrapWidthMm,
  printHeightMm,
  printableTopOffsetMm,
  tumblerMapping,
  handleArcDeg,
  onReady,
}: {
  dims: TumblerDimensions;
  bodyProfile: CanonicalBodyProfile;
  handleProfile?: CanonicalHandleProfile | null;
  editableHandlePreview?: EditableHandlePreview | null;
  calibration: CanonicalDimensionCalibration;
  previewMode: "alignment-model" | "full-model";
  bodyTintColor?: string;
  lidTintColor?: string;
  rimTintColor?: string;
  ringFinish?: import("@/types/productTemplate").ProductTemplateRingFinish;
  lidAssemblyPreset?: LidAssemblyPreset | null;
  decalItems?: DecalItem[];
  wrapWidthMm?: number;
  printHeightMm?: number;
  printableTopOffsetMm?: number;
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping;
  handleArcDeg?: number;
  onReady?: OnReady;
}) {
  const ref = useRef<THREE.Group>(null);
  const resolvedBodyTint = useMemo(() => new THREE.Color(bodyTintColor ?? "#93aa9b"), [bodyTintColor]);
  const fullBodyColor = useMemo(
    () => `#${resolvedBodyTint.clone().offsetHSL(0, -0.01, 0.005).getHexString()}`,
    [resolvedBodyTint],
  );
  const fullHandleColor = useMemo(
    () => `#${resolvedBodyTint.clone().offsetHSL(0, -0.008, -0.018).getHexString()}`,
    [resolvedBodyTint],
  );
  const bodyGeometry = useMemo(
    () => (
      previewMode === "alignment-model"
        ? buildRegistrationShellGeometry({
            svgPath: bodyProfile.svgPath,
            viewBoxMm: calibration.svgFrontViewBoxMm,
            extrusionDepthMm: 1.4,
          })
        : buildCanonicalBodyGeometry(bodyProfile, calibration.totalHeightMm)
    ),
    [bodyProfile, calibration.svgFrontViewBoxMm, calibration.totalHeightMm, previewMode],
  );
  const handleRenderMode = useMemo(() => {
    return resolveCanonicalHandleRenderMode({
      handleProfile,
      previewMode,
    });
  }, [handleProfile, previewMode]);
  const editableHandleGeometryData = useMemo(() => {
    if (previewMode !== "full-model" || !editableHandlePreview) return null;
    return buildEditableHandleGeometry({
      bodyProfile,
      totalHeightMm: calibration.totalHeightMm,
      handle: editableHandlePreview,
    });
  }, [bodyProfile, calibration.totalHeightMm, editableHandlePreview, previewMode]);
  const handleGeometryData = useMemo(() => {
    if (editableHandleGeometryData) return editableHandleGeometryData;
    if (!handleProfile || handleRenderMode === "hidden") return null;
    const swept = buildSweptCanonicalHandleGeometry({
      handleProfile,
      calibration,
      totalHeightMm: calibration.totalHeightMm,
    });
    if (swept) {
      return swept;
    }
    if (handleRenderMode === "simplified") {
      return buildSimplifiedCanonicalHandleGeometry({
        handleProfile,
        calibration,
        totalHeightMm: calibration.totalHeightMm,
      });
    }
    return buildCanonicalHandleGeometry({
      handleProfile,
      calibration,
      totalHeightMm: calibration.totalHeightMm,
    });
  }, [calibration, editableHandleGeometryData, handleProfile, handleRenderMode]);
  const effectiveHandleArcDeg = tumblerMapping?.handleArcDeg ?? handleArcDeg ?? 0;
  const computedWrapWidthMm = wrapWidthMm && wrapWidthMm > 0
    ? wrapWidthMm
    : calibration.wrapWidthMm;
  const computedPrintHeightMm = printHeightMm && printHeightMm > 0
    ? printHeightMm
    : dims.printableHeightMm;
  const computedPrintableTopOffsetMm = printableTopOffsetMm != null
    ? printableTopOffsetMm
    : (dims.printableTopOffsetMm ?? 0);
  const bodyRadiusLocal = useMemo(
    () => Math.max(0.0001, ...bodyProfile.samples.map((sample) => sample.radiusMm)),
    [bodyProfile.samples],
  );
  const bodyRadiusTolerance = effectiveHandleArcDeg > 0
    ? BODY_RADIUS_TOLERANCE_WITH_HANDLE
    : BODY_RADIUS_TOLERANCE_DEFAULT;
  const wrapLayout = useMemo(
    () => getTumblerWrapLayout(effectiveHandleArcDeg),
    [effectiveHandleArcDeg],
  );
  const maxCalX = computedWrapWidthMm * 0.12;
  const maxCalY = computedPrintHeightMm * 0.2;
  const maxCalRotationDeg = 35;
  const frontRotation = tumblerMapping?.frontFaceRotation ?? 0;
  const calX = THREE.MathUtils.clamp(
    tumblerMapping?.calibrationOffsetX ?? 0,
    -maxCalX,
    maxCalX,
  );
  const calY = THREE.MathUtils.clamp(
    tumblerMapping?.calibrationOffsetY ?? 0,
    -maxCalY,
    maxCalY,
  );
  const calRotation = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(
      tumblerMapping?.calibrationRotation ?? 0,
      -maxCalRotationDeg,
      maxCalRotationDeg,
    ),
  );
  const radiusMm = computedWrapWidthMm / (2 * Math.PI);
  const calAngle = radiusMm > 0 ? calX / radiusMm : 0;
  const wrapTexture = useMemo(
    () => (
      previewMode === "full-model" && decalItems?.length
        ? buildWrapTexture(decalItems, computedWrapWidthMm, computedPrintHeightMm)
        : null
    ),
    [decalItems, computedPrintHeightMm, computedWrapWidthMm, previewMode],
  );

  useEffect(() => {
    return () => {
      wrapTexture?.dispose();
    };
  }, [wrapTexture]);

  const overlayUniforms = useMemo(() => {
    if (!wrapTexture || previewMode !== "full-model") return null;
    return {
      uWrapMap: { value: wrapTexture },
      uPrintHeightMm: { value: Math.max(1, computedPrintHeightMm) },
      uPrintTopOffsetMm: { value: Math.max(0, computedPrintableTopOffsetMm) },
      uScaleFactorY: { value: 1 },
      uRimTopLocalY: { value: calibration.totalHeightMm / 2 },
      uFrontRotation: { value: frontRotation },
      uBodyRadiusLocal: { value: bodyRadiusLocal },
      uBodyRadiusTolerance: { value: bodyRadiusTolerance },
      uCalY: { value: calY },
      uCalRotation: { value: calRotation },
      uCalAngle: { value: calAngle },
      uFrontAnchorU: { value: wrapLayout.frontAnchorU },
      uAlpha: { value: 1.0 },
    };
  }, [
    bodyRadiusLocal,
    bodyRadiusTolerance,
    calAngle,
    calRotation,
    calY,
    calibration.totalHeightMm,
    computedPrintHeightMm,
    computedPrintableTopOffsetMm,
    frontRotation,
    previewMode,
    wrapLayout.frontAnchorU,
    wrapTexture,
  ]);

  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, bodyGeometry, handleGeometryData]);

  useEffect(() => () => {
    bodyGeometry?.dispose();
    handleGeometryData?.geometry.dispose();
  }, [bodyGeometry, handleGeometryData]);

  if (!bodyGeometry) return null;

  return (
    <group ref={ref}>
      <mesh geometry={bodyGeometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={previewMode === "full-model" ? fullBodyColor : (bodyTintColor ?? "#93aa9b")}
          metalness={previewMode === "alignment-model" ? 0.04 : 0.05}
          roughness={previewMode === "alignment-model" ? 0.82 : 0.46}
          clearcoat={previewMode === "alignment-model" ? 0 : 0.56}
          clearcoatRoughness={previewMode === "alignment-model" ? 1 : 0.2}
          transparent={false}
          opacity={1}
        />
      </mesh>
      {handleGeometryData && (
        <mesh geometry={handleGeometryData.geometry} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={fullHandleColor}
            metalness={previewMode === "full-model" ? 0.03 : 0.16}
            roughness={previewMode === "full-model" ? 0.42 : 0.4}
            clearcoat={previewMode === "full-model" ? 0.46 : 0.1}
            clearcoatRoughness={previewMode === "full-model" ? 0.18 : 0.36}
            transparent={false}
            opacity={1}
          />
        </mesh>
      )}
      {overlayUniforms && (
        <mesh geometry={bodyGeometry} renderOrder={2}>
          <shaderMaterial
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-8}
            polygonOffsetUnits={-1}
            side={THREE.DoubleSide}
            uniforms={overlayUniforms}
            vertexShader={CYL_OVERLAY_VERTEX_SHADER}
            fragmentShader={CYL_OVERLAY_FRAGMENT_SHADER}
          />
        </mesh>
      )}
      <SimplifiedRim
        dims={dims}
        calibration={calibration}
        totalHeightMm={calibration.totalHeightMm}
        bodyTintColor={bodyTintColor}
        lidTintColor={lidTintColor}
        rimTintColor={rimTintColor}
        ringFinish={ringFinish}
        lidAssemblyPreset={lidAssemblyPreset}
      />
    </group>
  );
}



// ---------------------------------------------------------------------------
// Format-specific mesh components — each applies physical scaling
// ---------------------------------------------------------------------------

type OnReady = (obj: THREE.Object3D) => void;

function StlMesh({
  url, dims, onReady,
}: { url: string; dims?: TumblerDimensions | null; onReady?: OnReady }) {
  const geometry = useLoader(STLLoader, url);
  geometry.computeVertexNormals();

  const transform = useMemo(() => {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox ?? new THREE.Box3();
    return computeModelTransform(bb, dims);
  }, [geometry, dims]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, geometry]);

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation} position={transform.position}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#b0b8c4" metalness={0.35} roughness={0.55} />
      </mesh>
    </group>
  );
}

function ObjMesh({
  url, dims, onReady,
}: { url: string; dims?: TumblerDimensions | null; onReady?: OnReady }) {
  const obj = useLoader(OBJLoader, url);

  const transform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(obj);
    return computeModelTransform(box, dims);
  }, [obj, dims]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, obj]);

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation} position={transform.position}>
      <primitive object={obj} castShadow receiveShadow />
    </group>
  );
}


function GltfMesh({
  url, dims, placedItems, itemTextures, bedWidthMm, bedHeightMm, tumblerMapping, bodyTintColor, lidTintColor, rimTintColor, generatedTumblerTrace, previewModelMode, onReady,
}: {
  url: string;
  dims?: TumblerDimensions | null;
  placedItems?: PlacedItem[];
  itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number;
  bedHeightMm?: number;
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping;
  bodyTintColor?: string;
  lidTintColor?: string;
  rimTintColor?: string;
  generatedTumblerTrace?: boolean;
  previewModelMode?: "alignment-model" | "full-model" | "source-traced";
  onReady?: OnReady;
}) {
  void lidTintColor;
  const gltf = useLoader(GLTFLoader, url);
  void rimTintColor;
  const ref = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);

  // ── Extract body mesh geometry + material from the GLB scene ──
  // We render the mesh explicitly (not via <primitive>) so Decals can be children.
  const bodyMeshData = useMemo(() => {
    let foundGeometry: THREE.BufferGeometry | null = null;
    let foundMaterial: THREE.Material | THREE.Material[] | null = null;
    let foundMesh: THREE.Mesh | null = null;
    const otherObjects: THREE.Object3D[] = [];

    gltf.scene.updateMatrixWorld(true);

    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !foundGeometry) {
        foundGeometry = obj.geometry;
        foundMaterial = obj.material;
        foundMesh = obj;
      }
    });

    // Collect non-body children for rendering separately
    gltf.scene.children.forEach((child) => {
      if (child === foundMesh) return;
      const clone = child.clone(true);
      clone.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.material = cloneOpaqueMaterial(obj.material) ?? obj.material;
      });
      otherObjects.push(clone);
    });

    const bodyTransform = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
    };
    const bodyMesh = foundMesh as THREE.Object3D | null;
    if (bodyMesh) {
      const relativeMatrix = new THREE.Matrix4()
        .copy(gltf.scene.matrixWorld)
        .invert()
        .multiply(bodyMesh.matrixWorld);
      relativeMatrix.decompose(
        bodyTransform.position,
        bodyTransform.quaternion,
        bodyTransform.scale,
      );
    }

    return {
      geometry: foundGeometry,
      material: cloneOpaqueMaterial(foundMaterial),
      bodyMesh: foundMesh,
      bodyTransform,
      otherObjects,
    };
  }, [gltf.scene]);

  // ── Scale to physical mm ──
  const transform = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    return computeModelTransform(box, dims);
  }, [gltf.scene, dims]);

  // ── Per-item Three.js textures (keyed by item ID) ──
  const threeTextures = useMemo(() => {
    if (!itemTextures) return new Map<string, THREE.CanvasTexture>();
    const map = new Map<string, THREE.CanvasTexture>();
    itemTextures.forEach((canvas, id) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      map.set(id, tex);
    });
    return map;
  }, [itemTextures]);

  useEffect(() => {
    return () => {
      threeTextures.forEach((texture) => texture.dispose());
    };
  }, [threeTextures]);

  // ── Compute per-item Decal configs ──
  // Bed grid is an unwrapped cylinder:
  //   width  = wrapWidthMm = π × diameter
  //   height = printHeightMm
  //   FRONT  = x center of grid from tumblerWrapLayout
  // Decal position/scale are in native (pre-scale) units because
  // the parent <group> applies transform.scale uniformly.
  const decalConfigs = useMemo(() => {
    if (!dims || !placedItems?.length || !bedWidthMm || !bedHeightMm) return [];

    const radius = bedWidthMm && bedWidthMm > 0 ? bedWidthMm / (2 * Math.PI) : ((dims.diameterMm ?? 98) / 2);
    const wrapWidth = bedWidthMm;
    const printHeight = bedHeightMm;
    const frontX = getWrapFrontCenter(wrapWidth, tumblerMapping?.handleArcDeg);
    const frontRotation = tumblerMapping?.frontFaceRotation ?? 0;
    const s = transform.scale;

    return placedItems
      .filter((item) => item.visible !== false)
      .map((item) => {
        const artCenterX = (item.x + item.width / 2) - frontX;
        const artCenterY = (printHeight / 2) - (item.y + item.height / 2);
        const angleRad = (artCenterX / radius) + frontRotation;
        const depthMm = computeDecalDepthMm(item.width, radius);
        const outwardMm = THREE.MathUtils.clamp(depthMm * 0.08, 2, 8);
        const surfaceRadius = radius + outwardMm;

        const posX = Math.sin(angleRad) * surfaceRadius;
        const posZ = Math.cos(angleRad) * surfaceRadius;
        const posY = artCenterY;

        return {
          itemId: item.id,
          position: [posX / s, posY / s, posZ / s] as [number, number, number],
          rotation: [0, -angleRad, 0] as [number, number, number],
          scale: [item.width / s, item.height / s, depthMm / s] as [number, number, number],
        };
      });
  }, [dims, placedItems, bedWidthMm, bedHeightMm, tumblerMapping?.frontFaceRotation, tumblerMapping?.handleArcDeg, transform.scale]);

  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, gltf.scene]);

  if (generatedTumblerTrace) {
    return (
      <group ref={ref} scale={transform.scale} rotation={transform.rotation} position={transform.position}>
        <primitive object={gltf.scene} castShadow receiveShadow />
      </group>
    );
  }

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation} position={transform.position}>
      {/* Body mesh rendered explicitly so Decals can be direct children */}
      {bodyMeshData.geometry && (
        <mesh
          ref={bodyRef}
          geometry={bodyMeshData.geometry}
          material={(!bodyTintColor || previewModelMode === "full-model") ? (bodyMeshData.material ?? undefined) : undefined}
          position={bodyMeshData.bodyTransform.position}
          quaternion={bodyMeshData.bodyTransform.quaternion}
          scale={bodyMeshData.bodyTransform.scale}
          castShadow
          receiveShadow
        >
          {bodyTintColor && previewModelMode !== "full-model" && (
            <meshStandardMaterial
              color={bodyTintColor}
              metalness={0.35}
              roughness={0.55}
              transparent={false}
              opacity={1}
            />
          )}
          {decalConfigs.map((cfg) => {
            const tex = threeTextures.get(cfg.itemId);
            if (!tex) return null;
            return (
              <Decal
                key={cfg.itemId}
                position={cfg.position}
                rotation={cfg.rotation}
                scale={cfg.scale}
              >
                <meshBasicMaterial
                  map={tex}
                  transparent
                  depthTest
                  depthWrite={false}
                  polygonOffset
                  polygonOffsetFactor={-10}
                />
              </Decal>
            );
          })}
        </mesh>
      )}
      {/* Render any other scene objects (handle, lid, etc.) */}
      {bodyMeshData.otherObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </group>
  );
}

// ── Build DecalItem[] from PlacedItems + texture map ──
function FlatItemPreview({
  dims,
  placedItems,
  itemTextures,
  bedWidthMm,
  bedHeightMm,
  bodyTintColor,
  onReady,
}: {
  dims: FlatPreviewDimensions;
  placedItems?: PlacedItem[];
  itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number;
  bedHeightMm?: number;
  bodyTintColor?: string;
  onReady?: OnReady;
}) {
  const ref = useRef<THREE.Group>(null);
  const topY = Math.max(0.5, dims.thicknessMm / 2);
  const surfaceWidth = bedWidthMm && bedWidthMm > 0 ? bedWidthMm : dims.widthMm;
  const surfaceHeight = bedHeightMm && bedHeightMm > 0 ? bedHeightMm : dims.heightMm;
  const geometry = useMemo(() => {
    const shape = buildFlatPreviewShape(dims);
    const nextGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.8, dims.thicknessMm),
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: Math.min(1.2, Math.max(0.18, dims.thicknessMm * 0.06)),
      bevelThickness: Math.min(0.9, Math.max(0.12, dims.thicknessMm * 0.05)),
      curveSegments: 24,
    });
    nextGeometry.center();
    nextGeometry.rotateX(-Math.PI / 2);
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [dims]);

  const materialAppearance = useMemo(
    () => getFlatPreviewMaterialAppearance(dims.material, dims.familyKey),
    [dims.material, dims.familyKey],
  );

  const threeTextures = useMemo(() => {
    if (!itemTextures) return new Map<string, THREE.CanvasTexture>();
    const map = new Map<string, THREE.CanvasTexture>();
    itemTextures.forEach((canvas, id) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      map.set(id, tex);
    });
    return map;
  }, [itemTextures]);

  useEffect(() => {
    return () => {
      threeTextures.forEach((texture) => texture.dispose());
    };
  }, [threeTextures]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const overlays = useMemo(() => {
    if (!placedItems?.length) return [];
    return placedItems
      .filter((item) => item.visible !== false)
      .map((item) => ({
        itemId: item.id,
        x: (item.x + item.width / 2) - surfaceWidth / 2,
        z: -((item.y + item.height / 2) - surfaceHeight / 2),
        y: topY + 0.2,
        width: item.width,
        height: item.height,
        rotationRad: THREE.MathUtils.degToRad(item.rotation ?? 0),
      }));
  }, [placedItems, surfaceWidth, surfaceHeight, topY]);

  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [dims, onReady]);

  return (
    <group ref={ref}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={bodyTintColor ?? materialAppearance.baseColor}
          metalness={materialAppearance.metalness}
          roughness={materialAppearance.roughness}
          clearcoat={materialAppearance.clearcoat}
          clearcoatRoughness={materialAppearance.clearcoatRoughness}
        />
      </mesh>

      {dims.familyKey === "magazine" && (
        <MagazineProxyDetails dims={dims} topY={topY} color={materialAppearance.accentColor} />
      )}

      {overlays.map((overlay) => {
        const texture = threeTextures.get(overlay.itemId);
        if (!texture) return null;
        return (
          <mesh
            key={overlay.itemId}
            position={[overlay.x, overlay.y, overlay.z]}
            rotation={[-Math.PI / 2, 0, overlay.rotationRad]}
          >
            <planeGeometry args={[overlay.width, overlay.height]} />
            <meshBasicMaterial
              map={texture}
              transparent
              side={THREE.DoubleSide}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-4}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function buildDecalItems(
  placedItems: PlacedItem[] | undefined,
  itemTextures: Map<string, HTMLCanvasElement> | undefined,
): DecalItem[] {
  if (!placedItems || !itemTextures) return [];
  return placedItems
    .filter((item) => item.visible !== false && itemTextures.has(item.id))
    .map((item) => ({
      id: item.id,
      canvas: itemTextures.get(item.id)!,
      gridX: item.x,
      gridY: item.y,
      gridW: item.width,
      gridH: item.height,
      gridRotationDeg: item.rotation ?? 0,
    }));
}

function buildManufacturerLogoPlacedItem(args: {
  stamp: import("@/types/productTemplate").ManufacturerLogoStamp;
  dims: TumblerDimensions;
  wrapWidthMm: number;
  printHeightMm: number;
  handleArcDeg?: number;
}): PlacedItem | null {
  const radiusMm = args.wrapWidthMm / (2 * Math.PI);
  if (!Number.isFinite(radiusMm) || radiusMm <= 0) return null;
  const bodyHeightMm = Math.max(args.dims.bodyHeightMm ?? args.dims.printableHeightMm, 1);
  const bodyTopOffsetMm = Number.isFinite(args.dims.bodyTopOffsetMm)
    ? Math.max(0, args.dims.bodyTopOffsetMm ?? 0)
    : Math.max(0, args.dims.printableTopOffsetMm ?? 0);
  const printTopOffsetMm = Number.isFinite(args.dims.printableTopOffsetMm)
    ? Math.max(0, args.dims.printableTopOffsetMm ?? 0)
    : bodyTopOffsetMm;
  const widthMm = Math.max(
    1,
    args.stamp.placement.widthMm ||
      (radiusMm * Math.max(0.04, args.stamp.logoPlacement.thetaSpan)),
  );
  const heightMm = Math.max(
    1,
    args.stamp.placement.heightMm ||
      (bodyHeightMm * Math.max(0.02, args.stamp.logoPlacement.sSpan)),
  );
  const centerYFromTopMm = bodyTopOffsetMm + bodyHeightMm * clamp(args.stamp.logoPlacement.sCenter, 0, 1);
  const centerXMm = getWrapFrontCenter(args.wrapWidthMm, args.handleArcDeg) +
    (radiusMm * args.stamp.logoPlacement.thetaCenter);
  const x = centerXMm - widthMm / 2;
  const y = centerYFromTopMm - printTopOffsetMm - heightMm / 2;

  return {
    id: "__manufacturer-logo__",
    assetId: "__manufacturer-logo__",
    name: "Manufacturer logo",
    svgText: "",
    sourceSvgText: "",
    documentBounds: { x: 0, y: 0, width: widthMm, height: heightMm },
    artworkBounds: { x: 0, y: 0, width: widthMm, height: heightMm },
    x,
    y,
    width: widthMm,
    height: heightMm,
    rotation: 0,
    defaults: {
      x,
      y,
      width: widthMm,
      height: heightMm,
      rotation: 0,
    },
    visible: true,
  };
}

function createRoundedRectShape(widthMm: number, heightMm: number, radiusMm: number): THREE.Shape {
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const r = Math.min(radiusMm, halfW * 0.45, halfH * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + r, -halfH);
  shape.lineTo(halfW - r, -halfH);
  shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + r);
  shape.lineTo(halfW, halfH - r);
  shape.quadraticCurveTo(halfW, halfH, halfW - r, halfH);
  shape.lineTo(-halfW + r, halfH);
  shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - r);
  shape.lineTo(-halfW, -halfH + r);
  shape.quadraticCurveTo(-halfW, -halfH, -halfW + r, -halfH);
  return shape;
}

function createDogTagShape(widthMm: number, heightMm: number): THREE.Shape {
  const radius = Math.min(widthMm, heightMm) * 0.22;
  const shape = createRoundedRectShape(widthMm, heightMm, radius);
  const hole = new THREE.Path();
  const holeRadius = Math.min(widthMm, heightMm) * 0.09;
  hole.absellipse(0, heightMm * 0.28, holeRadius, holeRadius, 0, Math.PI * 2, false, 0);
  shape.holes.push(hole);
  return shape;
}

function createMagazineShape(widthMm: number, heightMm: number): THREE.Shape {
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const shape = new THREE.Shape();
  const points: THREE.Vector2[] = [];
  const sampleCount = 18;

  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    const y = halfH - t * heightMm;
    const centerOffset = THREE.MathUtils.lerp(-halfW * 0.05, halfW * 0.14, Math.pow(t, 1.18));
    const widthFactor =
      t < 0.12
        ? THREE.MathUtils.lerp(0.34, 0.4, t / 0.12)
        : t < 0.84
          ? THREE.MathUtils.lerp(0.4, 0.47, (t - 0.12) / 0.72)
          : THREE.MathUtils.lerp(0.47, 0.5, (t - 0.84) / 0.16);
    points.push(new THREE.Vector2(centerOffset + halfW * widthFactor, y));
  }

  points.push(new THREE.Vector2(halfW * 0.56, -halfH * 0.97));
  points.push(new THREE.Vector2(halfW * 0.18, -halfH * 1.04));
  points.push(new THREE.Vector2(-halfW * 0.2, -halfH * 1.02));
  points.push(new THREE.Vector2(-halfW * 0.34, -halfH * 0.9));

  for (let i = sampleCount; i >= 0; i -= 1) {
    const t = i / sampleCount;
    const y = halfH - t * heightMm;
    const centerOffset = THREE.MathUtils.lerp(-halfW * 0.05, halfW * 0.14, Math.pow(t, 1.18));
    const widthFactor =
      t < 0.1
        ? THREE.MathUtils.lerp(0.31, 0.36, t / 0.1)
        : t < 0.82
          ? THREE.MathUtils.lerp(0.36, 0.39, (t - 0.1) / 0.72)
          : THREE.MathUtils.lerp(0.39, 0.43, (t - 0.82) / 0.18);
    points.push(new THREE.Vector2(centerOffset - halfW * widthFactor, y));
  }

  shape.setFromPoints(points);
  return shape;
}

function buildMagazineDetailLayout(dims: FlatPreviewDimensions) {
  const plateDepth = Math.max(0.24, Math.min(0.62, dims.thicknessMm * 0.08));
  return [
    { width: dims.widthMm * 0.56, height: dims.heightMm * 0.16, z: dims.heightMm * 0.14 },
    { width: dims.widthMm * 0.58, height: dims.heightMm * 0.18, z: -dims.heightMm * 0.12 },
    { width: dims.widthMm * 0.56, height: dims.heightMm * 0.18, z: -dims.heightMm * 0.38 },
    { width: dims.widthMm * 0.48, height: dims.heightMm * 0.1, z: -dims.heightMm * 0.73 },
  ].map((panel) => ({ ...panel, depth: plateDepth }));
}

function MagazineProxyDetails({
  dims,
  topY,
  color,
}: {
  dims: FlatPreviewDimensions;
  topY: number;
  color: string;
}) {
  const panels = useMemo(() => buildMagazineDetailLayout(dims), [dims]);
  const panelMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color, metalness: 0.04, roughness: 0.88 }),
    [color],
  );
  const panelGeometries = useMemo(
    () => panels.map((panel) => {
      const geometry = new THREE.ExtrudeGeometry(
        createRoundedRectShape(panel.width, panel.height, Math.min(panel.width, panel.height) * 0.16),
        {
          depth: panel.depth,
          bevelEnabled: true,
          bevelSegments: 2,
          bevelSize: Math.min(0.24, panel.depth * 0.4),
          bevelThickness: Math.min(0.14, panel.depth * 0.45),
          curveSegments: 20,
        },
      );
      geometry.center();
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }),
    [panels],
  );
  const floorplateGeometry = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(
      createRoundedRectShape(dims.widthMm * 0.94, dims.heightMm * 0.1, dims.widthMm * 0.08),
      {
        depth: Math.max(0.8, Math.min(1.6, dims.thicknessMm * 0.22)),
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.35,
        bevelThickness: 0.22,
        curveSegments: 20,
      },
    );
    geometry.center();
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [dims.heightMm, dims.thicknessMm, dims.widthMm]);

  useEffect(() => {
    return () => {
      panelMaterial.dispose();
      panelGeometries.forEach((geometry) => geometry.dispose());
      floorplateGeometry.dispose();
    };
  }, [floorplateGeometry, panelGeometries, panelMaterial]);

  return (
    <group>
      {panelGeometries.map((geometry, index) => (
        <mesh
          key={index}
          geometry={geometry}
          material={panelMaterial}
          position={[0, topY + 0.16 + panels[index].depth * 0.5, panels[index].z]}
          castShadow
          receiveShadow
        />
      ))}
      <mesh
        geometry={floorplateGeometry}
        material={panelMaterial}
        position={[dims.widthMm * 0.06, topY + 0.24, -dims.heightMm * 0.88]}
        rotation={[0, THREE.MathUtils.degToRad(-4), 0]}
        castShadow
        receiveShadow
      />
    </group>
  );
}

function createKnifeBlankShape(widthMm: number, heightMm: number): THREE.Shape {
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;
  const bladeX = halfW * 0.58;
  const tangX = -halfW * 0.14;
  const handleBulgeX = -halfW;
  const guardX = halfW * 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(handleBulgeX, -halfH * 0.22);
  shape.quadraticCurveTo(-halfW * 0.82, -halfH * 0.58, tangX, -halfH * 0.5);
  shape.lineTo(guardX, -halfH * 0.46);
  shape.lineTo(bladeX, -halfH * 0.14);
  shape.lineTo(halfW, 0);
  shape.lineTo(bladeX, halfH * 0.14);
  shape.lineTo(guardX, halfH * 0.46);
  shape.lineTo(tangX, halfH * 0.5);
  shape.quadraticCurveTo(-halfW * 0.82, halfH * 0.58, handleBulgeX, halfH * 0.22);
  shape.quadraticCurveTo(-halfW * 0.72, 0, handleBulgeX, -halfH * 0.22);
  return shape;
}

function buildFlatPreviewShape(dims: FlatPreviewDimensions): THREE.Shape {
  switch (dims.familyKey) {
    case "dog-tag":
      return createDogTagShape(dims.widthMm, dims.heightMm);
    case "magazine":
      return createMagazineShape(dims.widthMm, dims.heightMm);
    case "knife-blank":
      return createKnifeBlankShape(dims.widthMm, dims.heightMm);
    case "round-plate": {
      const radius = Math.min(dims.widthMm, dims.heightMm) / 2;
      const shape = new THREE.Shape();
      shape.absellipse(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
      return shape;
    }
    case "keychain":
    case "card":
    case "phone-case":
    case "rect-plate":
    default:
      return createRoundedRectShape(
        dims.widthMm,
        dims.heightMm,
        Math.min(dims.widthMm, dims.heightMm) * 0.12,
      );
  }
}

function getFlatPreviewMaterialAppearance(material?: string, familyKey?: string) {
  const normalized = `${material ?? ""} ${familyKey ?? ""}`.toLowerCase();
  if (normalized.includes("plastic") || normalized.includes("abs") || normalized.includes("magazine")) {
    return {
      baseColor: "#343a43",
      accentColor: "#252a31",
      metalness: 0.06,
      roughness: 0.84,
      clearcoat: 0.04,
      clearcoatRoughness: 0.88,
    };
  }
  if (normalized.includes("stainless") || normalized.includes("steel")) {
    return {
      baseColor: "#a4adb8",
      accentColor: "#d4dce6",
      metalness: 0.78,
      roughness: 0.34,
      clearcoat: 0.18,
      clearcoatRoughness: 0.28,
    };
  }
  if (normalized.includes("aluminum") || normalized.includes("anodized")) {
    return {
      baseColor: "#7d8794",
      accentColor: "#a7b0bc",
      metalness: 0.58,
      roughness: 0.42,
      clearcoat: 0.12,
      clearcoatRoughness: 0.34,
    };
  }
  if (normalized.includes("wood") || normalized.includes("bamboo")) {
    return {
      baseColor: "#8f633e",
      accentColor: "#b68357",
      metalness: 0.02,
      roughness: 0.9,
      clearcoat: 0.04,
      clearcoatRoughness: 0.86,
    };
  }
  return {
    baseColor: "#959daa",
    accentColor: "#c2c9d2",
    metalness: 0.22,
    roughness: 0.62,
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
  };
}

// Known model component registry — maps GLB path substrings to components
const KNOWN_MODELS: { match: string; key: string }[] = [
  { match: "yeti-40oz-body", key: "yeti40oz" },
  { match: "40oz-yeti", key: "yeti40oz" },
  { match: "yeti-40-0z", key: "yeti40oz" },
  { match: "yeti_40oz", key: "yeti40oz" },
];

function ModelByExtension({
  url, ext, dims, handleArcDeg, placedItems, itemTextures, bedWidthMm, bedHeightMm, glbPath, sourceName, tumblerMapping, bodyTintColor, lidTintColor, rimTintColor, lidAssemblyPreset, previewModelMode, onReady,
}: {
  url: string; ext: string; dims?: TumblerDimensions | null; handleArcDeg?: number;
  placedItems?: PlacedItem[]; itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number; bedHeightMm?: number; glbPath?: string | null;
  sourceName?: string;
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping; bodyTintColor?: string; lidTintColor?: string; rimTintColor?: string; lidAssemblyPreset?: LidAssemblyPreset | null; previewModelMode?: "alignment-model" | "full-model" | "source-traced"; onReady?: OnReady;
}) {
  if (ext === "stl") return <StlMesh url={url} dims={dims} onReady={onReady} />;
  if (ext === "obj") return <ObjMesh url={url} dims={dims} onReady={onReady} />;

  if (ext === "glb" || ext === "gltf") {
    // Check if this is a known model with a dedicated component
    const modelHint = `${glbPath ?? ""} ${sourceName ?? ""}`.toLowerCase();
    const knownModel = KNOWN_MODELS.find((m) => modelHint.includes(m.match));
    const generatedTumblerTrace = modelHint.includes("/models/generated/") || modelHint.includes("trace");

    if (knownModel?.key === "yeti40oz" && dims) {
      const decalItems = buildDecalItems(placedItems, itemTextures);
      return (
        <Suspense fallback={null}>
          <YetiRambler40oz
            placedItems={decalItems}
            diameterMm={dims.diameterMm}
            topDiameterMm={dims.topDiameterMm}
            bottomDiameterMm={dims.bottomDiameterMm}
            overallHeightMm={dims.overallHeightMm}
            printHeightMm={dims.printableHeightMm}
            printableTopOffsetMm={dims.printableTopOffsetMm ?? 0}
            wrapWidthMm={bedWidthMm ?? Math.PI * dims.diameterMm}
            handleArcDeg={handleArcDeg ?? 0}
            glbPath={glbPath ?? undefined}
            tumblerMapping={tumblerMapping}
            bodyTintColor={bodyTintColor}
            lidTintColor={lidTintColor}
            rimTintColor={rimTintColor}
            lidAssemblyPreset={lidAssemblyPreset}
            onReady={onReady}
          />
        </Suspense>
      );
    }

    // Fallback: generic GLB loader
    return (
      <Suspense fallback={null}>
        <GltfMesh url={url} dims={dims}
          placedItems={placedItems} itemTextures={itemTextures}
          bedWidthMm={bedWidthMm} bedHeightMm={bedHeightMm}
          tumblerMapping={tumblerMapping}
          bodyTintColor={bodyTintColor}
          lidTintColor={lidTintColor}
          rimTintColor={rimTintColor}
          generatedTumblerTrace={generatedTumblerTrace}
          previewModelMode={previewModelMode}
          onReady={onReady} />
      </Suspense>
    );
  }

  return (
    <Html center>
      <span style={{ color: "#f87171", fontSize: 11 }}>Unsupported format: .{ext}</span>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

class CanvasErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#161620", color: "#f87171",
          fontSize: 11, gap: 6, padding: 12, textAlign: "center",
        }}>
          <span style={{ fontSize: 22 }}>⚠</span>
          Failed to load model
          <span style={{ color: "#555", fontSize: 10 }}>
            {this.state.message.slice(0, 100)}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function ModelViewer({
  file, modelUrl, flatPreview, placedItems, itemTextures, bedWidthMm, bedHeightMm, tumblerDims, handleArcDeg, glbPath, tumblerMapping, manufacturerLogoStamp, bodyTintColor, lidTintColor, rimTintColor, ringFinish, showTemplateSurfaceZones, dimensionCalibration, canonicalBodyProfile, canonicalHandleProfile, editableHandlePreview, previewModelMode, onPipelineStage, onPreviewStateChange,
}: ModelViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [modelBounds, setModelBounds] = useState<THREE.Box3 | null>(null);
  const modelBoundsRef = useRef<THREE.Box3 | null>(null);
  const [manufacturerLogoCanvas, setManufacturerLogoCanvas] = useState<HTMLCanvasElement | null>(null);

  // Auto-rotate: on by default for tumblers; pause on user interaction, resume after 4s
  const [isAutoRotating, setIsAutoRotating] = useState(!!tumblerDims && !showTemplateSurfaceZones);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRotateDefaultsRef = useRef({
    hasTumbler: Boolean(tumblerDims),
    showTemplateSurfaceZones,
  });
  const reportPipelineStage = useCallback((stage: TemplatePipelineStageRecord) => {
    onPipelineStage?.(stage);
  }, [onPipelineStage]);

  const handleOrbitStart = useCallback(() => {
    setIsAutoRotating(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  const handleOrbitEnd = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsAutoRotating(!showTemplateSurfaceZones), 4000);
  }, [showTemplateSurfaceZones]);

  useEffect(() => {
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, []);

  useEffect(() => {
    autoRotateDefaultsRef.current = {
      hasTumbler: Boolean(tumblerDims),
      showTemplateSurfaceZones,
    };
  }, [showTemplateSurfaceZones, tumblerDims]);

  useEffect(() => {
    let cancelled = false;
    if (!manufacturerLogoStamp?.dataUrl) {
      const frameId = window.requestAnimationFrame(() => {
        if (!cancelled) setManufacturerLogoCanvas(null);
      });
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frameId);
      };
    }
    logoDataUrlToCanvas(manufacturerLogoStamp.dataUrl)
      .then((canvas) => {
        if (cancelled) return;
        setManufacturerLogoCanvas(canvas);
      })
      .catch(() => {
        if (cancelled) return;
        setManufacturerLogoCanvas(null);
      });
    return () => {
      cancelled = true;
    };
  }, [manufacturerLogoStamp?.dataUrl]);

  // Create blob URL inside useEffect — safe for React Strict Mode
  useEffect(() => {
    const nextAutoRotate = Boolean(file)
      && autoRotateDefaultsRef.current.hasTumbler
      && !autoRotateDefaultsRef.current.showTemplateSurfaceZones;
    if (!file) {
      const frameId = window.requestAnimationFrame(() => {
        setUrl((current) => (current === (modelUrl ?? null) ? current : (modelUrl ?? null)));
        modelBoundsRef.current = null;
        setModelBounds((current) => (current === null ? current : null));
        setIsAutoRotating((current) => (current === false ? current : false));
      });
      return () => window.cancelAnimationFrame(frameId);
    }
    const objectUrl = URL.createObjectURL(file);
    const frameId = window.requestAnimationFrame(() => {
      setUrl(objectUrl);
      modelBoundsRef.current = null;
      setModelBounds((current) => (current === null ? current : null));
      setIsAutoRotating((current) => (current === nextAutoRotate ? current : nextAutoRotate));
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, modelUrl]);

  const handleModelReady = useCallback((obj: THREE.Object3D) => {
    const box = computePreviewFitBounds(obj);
    if (box.isEmpty()) {
      reportPipelineStage({
        id: "viewer-sync",
        status: "skip",
        authority: "model-viewer",
        engine: "preview-bounds",
        warnings: [],
        errors: [],
        artifacts: {
          source: "model-bounds",
          action: "empty-bounds",
        },
      });
      return;
    }
    if (box3ApproximatelyEquals(modelBoundsRef.current, box)) {
      reportPipelineStage({
        id: "viewer-sync",
        status: "skip",
        authority: "model-viewer",
        engine: "preview-bounds",
        warnings: [],
        errors: [],
        artifacts: {
          source: "model-bounds",
          action: "skipped-no-change",
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        },
      });
      return;
    }
    const nextBounds = box.clone();
    modelBoundsRef.current = nextBounds;
    setModelBounds((current) => (box3ApproximatelyEquals(current, nextBounds) ? current : nextBounds));
    reportPipelineStage({
      id: "viewer-sync",
      status: "ready",
      authority: "model-viewer",
      engine: "preview-bounds",
      warnings: [],
      errors: [],
      artifacts: {
        source: "model-bounds",
        action: "applied",
        min: [nextBounds.min.x, nextBounds.min.y, nextBounds.min.z],
        max: [nextBounds.max.x, nextBounds.max.y, nextBounds.max.z],
      },
    });
  }, [reportPipelineStage]);

  const ext = file?.name.split(".").pop()?.toLowerCase() ??
    modelUrl?.split("?")[0]?.split(".").pop()?.toLowerCase() ??
    "";
  const autoRotate = isAutoRotating && !showTemplateSurfaceZones;
  const hasCanonicalPreviewContext = Boolean(
    tumblerDims &&
    canonicalBodyProfile &&
    dimensionCalibration,
  );
  const canonicalReferenceBounds = useMemo(
    () => (hasCanonicalPreviewContext && canonicalBodyProfile && dimensionCalibration
      ? computeCanonicalBodyBounds(canonicalBodyProfile, dimensionCalibration.totalHeightMm)
      : null),
    [canonicalBodyProfile, dimensionCalibration, hasCanonicalPreviewContext],
  );
  const previewModelState = useMemo(
    () => deriveTumblerPreviewModelState({
      requestedMode: previewModelMode ?? "source-traced",
      hasCanonicalAlignmentModel: hasCanonicalPreviewContext,
      hasSourceModel: Boolean(url),
      sourceModelPath: glbPath ?? modelUrl ?? file?.name ?? null,
      sourceBounds: box3ToPreviewBoundsSnapshot(modelBounds),
      canonicalBounds: box3ToPreviewBoundsSnapshot(canonicalReferenceBounds),
    }),
    [
      previewModelMode,
      hasCanonicalPreviewContext,
      url,
      glbPath,
      modelUrl,
      file?.name,
      modelBounds,
      canonicalReferenceBounds,
    ],
  );
  const effectivePreviewModelMode = previewModelState.effectiveMode;
  const canonicalBodyBounds = useMemo(
    () => (hasCanonicalPreviewContext && canonicalBodyProfile && dimensionCalibration
      ? (
          effectivePreviewModelMode === "alignment-model"
            ? computeRegistrationShellBounds(dimensionCalibration.svgFrontViewBoxMm)
            : computeCanonicalBodyBounds(canonicalBodyProfile, dimensionCalibration.totalHeightMm)
        )
      : null),
    [canonicalBodyProfile, dimensionCalibration, effectivePreviewModelMode, hasCanonicalPreviewContext],
  );
  useEffect(() => {
    onPreviewStateChange?.(tumblerDims ? previewModelState : null);
  }, [onPreviewStateChange, previewModelState, tumblerDims]);
  const useCanonicalAlignmentModel = Boolean(
    hasCanonicalPreviewContext &&
    (
      effectivePreviewModelMode === "alignment-model" ||
      (!url && !flatPreview && effectivePreviewModelMode === "full-model")
    ),
  );
  const sourceCompareBounds = modelBounds;
  const fullPreviewBounds = useMemo(() => {
    if (effectivePreviewModelMode !== "full-model") return modelBounds ?? canonicalBodyBounds;
    if (!modelBounds && !canonicalBodyBounds) return null;
    const next = (canonicalBodyBounds ?? modelBounds)?.clone() ?? null;
    if (!next) return null;
    if (canonicalBodyBounds && modelBounds) {
      const canonicalSize = canonicalBodyBounds.getSize(new THREE.Vector3());
      const maxHandleAllowance = Math.max(canonicalSize.x * 0.74, 38);
      const maxLidAllowance = Math.max(canonicalSize.y * 0.14, 12);
      const maxDepthAllowance = Math.max(canonicalSize.z * 0.36, 18);
      next.min.x = Math.min(next.min.x, Math.max(modelBounds.min.x, canonicalBodyBounds.min.x - Math.max(canonicalSize.x * 0.12, 9)));
      next.max.x = Math.max(next.max.x, Math.min(modelBounds.max.x, canonicalBodyBounds.max.x + maxHandleAllowance));
      next.min.y = Math.min(next.min.y, Math.max(modelBounds.min.y, canonicalBodyBounds.min.y - Math.max(canonicalSize.y * 0.035, 4)));
      next.max.y = Math.max(next.max.y, Math.min(modelBounds.max.y, canonicalBodyBounds.max.y + maxLidAllowance));
      next.min.z = Math.min(next.min.z, Math.max(modelBounds.min.z, canonicalBodyBounds.min.z - Math.max(canonicalSize.z * 0.18, 8)));
      next.max.z = Math.max(next.max.z, Math.min(modelBounds.max.z, canonicalBodyBounds.max.z + maxDepthAllowance));
    }
    const size = next.getSize(new THREE.Vector3());
    const hasHandle = Boolean(editableHandlePreview || canonicalHandleProfile);
    next.min.x -= Math.max(size.x * 0.01, 0.6);
    next.max.x += hasHandle ? Math.max(size.x * 0.028, 2.2) : Math.max(size.x * 0.012, 0.9);
    next.min.y -= Math.max(size.y * 0.006, 0.5);
    next.max.y += Math.max(size.y * 0.012, 1.2);
    next.min.z -= Math.max(size.z * 0.018, 0.8);
    next.max.z += Math.max(size.z * 0.028, 1.3);
    return next;
  }, [canonicalBodyBounds, canonicalHandleProfile, editableHandlePreview, effectivePreviewModelMode, modelBounds]);
  const fullPreviewFocusCenter = useMemo(() => {
    if (effectivePreviewModelMode !== "full-model") return null;
    const preferredBounds = canonicalBodyBounds ?? fullPreviewBounds ?? modelBounds;
    if (!preferredBounds) return null;
    return preferredBounds.getCenter(new THREE.Vector3());
  }, [canonicalBodyBounds, effectivePreviewModelMode, fullPreviewBounds, modelBounds]);
  const alignmentBounds = hasCanonicalPreviewContext
    ? (
        effectivePreviewModelMode === "full-model"
          ? (fullPreviewBounds ?? canonicalBodyBounds)
          : effectivePreviewModelMode === "source-traced"
          ? (canonicalBodyBounds ?? sourceCompareBounds)
          : (canonicalBodyBounds ?? modelBounds)
      )
    : modelBounds;
  const useAlignmentOrthoCamera = Boolean(
    showTemplateSurfaceZones
    && tumblerDims
    && dimensionCalibration
    && effectivePreviewModelMode === "alignment-model",
  );
  const useTemplatePreviewSurfaceZones = Boolean(
    tumblerDims
    && alignmentBounds
    && showTemplateSurfaceZones
    && effectivePreviewModelMode === "alignment-model",
  );
  const viewKey = flatPreview
    ? `flat:${flatPreview.widthMm}:${flatPreview.heightMm}:${flatPreview.thicknessMm}:${flatPreview.familyKey ?? ""}:${flatPreview.label ?? ""}`
    : `${hasCanonicalPreviewContext ? effectivePreviewModelMode : "source-traced"}:${url ?? ""}`;

  // ── Adaptive scene scale based on physical dimensions ──────────────────────
  const H = tumblerDims?.overallHeightMm ?? 200;
  const isMmScale = !!tumblerDims;

  const nearClip   = isMmScale ? 1       : 0.01;
  const farClip    = isMmScale ? 8000    : 300;
  const minDist    = isMmScale ? 20      : 0.05;
  const maxDist    = isMmScale ? H * 10  : 200;
  const gridCell   = isMmScale ? H * 0.05  : 0.5;
  const gridSection= isMmScale ? H * 0.25  : 2.5;
  const gridFade   = isMmScale ? H * 3.5   : 28;
  const shadowScale= isMmScale ? H * 4     : 20;
  const shadowFar  = isMmScale ? H * 0.7   : 5;
  const wrapWidthMm = dimensionCalibration?.wrapWidthMm && dimensionCalibration.wrapWidthMm > 0
    ? dimensionCalibration.wrapWidthMm
    : bedWidthMm && bedWidthMm > 0
    ? bedWidthMm
    : (tumblerDims ? Math.PI * Math.max(tumblerDims.diameterMm, 1) : 0);
  const printHeightMm = bedHeightMm && bedHeightMm > 0
    ? bedHeightMm
    : (tumblerDims?.printableHeightMm ?? 0);
  const manufacturerLogoPlacedItem = useMemo(() => {
    if (!manufacturerLogoStamp || !manufacturerLogoCanvas || !tumblerDims || !wrapWidthMm || !printHeightMm) {
      return null;
    }
    return buildManufacturerLogoPlacedItem({
      stamp: manufacturerLogoStamp,
      dims: tumblerDims,
      wrapWidthMm,
      printHeightMm,
      handleArcDeg: tumblerMapping?.handleArcDeg ?? handleArcDeg,
    });
  }, [
    manufacturerLogoStamp,
    manufacturerLogoCanvas,
    tumblerDims,
    wrapWidthMm,
    printHeightMm,
    tumblerMapping?.handleArcDeg,
    handleArcDeg,
  ]);
  const previewPlacedItems = useMemo(() => {
    if (!manufacturerLogoPlacedItem) return placedItems;
    const base = (placedItems ?? []).filter((item) => item.id !== manufacturerLogoPlacedItem.id);
    return [...base, manufacturerLogoPlacedItem];
  }, [placedItems, manufacturerLogoPlacedItem]);
  const previewItemTextures = useMemo(() => {
    if (!manufacturerLogoPlacedItem || !manufacturerLogoCanvas) return itemTextures;
    const next = new Map(itemTextures ?? []);
    next.set(manufacturerLogoPlacedItem.id, manufacturerLogoCanvas);
    return next;
  }, [itemTextures, manufacturerLogoCanvas, manufacturerLogoPlacedItem]);
  const previewHasItems = !!previewPlacedItems?.length && !!previewItemTextures?.size;
  const useEngravableZoneRing = Boolean(
    tumblerDims
    && alignmentBounds
    && !previewHasItems
    && effectivePreviewModelMode === "alignment-model"
    && !showTemplateSurfaceZones,
  );

  if (!url && !flatPreview && !useCanonicalAlignmentModel) return null;

  return (
    <CanvasErrorBoundary>
      <Canvas
        shadows={false}
        frameloop={previewHasItems ? "always" : "demand"}
        dpr={[1, 1.25]}
        camera={{ fov: 35, near: nearClip, far: farClip }}
        gl={{
          antialias: true,
          powerPreference: "low-power",
          stencil: false,
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.0,
          alpha: false,
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#1a1a22"]} />

        <StudioLights />

        <Bounds observe={false} margin={4.4}>
          <Suspense fallback={<LoadingIndicator />}>
            {flatPreview ? (
              <FlatItemPreview
                dims={flatPreview}
                placedItems={previewPlacedItems}
                itemTextures={previewItemTextures}
                bedWidthMm={bedWidthMm}
                bedHeightMm={bedHeightMm}
                bodyTintColor={bodyTintColor}
                onReady={handleModelReady}
              />
            ) : useCanonicalAlignmentModel && tumblerDims && canonicalBodyProfile && dimensionCalibration ? (
              <CanonicalAlignmentTumbler
                dims={tumblerDims}
                bodyProfile={canonicalBodyProfile}
                handleProfile={canonicalHandleProfile}
                editableHandlePreview={editableHandlePreview}
                calibration={dimensionCalibration}
                previewMode={effectivePreviewModelMode === "full-model" ? "full-model" : "alignment-model"}
                bodyTintColor={bodyTintColor}
                lidTintColor={lidTintColor}
                rimTintColor={rimTintColor}
                ringFinish={ringFinish}
                onReady={handleModelReady}
              />
            ) : url ? (
              <ModelByExtension
                url={url}
                ext={ext}
                dims={tumblerDims}
                handleArcDeg={handleArcDeg}
                placedItems={previewPlacedItems}
                itemTextures={previewItemTextures}
                bedWidthMm={bedWidthMm}
                bedHeightMm={bedHeightMm}
                glbPath={glbPath}
                sourceName={file?.name}
                tumblerMapping={tumblerMapping}
                bodyTintColor={bodyTintColor}
                lidTintColor={lidTintColor}
                rimTintColor={rimTintColor}
                previewModelMode={effectivePreviewModelMode}
                onReady={handleModelReady}
              />
            ) : null}
          </Suspense>
          {!useAlignmentOrthoCamera && !tumblerDims && <AutoFit url={viewKey} />}
        </Bounds>
        <AlignmentOrthoCamera
          enabled={useAlignmentOrthoCamera}
          modelBounds={canonicalBodyBounds}
          viewBoxMm={dimensionCalibration?.svgFrontViewBoxMm ?? null}
        />
        <PreviewPerspectiveCamera
          enabled={!useAlignmentOrthoCamera}
          modelBounds={
            effectivePreviewModelMode === "alignment-model"
              ? alignmentBounds
              : effectivePreviewModelMode === "full-model"
                ? (fullPreviewBounds ?? alignmentBounds)
                : (modelBounds ?? alignmentBounds)
          }
          focusCenter={effectivePreviewModelMode === "full-model" ? fullPreviewFocusCenter : null}
          previewMode={effectivePreviewModelMode}
        />
        <CalibratedFrontView
          enabled={false}
          modelBounds={effectivePreviewModelMode === "alignment-model" ? canonicalBodyBounds : modelBounds}
        />

        {/* Engravable zone highlight — shown when tumbler loaded, no items placed */}
        {useTemplatePreviewSurfaceZones && (
          <TemplateSurfaceZones dims={tumblerDims!} modelBounds={alignmentBounds!} />
        )}
        {useEngravableZoneRing && (
          <EngravableZoneRing dims={tumblerDims!} modelBounds={alignmentBounds!} />
        )}

        <ContactShadows
          position={[0, alignmentBounds ? alignmentBounds.min.y - 0.5 : -0.01, 0]}
          opacity={0.4}
          scale={shadowScale}
          blur={3}
          far={shadowFar}
          color="#000018"
        />

        <Grid
          position={[0, alignmentBounds ? alignmentBounds.min.y - 1 : -0.011, 0]}
          infiniteGrid
          cellSize={gridCell}
          cellThickness={0.4}
          cellColor="#333344"
          sectionSize={gridSection}
          sectionThickness={0.7}
          sectionColor="#444466"
          fadeDistance={gridFade}
          fadeStrength={2.5}
        />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          autoRotate={autoRotate}
          autoRotateSpeed={0.7}
          minDistance={minDist}
          maxDistance={maxDist}
          maxPolarAngle={Math.PI / 1.85}
          enablePan={false}
          enableRotate={!showTemplateSurfaceZones || effectivePreviewModelMode === "full-model" || effectivePreviewModelMode === "source-traced"}
          onStart={handleOrbitStart}
          onEnd={handleOrbitEnd}
        />
      </Canvas>
    </CanvasErrorBoundary>
  );
}


