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
import { YetiRambler40oz } from "./models/YetiRambler40oz";
import type { DecalItem } from "./models/YetiRambler40oz";
import { getWrapFrontCenter } from "@/utils/tumblerWrapLayout";

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
  /** Body tint hex color (e.g. "#b0b8c4" for stainless, "#1a1a2e" for matte black) */
  bodyTintColor?: string;
  /** Rim / engraved artwork tint */
  rimTintColor?: string;
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
): ModelTransform {
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
      return { scale: 1, rotation: [Math.PI / 2, 0, 0] };
    }
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
    ? dims.overallHeightMm / heightInNativeUnits
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
  url, dims, onReady,
}: { url: string; dims?: TumblerDimensions | null; onReady?: OnReady }) {
  const geometry = useLoader(STLLoader, url);
  geometry.computeVertexNormals();

  const transform = useMemo(() => {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox ?? new THREE.Box3();
    const size = new THREE.Vector3();
    bb.getSize(size);
    return computeModelTransform(size, dims);
  }, [geometry, dims]);

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
  url, dims, onReady,
}: { url: string; dims?: TumblerDimensions | null; onReady?: OnReady }) {
  const obj = useLoader(OBJLoader, url);

  const transform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    return computeModelTransform(size, dims);
  }, [obj, dims]);

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
  url, dims, placedItems, itemTextures, bedWidthMm, bedHeightMm, tumblerMapping, bodyTintColor, rimTintColor, onReady,
}: {
  url: string;
  dims?: TumblerDimensions | null;
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
    return computeModelTransform(rawSize, dims);
  }, [bodyMeshData.bodyMesh, gltf.scene, dims]);

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

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady, gltf.scene]);

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation}>
      {/* Body mesh rendered explicitly so Decals can be direct children */}
      {bodyMeshData.geometry && (
        <mesh
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
  url, ext, dims, handleArcDeg, placedItems, itemTextures, bedWidthMm, bedHeightMm, glbPath, sourceName, tumblerMapping, bodyTintColor, rimTintColor, onReady,
}: {
  url: string; ext: string; dims?: TumblerDimensions | null; handleArcDeg?: number;
  placedItems?: PlacedItem[]; itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number; bedHeightMm?: number; glbPath?: string | null;
  sourceName?: string;
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping; bodyTintColor?: string; rimTintColor?: string; onReady?: OnReady;
}) {
  if (ext === "stl") return <StlMesh url={url} dims={dims} onReady={onReady} />;
  if (ext === "obj") return <ObjMesh url={url} dims={dims} onReady={onReady} />;

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
  file, flatPreview, placedItems, itemTextures, bedWidthMm, bedHeightMm, tumblerDims, handleArcDeg, glbPath, tumblerMapping, bodyTintColor, rimTintColor,
}: ModelViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [modelBounds, setModelBounds] = useState<THREE.Box3 | null>(null);

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
    if (!file) {
      const frameId = window.requestAnimationFrame(() => {
        setUrl(null);
        setModelBounds(null);
        setIsAutoRotating(false);
      });
      return () => window.cancelAnimationFrame(frameId);
    }
    const objectUrl = URL.createObjectURL(file);
    const frameId = window.requestAnimationFrame(() => {
      setUrl(objectUrl);
      setModelBounds(null);
      setIsAutoRotating(!!tumblerDims);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, tumblerDims]);

  const handleModelReady = useCallback((obj: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) setModelBounds(box);
  }, []);

  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  const viewKey = flatPreview
    ? `flat:${flatPreview.widthMm}:${flatPreview.heightMm}:${flatPreview.thicknessMm}:${flatPreview.familyKey ?? ""}:${flatPreview.label ?? ""}`
    : (url ?? "");

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

  if (!url && !flatPreview) return null;

  const hasItems = !!placedItems?.length && !!itemTextures?.size;

  return (
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
            {flatPreview ? (
              <FlatItemPreview
                dims={flatPreview}
                placedItems={placedItems}
                itemTextures={itemTextures}
                bedWidthMm={bedWidthMm}
                bedHeightMm={bedHeightMm}
                bodyTintColor={bodyTintColor}
                onReady={handleModelReady}
              />
            ) : url ? (
              <ModelByExtension
                url={url}
                ext={ext}
                dims={tumblerDims}
                handleArcDeg={handleArcDeg}
                placedItems={placedItems}
                itemTextures={itemTextures}
                bedWidthMm={bedWidthMm}
                bedHeightMm={bedHeightMm}
                glbPath={glbPath}
                sourceName={file?.name}
                tumblerMapping={tumblerMapping}
                bodyTintColor={bodyTintColor}
                rimTintColor={rimTintColor}
                onReady={handleModelReady}
              />
            ) : null}
          </Suspense>
          <AutoFit url={viewKey} />
        </Bounds>

        {/* Engravable zone highlight — shown when tumbler loaded, no items placed */}
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
  );
}


