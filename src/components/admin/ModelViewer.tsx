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
import { Canvas, useLoader } from "@react-three/fiber";
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
}

/** Per-item rasterized texture for 3D Decal projection */
export interface ItemTexture {
  itemId: string;
  canvas: HTMLCanvasElement;
}

export interface ModelViewerProps {
  file: File;
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

function computeModelTransform(
  rawSize: THREE.Vector3,
  dims: TumblerDimensions | null | undefined,
): ModelTransform {
  if (!dims || dims.overallHeightMm <= 0) {
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
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    // Fit camera once per unique model URL — not on every render
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    const timer = setTimeout(() => {
      bounds.refresh().clip().fit();
    }, 100);
    return () => clearTimeout(timer);
  }, [url, bounds]);
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
  useEffect(() => { if (ref.current) onReady?.(ref.current); });

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
  useEffect(() => { if (ref.current) onReady?.(ref.current); });

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation}>
      <primitive object={obj} castShadow receiveShadow />
    </group>
  );
}


function GltfMesh({
  url, dims, handleArcDeg, placedItems, itemTextures, bedWidthMm, bedHeightMm, bodyTintColor, onReady,
}: {
  url: string;
  dims?: TumblerDimensions | null;
  handleArcDeg?: number;
  placedItems?: PlacedItem[];
  itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number;
  bedHeightMm?: number;
  bodyTintColor?: string;
  onReady?: OnReady;
}) {
  const gltf = useLoader(GLTFLoader, url);

  // ── Scale to physical mm ──
  const transform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const rawSize = box.getSize(new THREE.Vector3());
    return computeModelTransform(rawSize, dims);
  }, [gltf.scene, dims]);

  // ── Extract body mesh geometry + material from the GLB scene ──
  // We render the mesh explicitly (not via <primitive>) so Decals can be children.
  const bodyMeshData = useMemo(() => {
    let foundGeometry: THREE.BufferGeometry | null = null;
    let foundMaterial: THREE.Material | THREE.Material[] | null = null;
    const otherObjects: THREE.Object3D[] = [];

    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !foundGeometry) {
        foundGeometry = obj.geometry;
        foundMaterial = obj.material;
      }
    });

    // Collect non-body children for rendering separately
    gltf.scene.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.geometry === foundGeometry) return;
      otherObjects.push(child);
    });

    return { geometry: foundGeometry, material: foundMaterial, otherObjects };
  }, [gltf.scene]);

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

  // ── Compute per-item Decal configs ──
  // Bed grid is an unwrapped cylinder:
  //   width  = wrapWidthMm = π × diameter
  //   height = printHeightMm
  //   FRONT  = x center of grid (wrapWidthMm / 2)
  // Decal position/scale are in native (pre-scale) units because
  // the parent <group> applies transform.scale uniformly.
  const decalConfigs = useMemo(() => {
    if (!dims || !placedItems?.length || !bedWidthMm || !bedHeightMm) return [];

    const radius = (dims.diameterMm ?? 98) / 2;
    const wrapWidth = bedWidthMm;
    const printHeight = bedHeightMm;
    const frontX = wrapWidth / 2;
    const s = transform.scale;

    return placedItems
      .filter((item) => item.visible !== false)
      .map((item) => {
        const artCenterX = (item.x + item.width / 2) - frontX;
        const artCenterY = (printHeight / 2) - (item.y + item.height / 2);
        const angleRad = artCenterX / radius;

        const posX = Math.sin(angleRad) * radius;
        const posZ = Math.cos(angleRad) * radius;
        const posY = artCenterY;

        return {
          itemId: item.id,
          position: [posX / s, posY / s, posZ / s] as [number, number, number],
          rotation: [0, -angleRad, 0] as [number, number, number],
          scale: [item.width / s, item.height / s, 20 / s] as [number, number, number],
        };
      });
  }, [dims, placedItems, bedWidthMm, bedHeightMm, transform.scale]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => { if (ref.current) onReady?.(ref.current); });

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
    }));
}

