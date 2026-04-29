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
import * as THREE from "three";
import type { PlacedItem } from "@/types/admin";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
  ProductTemplate,
} from "@/types/productTemplate";
import {
  deriveTumblerPreviewModelState,
  type PreviewModelMode,
} from "@/lib/tumblerPreviewModelState";
import {
  getBodyReferencePreviewModeHint,
  getBodyReferencePreviewModeLabel,
  getDrinkwareGlbStatusLabel,
  isBodyCutoutQaPreviewAvailable,
} from "@/lib/bodyReferencePreviewIntent";
import { resolveGeneratedModelAuditRequestPlan } from "@/lib/generatedModelUrl";
import { parseBodyGeometryAuditArtifact } from "@/lib/adminApi.schema";
import type {
  BodyGeometryContract,
  BodyGeometryContractSeed,
} from "@/lib/bodyGeometryContract";
import {
  buildBodyGeometrySourceHashPayload,
  createEmptyBodyGeometryContract,
  mergeAuditContractWithLoadedInspection,
  updateContractValidation,
} from "@/lib/bodyGeometryContract";
import type { WrapExportProductionReadinessSummary } from "@/lib/wrapExportProductionValidation";
import { buildBodyCutoutQaGuardState } from "@/lib/bodyCutoutQaGuard";
import type { BodyGeometryAuditArtifactLike } from "@/lib/bodyGeometryDebugReport";
import { hashArrayBufferSha256, hashFileSha256, hashJsonSha256 } from "@/lib/hashSha256";
import type { LoadedGltfSceneInspection, LoadedSceneBoundsUnits } from "@/lib/inspectLoadedGltfScene";
import { inspectLoadedGltfScene } from "@/lib/inspectLoadedGltfScene";
import { BodyCutoutQaGuardBanner } from "./BodyCutoutQaGuardBanner";
import { BodyContractInspectorPanel } from "./BodyContractInspectorPanel";
import { BodyGeometryStatusBadge } from "./BodyGeometryStatusBadge";
import { YetiRambler40oz } from "./models/YetiRambler40oz";
import type { DecalItem } from "./models/YetiRambler40oz";
import { getWrapFrontCenter } from "@/utils/tumblerWrapLayout";
import type { ProductAppearanceReferenceLayer } from "@/lib/productAppearanceReferenceLayers";

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
  /** Height of the laser-engravable zone in mm */
  printableHeightMm: number;
  /** Distance from mesh top to printable zone top in mm */
  printableTopOffsetMm?: number;
  /** Powder-coated body start offset from mesh top in mm */
  bodyTopOffsetMm?: number;
  /** Powder-coated body span height in mm */
  bodyHeightMm?: number;
  /** Lid seam offset from mesh top in mm */
  lidSeamFromOverallMm?: number;
  /** Bottom of the top silver band, from mesh top in mm */
  silverBandBottomFromOverallMm?: number;
}

/** Per-item rasterized texture for 3D Decal projection */
export interface ItemTexture {
  itemId: string;
  canvas: HTMLCanvasElement;
}

export interface ModelViewerProps {
  file?: File | null;
  modelUrl?: string | null;
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
  /** Body tint hex color (e.g. "#b0b8c4" for stainless, "#1a1a2e" for matte black) */
  bodyTintColor?: string;
  /** Rim / engraved artwork tint */
  rimTintColor?: string;
  /** Reference-only product appearance layers resolved upstream. */
  appearanceReferenceLayers?: ProductAppearanceReferenceLayer[] | null;
  /** Show template surface guide zones on supported tumbler templates */
  showTemplateSurfaceZones?: boolean;
  /** Review preview scaffold mode used by later BODY REFERENCE flows */
  previewModelMode?: PreviewModelMode;
  /** Review preview scaffold source model status */
  sourceModelStatus?: ProductTemplate["glbStatus"] | null;
  /** Optional operator-facing source label for scaffold overlays */
  sourceModelLabel?: string | null;
  approvedBodyOutline?: EditableBodyOutline | null;
  canonicalBodyProfile?: CanonicalBodyProfile | null;
  canonicalDimensionCalibration?: CanonicalDimensionCalibration | null;
  bodyGeometryContractSeed?: BodyGeometryContractSeed | null;
  wrapExportProductionReadiness?: WrapExportProductionReadinessSummary | null;
  showModelDebug?: boolean;
  onBodyGeometryContractChange?: (contract: BodyGeometryContract | null) => void;
}

function getModelSourceName(file?: File | null, modelUrl?: string | null): string {
  if (file?.name) return file.name;
  if (!modelUrl) return "";
  try {
    const parsed = new URL(modelUrl, "http://localhost");
    return parsed.pathname.split("/").pop() ?? "";
  } catch {
    const [pathPart] = modelUrl.split("?");
    return pathPart.split("/").pop() ?? "";
  }
}

type LoadedSceneInspectionState =
  | { status: "idle"; glbUrl?: string }
  | { status: "pending"; glbUrl?: string }
  | { status: "complete"; glbUrl?: string; inspectedAt: string; sceneInspection: LoadedGltfSceneInspection }
  | { status: "failed"; glbUrl?: string; error: string };

type LoadedAuditArtifactState =
  | { status: "idle"; expectation: "required" | "optional" | "none"; auditUrl?: string; error?: string }
  | { status: "loading"; expectation: "required" | "optional" | "none"; auditUrl?: string; error?: string }
  | { status: "present"; expectation: "required"; auditUrl: string }
  | { status: "optional-missing"; expectation: "optional"; auditUrl: string }
  | { status: "required-missing"; expectation: "required"; auditUrl: string }
  | { status: "failed"; expectation: "required"; auditUrl: string; error: string };

type WebGlAvailabilityState =
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; reason: string };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const WEBGL_UNAVAILABLE_REASON = "WebGL context could not be created.";
const WEBGL_UNAVAILABLE_RUNTIME_MESSAGE =
  "Runtime inspection unavailable: WebGL context could not be created. Open in a WebGL-capable browser/session to validate loaded-scene truth.";

function toBodyBounds(
  bounds: LoadedGltfSceneInspection["bounds"]["body"] | null | undefined,
): BodyGeometryContract["dimensionsMm"]["bodyBounds"] | undefined {
  if (!bounds) return undefined;
  return {
    width: round2(bounds.width),
    height: round2(bounds.height),
    depth: round2(bounds.depth),
  };
}

const BODY_CONTRACT_INSPECTOR_ENABLED =
  process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1" ||
  process.env.NEXT_PUBLIC_SHOW_BODY_CONTRACT_INSPECTOR === "1";

function resolveViewerSourceType(args: {
  sourceModelStatus?: ProductTemplate["glbStatus"] | null;
  approvedBodyOutline?: EditableBodyOutline | null;
}): BodyGeometryContract["source"]["type"] {
  if (args.approvedBodyOutline) return "approved-svg";
  if (args.sourceModelStatus === "generated-reviewed-model") return "generated";
  return "unknown";
}

function canCreateWebglContext(): { available: true } | { available: false; reason: string } {
  if (typeof document === "undefined") {
    return { available: false, reason: "Document is not available." };
  }

  const canvas = document.createElement("canvas");
  const contextNames = ["webgl2", "webgl", "experimental-webgl"] as const;

  for (const contextName of contextNames) {
    try {
      const context = canvas.getContext(contextName, {
        antialias: false,
        failIfMajorPerformanceCaveat: false,
        stencil: false,
      }) as WebGLRenderingContext | WebGL2RenderingContext | null;
      if (context) {
        context.getExtension("WEBGL_lose_context")?.loseContext();
        return { available: true };
      }
    } catch {
      // Keep probing the remaining context names; some browsers throw instead of returning null.
    }
  }

  return { available: false, reason: WEBGL_UNAVAILABLE_REASON };
}

function useWebGlAvailability(): WebGlAvailabilityState {
  const [availability, setAvailability] = useState<WebGlAvailabilityState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const result = canCreateWebglContext();
      if (cancelled) return;
      setAvailability(
        result.available
          ? { status: "available" }
          : { status: "unavailable", reason: result.reason },
      );
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return availability;
}

function WebGlPreflightPanel() {
  return (
    <div
      data-testid="model-viewer-webgl-preflight"
      role="status"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#161620",
        color: "var(--text-secondary)",
        fontSize: 12,
        padding: 16,
        textAlign: "center",
      }}
    >
      Checking 3D preview runtime...
    </div>
  );
}

function WebGlUnavailablePanel({
  isBodyCutoutQa,
}: {
  isBodyCutoutQa: boolean;
}) {
  return (
    <div
      data-testid="model-viewer-webgl-unavailable"
      role="status"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: "#161620",
        color: "var(--text-secondary)",
        fontSize: 12,
        lineHeight: 1.45,
        padding: 18,
        textAlign: "center",
      }}
    >
      <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>
        3D preview unavailable: this browser/session does not provide WebGL.
      </strong>
      <span>
        {isBodyCutoutQa
          ? "BODY CUTOUT QA runtime inspection requires a WebGL-capable browser to validate loaded-scene truth."
          : "Open in a WebGL-capable browser/session to inspect the loaded 3D scene."}
      </span>
      <span style={{ color: "var(--warning)", maxWidth: 460 }}>
        {WEBGL_UNAVAILABLE_RUNTIME_MESSAGE}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Physical scale computation
// Scene units = mm when tumblerDims are provided.
// Detects Z-up / X-up models and corrects orientation to Y-up.
// ---------------------------------------------------------------------------

interface ModelTransform {
  scale: number;
  rotation: [number, number, number];
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
  rawSize: THREE.Vector3,
  dims: TumblerDimensions | null | undefined,
  scaleTargetHeightMm?: number | null,
): ModelTransform {
  const targetHeightMm =
    typeof scaleTargetHeightMm === "number" && Number.isFinite(scaleTargetHeightMm) && scaleTargetHeightMm > 0
      ? scaleTargetHeightMm
      : dims?.overallHeightMm;
  if (!targetHeightMm || targetHeightMm <= 0) {
    return { scale: 1, rotation: [0, 0, 0] };
  }

  let rotation: [number, number, number] = [0, 0, 0];
  let heightInNativeUnits = rawSize.y;

  // Auto-orient: if the longest axis is not Y, rotate to make it Y
  if (rawSize.z > rawSize.y * 1.15 && rawSize.z > rawSize.x) {
    rotation = [-Math.PI / 2, 0, 0]; // Z-up → tilt forward
    heightInNativeUnits = rawSize.z;
  } else if (rawSize.x > rawSize.y * 1.15 && rawSize.x > rawSize.z) {
    rotation = [0, 0, Math.PI / 2]; // X-up → rotate sideways
    heightInNativeUnits = rawSize.x;
  }

  const scale = heightInNativeUnits > 0
    ? targetHeightMm / heightInNativeUnits
    : 1;

  return { scale, rotation };
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
      const direction = camera.position.clone().sub(center);
      if (direction.lengthSq() < 1e-6) {
        direction.set(0.35, 0.25, 1);
      }
      direction.normalize();
      bounds
        .moveTo(center.clone().addScaledVector(direction, distance * 1.58))
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
      <hemisphereLight args={["#ffe8cc", "#2a3a50", 0.7]} />
      <directionalLight position={[5, 9, 4]} intensity={1.8} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} color="#fff8f0" />
      <directionalLight position={[-5, 3, -2]} intensity={0.5} color="#c8d8ff" />
      <directionalLight position={[0, 4, -9]} intensity={0.35} color="#ffffff" />
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



// ---------------------------------------------------------------------------
// Format-specific mesh components — each applies physical scaling
// ---------------------------------------------------------------------------

type OnReady = (obj: THREE.Object3D) => void;

function StlMesh({
  url, dims, scaleTargetHeightMm, onReady,
}: { url: string; dims?: TumblerDimensions | null; scaleTargetHeightMm?: number | null; onReady?: OnReady }) {
  const geometry = useLoader(STLLoader, url);
  geometry.computeVertexNormals();

  const transform = useMemo(() => {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox ?? new THREE.Box3();
    const size = new THREE.Vector3();
    bb.getSize(size);
    return computeModelTransform(size, dims, scaleTargetHeightMm);
  }, [geometry, dims, scaleTargetHeightMm]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, geometry]);

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#b0b8c4" metalness={0.35} roughness={0.55} />
      </mesh>
    </group>
  );
}

function ObjMesh({
  url, dims, scaleTargetHeightMm, onReady,
}: { url: string; dims?: TumblerDimensions | null; scaleTargetHeightMm?: number | null; onReady?: OnReady }) {
  const obj = useLoader(OBJLoader, url);

  const transform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    return computeModelTransform(size, dims, scaleTargetHeightMm);
  }, [obj, dims, scaleTargetHeightMm]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, obj]);

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation}>
      <primitive object={obj} castShadow receiveShadow />
    </group>
  );
}