// Known model component registry — maps GLB path substrings to components
const KNOWN_MODELS: { match: string; key: string }[] = [
  { match: "yeti-40oz-body", key: "yeti40oz" },
  { match: "yeti-40-0z", key: "yeti40oz" },
  { match: "yeti_40oz", key: "yeti40oz" },
];

function ModelByExtension({
  url, ext, dims, handleArcDeg, placedItems, itemTextures, bedWidthMm, bedHeightMm, glbPath, tumblerMapping, bodyTintColor, onReady,
}: {
  url: string; ext: string; dims?: TumblerDimensions | null; handleArcDeg?: number;
  placedItems?: PlacedItem[]; itemTextures?: Map<string, HTMLCanvasElement>;
  bedWidthMm?: number; bedHeightMm?: number; glbPath?: string | null;
  tumblerMapping?: import("@/types/productTemplate").TumblerMapping; bodyTintColor?: string; onReady?: OnReady;
}) {
  if (ext === "stl") return <StlMesh url={url} dims={dims} onReady={onReady} />;
  if (ext === "obj") return <ObjMesh url={url} dims={dims} onReady={onReady} />;

  if (ext === "glb" || ext === "gltf") {
    // Check if this is a known model with a dedicated component
    const knownModel = glbPath ? KNOWN_MODELS.find((m) => glbPath.includes(m.match)) : null;

    if (knownModel?.key === "yeti40oz" && dims) {
      const decalItems = buildDecalItems(placedItems, itemTextures);
      return (
        <Suspense fallback={null}>
          <YetiRambler40oz
            placedItems={decalItems}
            diameterMm={dims.diameterMm}
            printHeightMm={dims.printableHeightMm}
            wrapWidthMm={bedWidthMm ?? Math.PI * dims.diameterMm}
            handleArcDeg={handleArcDeg ?? 0}
            glbPath={glbPath ?? undefined}
            tumblerMapping={tumblerMapping}
            onReady={onReady}
          />
        </Suspense>
      );
    }

    // Fallback: generic GLB loader
    return (
      <Suspense fallback={null}>
        <GltfMesh url={url} dims={dims} handleArcDeg={handleArcDeg}
          placedItems={placedItems} itemTextures={itemTextures}
          bedWidthMm={bedWidthMm} bedHeightMm={bedHeightMm} bodyTintColor={bodyTintColor} onReady={onReady} />
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
  file, placedItems, itemTextures, bedWidthMm, bedHeightMm, tumblerDims, handleArcDeg, glbPath, tumblerMapping, bodyTintColor,
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
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setModelBounds(null);
    setIsAutoRotating(!!tumblerDims);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [file, tumblerDims]);

  const handleModelReady = useCallback((obj: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) setModelBounds(box);
  }, []);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

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

  if (!url) return null;

  const hasItems = !!placedItems?.length && !!itemTextures?.size;

  return (
    <CanvasErrorBoundary>
      <Canvas
        shadows={false}
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ fov: 35, near: nearClip, far: farClip }}
        gl={{
          antialias: true,
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.0,
          alpha: false,
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#1a1a22"]} />

        <StudioLights />

        <Bounds observe={false} margin={2.0}>
          <Suspense fallback={<LoadingIndicator />}>
            <ModelByExtension
              url={url} ext={ext}
              dims={tumblerDims}
              handleArcDeg={handleArcDeg}
              placedItems={placedItems}
              itemTextures={itemTextures}
              bedWidthMm={bedWidthMm}
              bedHeightMm={bedHeightMm}
              glbPath={glbPath}
              tumblerMapping={tumblerMapping}
              bodyTintColor={bodyTintColor}
              onReady={handleModelReady}
            />
          </Suspense>
          <AutoFit url={url} />
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