function GltfMesh({
  url, dims, scaleTargetHeightMm, placedItems, itemTextures, bedWidthMm, bedHeightMm, tumblerMapping, bodyTintColor, rimTintColor, onReady,
}: {
  url: string;
  dims?: TumblerDimensions | null;
  scaleTargetHeightMm?: number | null;
  placedItems?: PlacedItem[];
  itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number;
  bedHeightMm?: number;
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping;
  bodyTintColor?: string;
  rimTintColor?: string;
  onReady?: OnReady;
}) {
  const gltf = useLoader(GLTFLoader, url);
  void rimTintColor;

  // ── Extract body mesh geometry + material from the GLB scene ──
  // We render the mesh explicitly (not via <primitive>) so Decals can be children.
  const bodyMeshData = useMemo(() => {
    let foundGeometry: THREE.BufferGeometry | null = null;
    let foundMaterial: THREE.Material | THREE.Material[] | null = null;
    let foundMesh: THREE.Mesh | null = null;
    const otherObjects: THREE.Object3D[] = [];

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
      otherObjects.push(child);
    });

    return { geometry: foundGeometry, material: foundMaterial, bodyMesh: foundMesh, otherObjects };
  }, [gltf.scene]);

  // ── Scale to physical mm ──
  const transform = useMemo(() => {
    const scaleReference = bodyMeshData.bodyMesh ?? gltf.scene;
    scaleReference.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scaleReference);
    const rawSize = box.getSize(new THREE.Vector3());
    return computeModelTransform(rawSize, dims, scaleTargetHeightMm);
  }, [bodyMeshData.bodyMesh, gltf.scene, dims, scaleTargetHeightMm]);

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
        const itemRotationRad = THREE.MathUtils.degToRad(item.rotation ?? 0);
        const depthMm = computeDecalDepthMm(item.width, radius);
        const outwardMm = THREE.MathUtils.clamp(depthMm * 0.08, 2, 8);
        const surfaceRadius = radius + outwardMm;

        const posX = Math.sin(angleRad) * surfaceRadius;
        const posZ = Math.cos(angleRad) * surfaceRadius;
        const posY = artCenterY;

        return {
          itemId: item.id,
          position: [posX / s, posY / s, posZ / s] as [number, number, number],
          rotation: [0, -angleRad, itemRotationRad] as [number, number, number],
          scale: [item.width / s, item.height / s, depthMm / s] as [number, number, number],
        };
      });
  }, [dims, placedItems, bedWidthMm, bedHeightMm, tumblerMapping?.frontFaceRotation, tumblerMapping?.handleArcDeg, transform.scale]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, gltf.scene]);

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation}>
      {/* Body mesh rendered explicitly so Decals can be direct children */}
      {bodyMeshData.geometry && (
        <mesh
          name={(bodyMeshData.bodyMesh as THREE.Mesh | null)?.name ?? "body_mesh"}
          geometry={bodyMeshData.geometry}
          material={!bodyTintColor ? (bodyMeshData.material ?? undefined) : undefined}
          castShadow
          receiveShadow
        >
          {bodyTintColor && (
            <meshStandardMaterial color={bodyTintColor} metalness={0.35} roughness={0.55} />
          )}
          {decalConfigs.map((cfg) => {
            const tex = threeTextures.get(cfg.itemId);
            if (!tex) return null;
            return (
              <Decal
                key={cfg.itemId}
                name={`engraving_overlay_preview_${cfg.itemId}`}
                position={cfg.position}
                rotation={cfg.rotation}
                scale={cfg.scale}
                userData={{ bodyContractIgnore: true, engravingOverlayPreview: true }}
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

// Known model component registry — maps GLB path substrings to components
const KNOWN_MODELS: { match: string; key: string }[] = [
  { match: "yeti-40oz-body", key: "yeti40oz" },
  { match: "40oz-yeti", key: "yeti40oz" },
  { match: "yeti-40-0z", key: "yeti40oz" },
  { match: "yeti_40oz", key: "yeti40oz" },
];

function ModelByExtension({
  url, ext, dims, scaleTargetHeightMm, handleArcDeg, placedItems, itemTextures, bedWidthMm, bedHeightMm, glbPath, sourceName, tumblerMapping, bodyTintColor, rimTintColor, appearanceReferenceLayers, showTemplateSurfaceZones, onReady,
}: {
  url: string; ext: string; dims?: TumblerDimensions | null; handleArcDeg?: number;
  scaleTargetHeightMm?: number | null;
  placedItems?: PlacedItem[]; itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number; bedHeightMm?: number; glbPath?: string | null;
  sourceName?: string;
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping; bodyTintColor?: string; rimTintColor?: string; appearanceReferenceLayers?: ProductAppearanceReferenceLayer[] | null; showTemplateSurfaceZones?: boolean; onReady?: OnReady;
}) {
  if (ext === "stl") return <StlMesh url={url} dims={dims} scaleTargetHeightMm={scaleTargetHeightMm} onReady={onReady} />;
  if (ext === "obj") return <ObjMesh url={url} dims={dims} scaleTargetHeightMm={scaleTargetHeightMm} onReady={onReady} />;

  if (ext === "glb" || ext === "gltf") {
    // Check if this is a known model with a dedicated component
    const modelHint = `${glbPath ?? ""} ${sourceName ?? ""}`.toLowerCase();
    const knownModel = KNOWN_MODELS.find((m) => modelHint.includes(m.match));

    if (knownModel?.key === "yeti40oz" && dims) {
      const decalItems = buildDecalItems(placedItems, itemTextures);
      return (
        <Suspense fallback={null}>
          <YetiRambler40oz
            placedItems={decalItems}
            diameterMm={dims.diameterMm}
            topDiameterMm={dims.topDiameterMm}
            overallHeightMm={dims.overallHeightMm}
            printHeightMm={dims.printableHeightMm}
            printableTopOffsetMm={dims.printableTopOffsetMm ?? 0}
            wrapWidthMm={bedWidthMm ?? Math.PI * dims.diameterMm}
            handleArcDeg={handleArcDeg ?? 0}
            glbPath={glbPath ?? undefined}
            tumblerMapping={tumblerMapping}
            bodyTintColor={bodyTintColor}
            rimTintColor={rimTintColor}
            appearanceReferenceLayers={appearanceReferenceLayers}
            bodyTopOffsetMm={dims.bodyTopOffsetMm}
            bodyHeightMm={dims.bodyHeightMm}
            lidSeamFromOverallMm={dims.lidSeamFromOverallMm}
            silverBandBottomFromOverallMm={dims.silverBandBottomFromOverallMm}
            showTemplateSurfaceZones={!!showTemplateSurfaceZones}
            onReady={onReady}
          />
        </Suspense>
      );
    }

    // Fallback: generic GLB loader
    return (
      <Suspense fallback={null}>
        <GltfMesh url={url} dims={dims}
          scaleTargetHeightMm={scaleTargetHeightMm}
          placedItems={placedItems} itemTextures={itemTextures}
          bedWidthMm={bedWidthMm} bedHeightMm={bedHeightMm}
          tumblerMapping={tumblerMapping}
          bodyTintColor={bodyTintColor}
          rimTintColor={rimTintColor}
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
  file,
  modelUrl,
  placedItems,
  itemTextures,
  bedWidthMm,
  bedHeightMm,
  tumblerDims,
  handleArcDeg,
  glbPath,
  tumblerMapping,
  bodyTintColor,
  rimTintColor,
  appearanceReferenceLayers,
  showTemplateSurfaceZones,
  previewModelMode,
  sourceModelStatus,
  sourceModelLabel,
  approvedBodyOutline = null,
  canonicalBodyProfile = null,
  canonicalDimensionCalibration = null,
  bodyGeometryContractSeed = null,
  wrapExportProductionReadiness = null,
  showModelDebug = false,
  onBodyGeometryContractChange,
}: ModelViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [modelBounds, setModelBounds] = useState<THREE.Box3 | null>(null);
  const [loadedSceneInspectionState, setLoadedSceneInspectionState] = useState<LoadedSceneInspectionState>({
    status: "idle",
  });
  const [viewerRuntimeGlbHash, setViewerRuntimeGlbHash] = useState<string | null>(null);
  const [viewerRuntimeSourceHash, setViewerRuntimeSourceHash] = useState<string | null>(null);
  const [viewerRuntimeGlbAudit, setViewerRuntimeGlbAudit] = useState<BodyGeometryAuditArtifactLike | null>(null);
  const [loadedAuditArtifactState, setLoadedAuditArtifactState] = useState<LoadedAuditArtifactState>({
    status: "idle",
    expectation: "none",
  });
  const webglAvailability = useWebGlAvailability();
  const [isAutoRotating, setIsAutoRotating] = useState(!!tumblerDims);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auditRequestTrackerRef = useRef<{
    auditUrl: string | null;
    status: "idle" | "loading" | "present" | "required-missing" | "failed";
  }>({
    auditUrl: null,
    status: "idle",
  });

  const handleOrbitStart = useCallback(() => {
    setIsAutoRotating(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  const handleOrbitEnd = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsAutoRotating(true), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const reviewProductType = tumblerDims ? "tumbler" : null;
  const sourceModelUrl = modelUrl ?? glbPath ?? null;
  const sourceName = getModelSourceName(file, sourceModelUrl);
  const ext = sourceName.split(".").pop()?.toLowerCase() ?? "";
  const canonicalPreviewBounds = useMemo(() => {
    const widthMm = canonicalDimensionCalibration?.wrapDiameterMm ?? tumblerDims?.diameterMm ?? null;
    const heightMm = canonicalDimensionCalibration?.totalHeightMm ?? tumblerDims?.overallHeightMm ?? null;
    const depthMm = canonicalDimensionCalibration?.wrapDiameterMm ?? tumblerDims?.diameterMm ?? null;
    if (
      typeof widthMm !== "number" ||
      !Number.isFinite(widthMm) ||
      widthMm <= 0 ||
      typeof heightMm !== "number" ||
      !Number.isFinite(heightMm) ||
      heightMm <= 0 ||
      typeof depthMm !== "number" ||
      !Number.isFinite(depthMm) ||
      depthMm <= 0
    ) {
      return null;
    }
    return {
      widthMm: round2(widthMm),
      heightMm: round2(heightMm),
      depthMm: round2(depthMm),
    };
  }, [canonicalDimensionCalibration?.totalHeightMm, canonicalDimensionCalibration?.wrapDiameterMm, tumblerDims?.diameterMm, tumblerDims?.overallHeightMm]);
  const sourcePreviewBounds = useMemo(() => {
    if (loadedSceneInspectionState.status !== "complete") return null;
    const fullSceneBounds = loadedSceneInspectionState.sceneInspection.bounds.fullScene;
    if (!fullSceneBounds) return null;
    return {
      widthMm: fullSceneBounds.width,
      heightMm: fullSceneBounds.height,
      depthMm: fullSceneBounds.depth,
    };
  }, [loadedSceneInspectionState]);
  const previewModelState = useMemo(() => (
    previewModelMode && reviewProductType === "tumbler"
      ? deriveTumblerPreviewModelState({
          requestedMode: previewModelMode,
          hasCanonicalAlignmentModel: Boolean(tumblerDims),
          hasSourceModel: Boolean(sourceModelUrl?.trim()),
          sourceModelPath: sourceModelUrl,
          sourceModelStatus,
          sourceBounds: sourcePreviewBounds,
          canonicalBounds: canonicalPreviewBounds,
        })
      : null
  ), [
    canonicalPreviewBounds,
    previewModelMode,
    reviewProductType,
    sourceModelStatus,
    sourceModelUrl,
    sourcePreviewBounds,
    tumblerDims,
  ]);
  const effectivePreviewMode = previewModelState?.effectiveMode ?? previewModelMode ?? null;
  const previewModeLabel = effectivePreviewMode
    ? getBodyReferencePreviewModeLabel({
        productType: reviewProductType,
        mode: effectivePreviewMode,
        glbStatus: sourceModelStatus,
      })
    : null;
  const previewModeHint = effectivePreviewMode
    ? getBodyReferencePreviewModeHint({
        productType: reviewProductType,
        mode: effectivePreviewMode,
      })
    : null;
  const requestedPreviewModeLabel = (
    previewModelState &&
    previewModelState.requestedMode !== previewModelState.effectiveMode
  )
    ? getBodyReferencePreviewModeLabel({
        productType: reviewProductType,
        mode: previewModelState.requestedMode,
        glbStatus: sourceModelStatus,
      })
    : null;
  const statusLabel = sourceModelLabel ?? getDrinkwareGlbStatusLabel(sourceModelStatus);
  const previewModeTransitionNote = (
    requestedPreviewModeLabel &&
    previewModeLabel
  )
    ? `Requested ${requestedPreviewModeLabel}. Showing ${previewModeLabel} instead.`
    : null;
  const previewModeReasonNote = previewModelState?.message ?? null;
  const qaReservedNote = (
    !previewModelState &&
    previewModelMode === "body-cutout-qa" &&
    !isBodyCutoutQaPreviewAvailable(sourceModelStatus)
  )
    ? "BODY CUTOUT QA slot reserved until a reviewed body-only GLB exists."
    : null;
  const scaleTargetHeightMm =
    effectivePreviewMode === "body-cutout-qa"
      ? (
          tumblerDims?.bodyHeightMm ??
          canonicalDimensionCalibration?.bodyHeightMm ??
          tumblerDims?.printableHeightMm ??
          null
        )
      : null;
  const showScaffoldOverlay = Boolean(
    previewModeLabel ||
    statusLabel ||
    previewModeHint ||
    previewModeTransitionNote ||
    previewModeReasonNote ||
    qaReservedNote
  );
  const generatedModelAuditRequestPlan = useMemo(
    () => resolveGeneratedModelAuditRequestPlan({
      modelUrl: sourceModelUrl,
      sourceModelStatus,
      sourceModelLabel,
    }),
    [sourceModelLabel, sourceModelStatus, sourceModelUrl],
  );

  useEffect(() => {
    let objectUrl: string | null = null;
    if (file) {
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    } else if (sourceModelUrl) {
      setUrl(sourceModelUrl);
    } else {
      setUrl(null);
    }
    setModelBounds(null);
    setLoadedSceneInspectionState(
      file || sourceModelUrl
        ? {
            status: "pending",
            glbUrl: objectUrl ?? sourceModelUrl ?? undefined,
          }
        : { status: "idle" },
    );
    setIsAutoRotating(!!tumblerDims);
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setUrl(null);
    };
  }, [file, sourceModelUrl, tumblerDims]);

  useEffect(() => {
    if (webglAvailability.status !== "unavailable") return;
    if (!file && !sourceModelUrl && !url) return;
    setLoadedSceneInspectionState({
      status: "failed",
      glbUrl: url ?? sourceModelUrl ?? file?.name ?? undefined,
      error: WEBGL_UNAVAILABLE_RUNTIME_MESSAGE,
    });
  }, [file, sourceModelUrl, url, webglAvailability]);

  const handleModelReady = useCallback((obj: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) {
      setModelBounds(box);
    }

    try {
      const sceneInspection = inspectLoadedGltfScene(obj, {
        boundsUnits: tumblerDims ? "mm" : "scene-units",
      });
      setLoadedSceneInspectionState({
        status: "complete",
        glbUrl: url ?? sourceModelUrl ?? file?.name ?? undefined,
        inspectedAt: new Date().toISOString(),
        sceneInspection,
      });
    } catch (error) {
      setLoadedSceneInspectionState({
        status: "failed",
        glbUrl: url ?? sourceModelUrl ?? file?.name ?? undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [file?.name, sourceModelUrl, tumblerDims, url]);

  useEffect(() => {
    let cancelled = false;
    const shouldTrackRuntimeTruth = Boolean(
      showModelDebug ||
      effectivePreviewMode === "body-cutout-qa" ||
      sourceModelStatus === "generated-reviewed-model" ||
      BODY_CONTRACT_INSPECTOR_ENABLED,
    );

    if (!shouldTrackRuntimeTruth) {
      setViewerRuntimeGlbHash(null);
      return () => {
        cancelled = true;
      };
    }

    const hashModelBinary = async () => {
      try {
        if (file) {
          const nextHash = await hashFileSha256(file);
          if (!cancelled) setViewerRuntimeGlbHash(nextHash);
          return;
        }

        if (!url) {
          if (!cancelled) setViewerRuntimeGlbHash(null);
          return;
        }

        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to read model bytes for hashing: ${response.status}`);
        }
        const nextHash = await hashArrayBufferSha256(await response.arrayBuffer());
        if (!cancelled) setViewerRuntimeGlbHash(nextHash);
      } catch {
        if (!cancelled) setViewerRuntimeGlbHash(null);
      }
    };

    void hashModelBinary();

    return () => {
      cancelled = true;
    };
  }, [effectivePreviewMode, file, showModelDebug, sourceModelStatus, url]);

  useEffect(() => {
    let cancelled = false;
    const sourceHashPayload = buildBodyGeometrySourceHashPayload({
      outline: approvedBodyOutline ?? null,
      canonicalBodyProfile: canonicalBodyProfile ?? null,
      canonicalDimensionCalibration: canonicalDimensionCalibration ?? null,
    });

    if (!sourceHashPayload) {
      setViewerRuntimeSourceHash(null);
      return () => {
        cancelled = true;
      };
    }

    const hashSourceGeometry = async () => {
      try {
        const nextHash = await hashJsonSha256(sourceHashPayload);
        if (!cancelled) setViewerRuntimeSourceHash(nextHash);
      } catch {
        if (!cancelled) setViewerRuntimeSourceHash(null);
      }
    };

    void hashSourceGeometry();

    return () => {
      cancelled = true;
    };
  }, [approvedBodyOutline, canonicalBodyProfile, canonicalDimensionCalibration]);

  useEffect(() => {
    let cancelled = false;
    const auditUrl = generatedModelAuditRequestPlan.auditUrl;

    if (file || !auditUrl || !generatedModelAuditRequestPlan.shouldFetch) {
      auditRequestTrackerRef.current = {
        auditUrl: auditUrl ?? null,
        status: "idle",
      };
      setViewerRuntimeGlbAudit(null);
      setLoadedAuditArtifactState(
        !file && auditUrl && generatedModelAuditRequestPlan.expectation === "optional"
          ? {
              status: "optional-missing",
              expectation: "optional",
              auditUrl,
            }
          : {
              status: "idle",
              expectation: generatedModelAuditRequestPlan.expectation,
              auditUrl: auditUrl ?? undefined,
            },
      );
      return () => {
        cancelled = true;
      };
    }

    if (
      auditRequestTrackerRef.current.auditUrl === auditUrl &&
      (
        auditRequestTrackerRef.current.status === "loading" ||
        auditRequestTrackerRef.current.status === "present"
      )
    ) {
      return () => {
        cancelled = true;
      };
    }

    auditRequestTrackerRef.current = {
      auditUrl,
      status: "loading",
    };
    setLoadedAuditArtifactState({
      status: "loading",
      expectation: "required",
      auditUrl,
    });

    const loadAuditArtifact = async () => {
      try {
        const response = await fetch(auditUrl, { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) {
              auditRequestTrackerRef.current = {
                auditUrl,
                status: "required-missing",
              };
              setViewerRuntimeGlbAudit(null);
              setLoadedAuditArtifactState({
                status: "required-missing",
                expectation: "required",
                auditUrl,
              });
            }
            return;
          }
          throw new Error(`Failed to load GLB audit: ${response.status}`);
        }

        const parsed = parseBodyGeometryAuditArtifact(await response.json());
        if (!parsed) {
          if (!cancelled) {
            auditRequestTrackerRef.current = {
              auditUrl,
              status: "failed",
            };
            setViewerRuntimeGlbAudit(null);
            setLoadedAuditArtifactState({
              status: "failed",
              expectation: "required",
              auditUrl,
              error: "Generated audit sidecar payload could not be parsed.",
            });
          }
          return;
        }

        if (!cancelled) {
          auditRequestTrackerRef.current = {
            auditUrl,
            status: "present",
          };
          setViewerRuntimeGlbAudit(parsed);
          setLoadedAuditArtifactState({
            status: "present",
            expectation: "required",
            auditUrl,
          });
        }
      } catch (error) {
        if (!cancelled) {
          auditRequestTrackerRef.current = {
            auditUrl,
            status: "failed",
          };
          setViewerRuntimeGlbAudit(null);
          setLoadedAuditArtifactState({
            status: "failed",
            expectation: "required",
            auditUrl,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };

    void loadAuditArtifact();

    return () => {
      cancelled = true;
    };
  }, [file, generatedModelAuditRequestPlan]);

  const runtimeDebugSceneInspection =
    loadedSceneInspectionState.status === "complete"
      ? loadedSceneInspectionState.sceneInspection
      : null;

  const viewerRuntimeAuditContract = useMemo<BodyGeometryContract | null>(() => {
    if (!viewerRuntimeGlbAudit) return null;
    const emptyContract = createEmptyBodyGeometryContract();
    return updateContractValidation({
      ...emptyContract,
      contractVersion: viewerRuntimeGlbAudit.contractVersion ?? emptyContract.contractVersion,
      mode: viewerRuntimeGlbAudit.mode as BodyGeometryContract["mode"],
      source: {
        ...emptyContract.source,
        ...viewerRuntimeGlbAudit.source,
      },
      glb: {
        ...emptyContract.glb,
        ...viewerRuntimeGlbAudit.glb,
        generatedAt: viewerRuntimeGlbAudit.glb.generatedAt ?? viewerRuntimeGlbAudit.generatedAt,
      },
      meshes: {
        ...emptyContract.meshes,
        ...viewerRuntimeGlbAudit.meshes,
      },
      dimensionsMm: {
        ...emptyContract.dimensionsMm,
        ...viewerRuntimeGlbAudit.dimensionsMm,
      },
      validation: {
        ...emptyContract.validation,
        ...viewerRuntimeGlbAudit.validation,
      },
      svgQuality: viewerRuntimeGlbAudit.svgQuality,
    });
  }, [viewerRuntimeGlbAudit]);

  const viewerRuntimeBodyGeometryContract = useMemo<BodyGeometryContract | null>(() => {
    const hasBodyGeometryContext = Boolean(
      runtimeDebugSceneInspection ||
      viewerRuntimeAuditContract ||
      bodyGeometryContractSeed ||
      viewerRuntimeSourceHash ||
      viewerRuntimeGlbHash ||
      approvedBodyOutline ||
      sourceModelUrl ||
      file,
    );
    if (!hasBodyGeometryContext) {
      return null;
    }

    const sourceViewport = approvedBodyOutline?.sourceContourViewport;
    const expectedBodyHeightMm =
      canonicalDimensionCalibration?.bodyHeightMm ??
      tumblerDims?.bodyHeightMm ??
      canonicalDimensionCalibration?.totalHeightMm ??
      tumblerDims?.overallHeightMm;
    const expectedBodyWidthMm =
      canonicalDimensionCalibration?.frontVisibleWidthMm ??
      canonicalDimensionCalibration?.wrapDiameterMm ??
      tumblerDims?.diameterMm;
    const glbSourceHash =
      viewerRuntimeAuditContract?.glb.sourceHash ??
      viewerRuntimeAuditContract?.source.hash ??
      bodyGeometryContractSeed?.glb?.sourceHash ??
      bodyGeometryContractSeed?.source?.hash;
    const currentSourceHash =
      bodyGeometryContractSeed?.source?.type === "body-reference-v2"
        ? (
            bodyGeometryContractSeed?.source?.hash ??
            bodyGeometryContractSeed?.glb?.sourceHash ??
            viewerRuntimeSourceHash
          )
        : viewerRuntimeSourceHash;
    const runtimeValidationWarnings = [
      ...(runtimeDebugSceneInspection?.warnings ?? []),
      ...(loadedAuditArtifactState.status === "required-missing"
        ? ["Expected generated audit sidecar is missing for this reviewed GLB."]
        : []),
      ...(loadedAuditArtifactState.status === "failed"
        ? ["Failed to load required generated audit sidecar metadata."]
        : []),
    ];
    const runtimeBodyBounds = toBodyBounds(runtimeDebugSceneInspection?.bounds.body);
    const runtimeBodyBoundsUnits = runtimeDebugSceneInspection?.bounds.units;
    const seededBodyBounds =
      bodyGeometryContractSeed?.dimensionsMm?.bodyBounds ??
      viewerRuntimeAuditContract?.dimensionsMm?.bodyBounds;
    const seededBodyBoundsUnits =
      bodyGeometryContractSeed?.dimensionsMm?.bodyBoundsUnits ??
      viewerRuntimeAuditContract?.dimensionsMm?.bodyBoundsUnits;
    const resolvedBodyBounds = seededBodyBounds ?? runtimeBodyBounds;
    const resolvedBodyBoundsUnits = seededBodyBounds
      ? (seededBodyBoundsUnits ?? "mm")
      : runtimeBodyBoundsUnits;

    const baseContract: BodyGeometryContract = {
      ...createEmptyBodyGeometryContract(),
      mode: effectivePreviewMode ?? "unknown",
      source: {
        type: resolveViewerSourceType({
          sourceModelStatus,
          approvedBodyOutline,
        }),
        hash: currentSourceHash ?? undefined,
        widthPx: sourceViewport?.width,
        heightPx: sourceViewport?.height,
        viewBox: sourceViewport
          ? `${round2(sourceViewport.minX)} ${round2(sourceViewport.minY)} ${round2(sourceViewport.width)} ${round2(sourceViewport.height)}`
          : undefined,
        detectedBodyOnly: approvedBodyOutline?.sourceContourMode === "body-only",
      },
      glb: {
        path: glbPath ?? modelUrl ?? file?.name ?? undefined,
        hash: viewerRuntimeGlbHash ?? undefined,
        sourceHash: glbSourceHash ?? undefined,
        generatedAt: viewerRuntimeAuditContract?.glb.generatedAt,
      },
      meshes: {
        names: runtimeDebugSceneInspection?.meshNames ?? [],
        visibleMeshNames: runtimeDebugSceneInspection?.visibleMeshNames ?? [],
        materialNames: runtimeDebugSceneInspection?.materialNames ?? [],
        bodyMeshNames: runtimeDebugSceneInspection?.bodyMeshNames ?? [],
        accessoryMeshNames: runtimeDebugSceneInspection?.accessoryMeshNames ?? [],
        fallbackMeshNames: runtimeDebugSceneInspection?.fallbackMeshNames ?? [],
        fallbackDetected: runtimeDebugSceneInspection?.fallbackDetected ?? false,
        unexpectedMeshes: runtimeDebugSceneInspection?.unexpectedMeshNames ?? [],
        totalVertexCount: runtimeDebugSceneInspection?.totalVertexCount ?? 0,
        totalTriangleCount: runtimeDebugSceneInspection?.totalTriangleCount ?? 0,
      },
      dimensionsMm: {
        bodyBounds: resolvedBodyBounds,
        bodyBoundsUnits: resolvedBodyBoundsUnits,
        wrapDiameterMm: canonicalDimensionCalibration?.wrapDiameterMm ?? tumblerDims?.diameterMm,
        wrapWidthMm: canonicalDimensionCalibration?.wrapWidthMm ?? bedWidthMm,
        frontVisibleWidthMm: canonicalDimensionCalibration?.frontVisibleWidthMm,
        expectedBodyWidthMm,
        expectedBodyHeightMm,
        printableTopMm: canonicalDimensionCalibration?.lidBodyLineMm,
        printableBottomMm: canonicalDimensionCalibration?.bodyBottomMm,
        scaleSource:
          runtimeDebugSceneInspection?.bounds.units === "mm"
            ? "mesh-bounds"
            : canonicalDimensionCalibration
              ? "physical-wrap"
              : sourceViewport
                ? "svg-viewbox"
                : "unknown",
      },
      validation: {
        status: "unknown",
        errors: [],
        warnings: runtimeValidationWarnings,
      },
    };

    return mergeAuditContractWithLoadedInspection({
      auditContract: viewerRuntimeAuditContract,
      loadedInspectionContract: baseContract,
      metadataSeed: bodyGeometryContractSeed,
      currentMode: effectivePreviewMode ?? "unknown",
      currentSourceHash,
      loadedGlbHash: viewerRuntimeGlbHash,
      runtimeInspection: {
        status: loadedSceneInspectionState.status,
        glbUrl: url ?? sourceModelUrl ?? file?.name ?? undefined,
        inspectedAt:
          loadedSceneInspectionState.status === "complete"
            ? loadedSceneInspectionState.inspectedAt
            : undefined,
        error:
          loadedSceneInspectionState.status === "failed"
            ? loadedSceneInspectionState.error
            : undefined,
        auditArtifactPresent: loadedAuditArtifactState.status === "present",
        auditArtifactOptionalMissing: loadedAuditArtifactState.status === "optional-missing",
        auditArtifactRequiredMissing: loadedAuditArtifactState.status === "required-missing",
      },
    });
  }, [
    approvedBodyOutline,
    bedWidthMm,
    bodyGeometryContractSeed,
    canonicalDimensionCalibration,
    file,
    glbPath,
    loadedAuditArtifactState.status,
    loadedSceneInspectionState,
    modelUrl,
    effectivePreviewMode,
    runtimeDebugSceneInspection,
    sourceModelStatus,
    sourceModelUrl,
    tumblerDims,
    url,
    viewerRuntimeAuditContract,
    viewerRuntimeGlbHash,
    viewerRuntimeSourceHash,
  ]);

  const bodyCutoutQaGuardState = useMemo(
    () => buildBodyCutoutQaGuardState({
      mode: effectivePreviewMode,
      contract: viewerRuntimeBodyGeometryContract,
    }),
    [effectivePreviewMode, viewerRuntimeBodyGeometryContract],
  );

  useEffect(() => {
    onBodyGeometryContractChange?.(viewerRuntimeBodyGeometryContract ?? null);
  }, [onBodyGeometryContractChange, viewerRuntimeBodyGeometryContract]);

  useEffect(() => {
    return () => {
      onBodyGeometryContractChange?.(null);
    };
  }, [onBodyGeometryContractChange]);

  const showBodyGeometryStatusBadge = Boolean(
    viewerRuntimeBodyGeometryContract ||
    effectivePreviewMode ||
    sourceModelStatus ||
    approvedBodyOutline,
  );
  const shouldShowRuntimeStatusPanels = webglAvailability.status !== "unavailable";
  const showBodyContractInspector = Boolean(showModelDebug || BODY_CONTRACT_INSPECTOR_ENABLED);

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

  if (!url || !ext) return null;

  const hasItems = !!placedItems?.length && !!itemTextures?.size;

  return (
    <div
      data-body-reference-viewer-scaffold={showScaffoldOverlay ? "present" : "absent"}
      data-engraving-overlay-preview={hasItems ? "present" : "absent"}
      data-engraving-overlay-count={placedItems?.length ?? 0}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {showScaffoldOverlay && (
        <div
          data-body-reference-viewer-scaffold-slot="top-right"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxWidth: 280,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "rgba(15, 23, 42, 0.78)",
            color: "var(--text-primary)",
            pointerEvents: "none",
          }}
          data-requested-preview-mode={previewModelMode ?? "unknown"}
          data-effective-preview-mode={effectivePreviewMode ?? "unknown"}
          data-preview-status={previewModelState?.glbPreviewStatus ?? "not-requested"}
          data-preview-reason={previewModelState?.reason ?? "not-requested"}
        >
          {previewModeLabel && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {previewModeLabel}
            </div>
          )}
          {previewModeTransitionNote && (
            <div style={{ fontSize: 10, lineHeight: 1.4, color: "var(--warning)" }}>
              {previewModeTransitionNote}
            </div>
          )}
          {statusLabel && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {statusLabel}
            </div>
          )}
          {previewModeHint && (
            <div style={{ fontSize: 10, lineHeight: 1.4, color: "var(--text-dim)" }}>
              {previewModeHint}
            </div>
          )}
          {previewModeReasonNote && (
            <div
              style={{
                fontSize: 10,
                lineHeight: 1.4,
                color:
                  previewModelState?.glbPreviewStatus === "degraded" ||
                  previewModelState?.glbPreviewStatus === "unavailable"
                    ? "var(--warning)"
                    : "var(--text-dim)",
              }}
            >
              {previewModeReasonNote}
            </div>
          )}
          {qaReservedNote && (
            <div style={{ fontSize: 10, lineHeight: 1.4, color: "var(--warning)" }}>
              {qaReservedNote}
            </div>
          )}
        </div>
      )}
      {shouldShowRuntimeStatusPanels && (bodyCutoutQaGuardState || showBodyGeometryStatusBadge || showBodyContractInspector) && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 420,
            pointerEvents: "none",
          }}
        >
          {bodyCutoutQaGuardState && (
            <div style={{ pointerEvents: "auto" }}>
              <BodyCutoutQaGuardBanner state={bodyCutoutQaGuardState} />
            </div>
          )}
          {showBodyGeometryStatusBadge && (
            <div style={{ pointerEvents: "auto" }}>
              <BodyGeometryStatusBadge
                mode={effectivePreviewMode}
                contract={viewerRuntimeBodyGeometryContract}
              />
            </div>
          )}
          {showBodyContractInspector && (
            <div style={{ pointerEvents: "auto" }}>
              <BodyContractInspectorPanel
                contract={viewerRuntimeBodyGeometryContract}
                auditArtifact={viewerRuntimeGlbAudit}
                wrapExportProductionReadiness={wrapExportProductionReadiness}
              />
            </div>
          )}
        </div>
      )}
      {webglAvailability.status === "checking" && <WebGlPreflightPanel />}
      {webglAvailability.status === "unavailable" && (
        <WebGlUnavailablePanel isBodyCutoutQa={effectivePreviewMode === "body-cutout-qa"} />
      )}
      {webglAvailability.status === "available" && (
        <CanvasErrorBoundary>
          <Canvas
            shadows={false}
            frameloop={hasItems ? "always" : "demand"}
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
                <ModelByExtension
                  url={url}
                  ext={ext}
                  dims={tumblerDims}
                  scaleTargetHeightMm={scaleTargetHeightMm}
                  handleArcDeg={handleArcDeg}
                  placedItems={placedItems}
                  itemTextures={itemTextures}
                  bedWidthMm={bedWidthMm}
                  bedHeightMm={bedHeightMm}
                  glbPath={glbPath}
                  sourceName={sourceName}
                  tumblerMapping={tumblerMapping}
                  bodyTintColor={bodyTintColor}
                  rimTintColor={rimTintColor}
                  appearanceReferenceLayers={appearanceReferenceLayers}
                  showTemplateSurfaceZones={showTemplateSurfaceZones}
                  onReady={handleModelReady}
                />
              </Suspense>
              <AutoFit url={url} />
            </Bounds>

            {tumblerDims && modelBounds && !hasItems && (
              <EngravableZoneRing dims={tumblerDims} modelBounds={modelBounds} />
            )}

            <ContactShadows
              position={[0, modelBounds ? modelBounds.min.y - 0.5 : -0.01, 0]}
              opacity={0.4}
              scale={shadowScale}
              blur={3}
              far={shadowFar}
              color="#000018"
            />

            <Grid
              position={[0, modelBounds ? modelBounds.min.y - 1 : -0.011, 0]}
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
              autoRotate={isAutoRotating}
              autoRotateSpeed={0.7}
              minDistance={minDist}
              maxDistance={maxDist}
              maxPolarAngle={Math.PI / 1.85}
              enablePan={false}
              onStart={handleOrbitStart}
              onEnd={handleOrbitEnd}
            />
          </Canvas>
        </CanvasErrorBoundary>
      )}
      {showModelDebug && (
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxWidth: 320,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(51, 65, 85, 0.8)",
            background: "rgba(2, 6, 23, 0.84)",
            color: "var(--text-secondary)",
            fontFamily: "monospace",
            fontSize: 10,
            lineHeight: 1.45,
            pointerEvents: "none",
          }}
        >
          <div>runtime inspection: {loadedSceneInspectionState.status}</div>
          <div>audit state: {loadedAuditArtifactState.status}</div>
          <div>approved source SHA-256: {viewerRuntimeSourceHash ?? "pending"}</div>
          <div>loaded GLB SHA-256: {viewerRuntimeGlbHash ?? "pending"}</div>
          <div>audit source SHA-256: {viewerRuntimeGlbAudit?.glb.sourceHash ?? viewerRuntimeGlbAudit?.source.hash ?? "n/a"}</div>
        </div>
      )}
    </div>
  );
}

function LegacyScaffoldModelViewer({
  file,
  modelUrl,
  placedItems,
  itemTextures,
  bedWidthMm,
  bedHeightMm,
  tumblerDims,
  handleArcDeg,
  glbPath,
  tumblerMapping,
  bodyTintColor,
  rimTintColor,
  appearanceReferenceLayers,
  showTemplateSurfaceZones,
  previewModelMode,
  sourceModelStatus,
  sourceModelLabel,
  approvedBodyOutline = null,
  canonicalBodyProfile = null,
  canonicalDimensionCalibration = null,
  bodyGeometryContractSeed = null,
  showModelDebug = false,
  onBodyGeometryContractChange,
}: ModelViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [modelBounds, setModelBounds] = useState<THREE.Box3 | null>(null);
  const [loadedSceneInspectionState, setLoadedSceneInspectionState] = useState<LoadedSceneInspectionState>({
    status: "idle",
  });
  const [viewerRuntimeGlbHash, setViewerRuntimeGlbHash] = useState<string | null>(null);
  const [viewerRuntimeSourceHash, setViewerRuntimeSourceHash] = useState<string | null>(null);
  const [viewerRuntimeGlbAudit, setViewerRuntimeGlbAudit] = useState<BodyGeometryAuditArtifactLike | null>(null);
  const [loadedAuditArtifactState, setLoadedAuditArtifactState] = useState<LoadedAuditArtifactState>({
    status: "idle",
    expectation: "none",
  });
  const webglAvailability = useWebGlAvailability();

  // Auto-rotate: on by default for tumblers; pause on user interaction, resume after 4s
  const [isAutoRotating, setIsAutoRotating] = useState(!!tumblerDims);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOrbitStart = useCallback(() => {
    setIsAutoRotating(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  const handleOrbitEnd = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsAutoRotating(true), 4000);
  }, []);

  useEffect(() => {
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, []);

  // Create blob URL inside useEffect — safe for React Strict Mode
  useEffect(() => {
    let objectUrl: string | null = null;
    if (file) {
      objectUrl = URL.createObjectURL(file);
      // Syncing state to a new file load is intentional here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(objectUrl);
    } else if (modelUrl) {
      // Syncing state to a new URL load is intentional here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(modelUrl);
    } else {
      // Syncing state to a cleared source is intentional here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(null);
    }
    setModelBounds(null);
    setIsAutoRotating(!!tumblerDims);
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setUrl(null);
    };
  }, [file, modelUrl, tumblerDims]);

  const handleModelReady = useCallback((obj: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) setModelBounds(box);
  }, []);

  const sourceName = getModelSourceName(file, modelUrl);
  const ext = sourceName.split(".").pop()?.toLowerCase() ?? "";
  const reviewProductType = tumblerDims ? "tumbler" : null;
  const previewModeLabel = previewModelMode
    ? getBodyReferencePreviewModeLabel({
        productType: reviewProductType,
        mode: previewModelMode,
        glbStatus: sourceModelStatus,
      })
    : null;
  const previewModeHint = previewModelMode
    ? getBodyReferencePreviewModeHint({
        productType: reviewProductType,
        mode: previewModelMode,
      })
    : null;
  const statusLabel = sourceModelLabel ?? getDrinkwareGlbStatusLabel(sourceModelStatus);
  const qaReservedNote = previewModelMode === "body-cutout-qa" && !isBodyCutoutQaPreviewAvailable(sourceModelStatus)
    ? "BODY CUTOUT QA slot reserved until a reviewed body-only GLB exists."
    : null;
  const scaleTargetHeightMm =
    previewModelMode === "body-cutout-qa"
      ? (tumblerDims?.bodyHeightMm ?? tumblerDims?.printableHeightMm ?? null)
      : null;
  const showScaffoldOverlay = Boolean(previewModeLabel || statusLabel || qaReservedNote);

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

  if (!url || !ext) return null;

  const hasItems = !!placedItems?.length && !!itemTextures?.size;

  return (
    <div
      data-body-reference-viewer-scaffold={showScaffoldOverlay ? "present" : "absent"}
      data-engraving-overlay-preview={hasItems ? "present" : "absent"}
      data-engraving-overlay-count={placedItems?.length ?? 0}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {showScaffoldOverlay && (
        <div
          data-body-reference-viewer-scaffold-slot="top-right"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxWidth: 280,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "rgba(15, 23, 42, 0.78)",
            color: "var(--text-primary)",
            pointerEvents: "none",
          }}
        >
          {previewModeLabel && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {previewModeLabel}
            </div>
          )}
          {statusLabel && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {statusLabel}
            </div>
          )}
          {previewModeHint && (
            <div style={{ fontSize: 10, lineHeight: 1.4, color: "var(--text-dim)" }}>
              {previewModeHint}
            </div>
          )}
          {qaReservedNote && (
            <div style={{ fontSize: 10, lineHeight: 1.4, color: "var(--warning)" }}>
              {qaReservedNote}
            </div>
          )}
        </div>
      )}
      {webglAvailability.status === "checking" && <WebGlPreflightPanel />}
      {webglAvailability.status === "unavailable" && (
        <WebGlUnavailablePanel isBodyCutoutQa={previewModelMode === "body-cutout-qa"} />
      )}
      {webglAvailability.status === "available" && (
        <CanvasErrorBoundary>
          <Canvas
            shadows={false}
            frameloop={hasItems ? "always" : "demand"}
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
                <ModelByExtension
                  url={url} ext={ext}
                  dims={tumblerDims}
                  scaleTargetHeightMm={scaleTargetHeightMm}
                  handleArcDeg={handleArcDeg}
                  placedItems={placedItems}
                  itemTextures={itemTextures}
                  bedWidthMm={bedWidthMm}
                  bedHeightMm={bedHeightMm}
                  glbPath={glbPath}
                  sourceName={sourceName}
                  tumblerMapping={tumblerMapping}
                  bodyTintColor={bodyTintColor}
                  rimTintColor={rimTintColor}
                  appearanceReferenceLayers={appearanceReferenceLayers}
                  showTemplateSurfaceZones={showTemplateSurfaceZones}
                  onReady={handleModelReady}
                />
              </Suspense>
              <AutoFit url={url} />
            </Bounds>

            {/* Engravable zone highlight - shown when tumbler loaded, no items placed */}
            {tumblerDims && modelBounds && !hasItems && (
              <EngravableZoneRing dims={tumblerDims} modelBounds={modelBounds} />
            )}

            <ContactShadows
              position={[0, modelBounds ? modelBounds.min.y - 0.5 : -0.01, 0]}
              opacity={0.4}
              scale={shadowScale}
              blur={3}
              far={shadowFar}
              color="#000018"
            />

            <Grid
              position={[0, modelBounds ? modelBounds.min.y - 1 : -0.011, 0]}
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
              autoRotate={isAutoRotating}
              autoRotateSpeed={0.7}
              minDistance={minDist}
              maxDistance={maxDist}
              maxPolarAngle={Math.PI / 1.85}
              enablePan={false}
              onStart={handleOrbitStart}
              onEnd={handleOrbitEnd}
            />
          </Canvas>
        </CanvasErrorBoundary>
      )}
    </div>
  );
}
