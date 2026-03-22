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
} from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

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

export interface BedOverlayData {
  /** Pre-rendered PNG data URL of all placed items */
  dataUrl: string;
  bedWidthMm: number;
  bedHeightMm: number;
  workspaceMode: "flat-bed" | "tumbler-wrap";
  /** The raw canvas element — used for direct CanvasTexture on GLB meshes */
  canvas?: HTMLCanvasElement;
}

export interface ModelViewerProps {
  file: File;
  overlay?: BedOverlayData | null;
  tumblerDims?: TumblerDimensions | null;
  handleArcDeg?: number;
  /** Stable ref to the bed texture canvas — avoids identity churn from state */
  bedCanvas?: HTMLCanvasElement | null;
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
// Cylindrical overlay — wraps the bed design around the tumbler surface
// ---------------------------------------------------------------------------

// ── UV debug texture — enabled via ?uvdebug=true query param ─────────────

function createUvDebugTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  const cols = 10;
  const rows = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) {
    const x = (c / cols) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const y = (r / rows) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Coordinate labels at grid intersections
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      const u = (c / cols).toFixed(1);
      const v = (r / rows).toFixed(1);
      const x = (c / cols) * W;
      const y = (r / rows) * H;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - 26, y - 9, 52, 18);
      ctx.fillStyle = "#eee";
      ctx.fillText(`${u},${v}`, x, y);
    }
  }

  // Red left edge (U=0 seam)
  ctx.fillStyle = "rgba(255,40,40,0.7)";
  ctx.fillRect(0, 0, 6, H);
  ctx.save();
  ctx.translate(16, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = "bold 16px monospace";
  ctx.fillStyle = "#ff4444";
  ctx.textAlign = "center";
  ctx.fillText("U=0 SEAM (LEFT)", 0, 0);
  ctx.restore();

  // Blue right edge (U=1 seam)
  ctx.fillStyle = "rgba(40,100,255,0.7)";
  ctx.fillRect(W - 6, 0, 6, H);
  ctx.save();
  ctx.translate(W - 16, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = "bold 16px monospace";
  ctx.fillStyle = "#4488ff";
  ctx.textAlign = "center";
  ctx.fillText("U=1 SEAM (RIGHT)", 0, 0);
  ctx.restore();

  // Center cross-hair label
  ctx.font = "bold 18px monospace";
  ctx.fillStyle = "#ffcc00";
  ctx.textAlign = "center";
  ctx.fillText("CENTER (0.5, 0.5)", W / 2, H / 2 - 20);
  ctx.strokeStyle = "#ffcc00";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2 - 30, H / 2); ctx.lineTo(W / 2 + 30, H / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 30); ctx.lineTo(W / 2, H / 2 + 30); ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function isUvDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("uvdebug") === "true";
}

function OverlayCylinder({
  overlay, dims, modelBounds,
}: { overlay: BedOverlayData; dims: TumblerDimensions; modelBounds: THREE.Box3 }) {
  const uvDebug = useMemo(() => isUvDebugEnabled(), []);

  const texture = useMemo(() => {
    if (uvDebug) {
      const dbg = createUvDebugTexture();
      // Apply same offset as real texture so we can see where the seam lands
      dbg.offset.set(0.75, 0);
      return dbg;
    }
    const tex = new THREE.TextureLoader().load(overlay.dataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    // CylinderGeometry UV: U=0 starts at +X, advances clockwise (from top).
    // The front of the tumbler (+Z, facing the default camera) is at U ≈ 0.25.
    // Shift so that the center of the bed texture (U=0.5) sits at the front face.
    // offset = 0.25 - 0.5 = -0.25 → wrapped = 0.75
    tex.offset.set(0.75, 0);
    tex.needsUpdate = true;
    return tex;
  }, [overlay.dataUrl, uvDebug]);

  const size = modelBounds.getSize(new THREE.Vector3());
  const center = modelBounds.getCenter(new THREE.Vector3());

  // Radii from actual model bounds + tiny gap to prevent z-fighting
  const gap = 1.0; // 1mm
  const topR = (dims.topDiameterMm ?? dims.diameterMm) / 2 + gap;
  const botR = (dims.bottomDiameterMm ?? dims.diameterMm) / 2 + gap;

  // Fallback: if dims radii are 0 (not yet filled in), derive from model bounds
  const fallbackR = Math.max(size.x, size.z) / 2 + gap;
  const rTop = topR > gap ? topR : fallbackR;
  const rBot = botR > gap ? botR : fallbackR;

  return (
    <mesh position={[center.x, center.y, center.z]}>
      {/* open-ended cylinder, 64 segments for smooth curve */}
      <cylinderGeometry args={[rTop, rBot, dims.printableHeightMm, 64, 1, true]} />
      <meshBasicMaterial
        map={texture}
        transparent={!uvDebug}
        alphaTest={uvDebug ? 0 : 0.05}
        side={THREE.FrontSide}
        depthWrite={false}
        opacity={uvDebug ? 1.0 : 0.9}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Flat overlay plane — used for flat-bed mode
// ---------------------------------------------------------------------------

function OverlayPlane({
  overlay, modelBounds,
}: { overlay: BedOverlayData; modelBounds: THREE.Box3 }) {
  const texture = useMemo(() => {
    const tex = new THREE.TextureLoader().load(overlay.dataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [overlay.dataUrl]);

  const size = modelBounds.getSize(new THREE.Vector3());
  const center = modelBounds.getCenter(new THREE.Vector3());
  const zPos = modelBounds.max.z + 0.5;

  return (
    <mesh position={[center.x, center.y, zPos]}>
      <planeGeometry args={[size.x * 0.88, size.y * 0.82]} />
      <meshBasicMaterial
        map={texture} transparent alphaTest={0.08}
        depthWrite={false} opacity={0.92}
      />
    </mesh>
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

// ---------------------------------------------------------------------------
// Find handle angle by locating the vertex furthest from the Y axis.
// The handle protrudes outward from the cylinder body, so the vertex
// with max radial distance marks the handle direction.
// Returns angle in radians (atan2 convention: 0 = +Z).
// ---------------------------------------------------------------------------

function findHandleAngle(geometry: THREE.BufferGeometry): number {
  const pos = geometry.attributes.position;
  let maxDist = 0;
  let handleAngle = 0;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const distFromAxis = Math.sqrt(x * x + z * z);

    if (distFromAxis > maxDist) {
      maxDist = distFromAxis;
      handleAngle = Math.atan2(x, z);
    }
  }

  return handleAngle;
}

// ---------------------------------------------------------------------------
// Generate cylindrical UV projection for meshes without UVs.
// Uses the measured handle angle to place the seam at the handle
// and center the printable arc on the front face (opposite handle).
// ---------------------------------------------------------------------------

function generateCylindricalUVs(
  geometry: THREE.BufferGeometry,
  handleAngle: number,
  handleArcDeg: number = 0,
) {
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);

  // Front center is directly opposite the handle
  const frontAngle = handleAngle + Math.PI;

  // Y bounds for V coordinate
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yRange = maxY - minY || 1;

  const printableArcRad = (2 * Math.PI) - (handleArcDeg * Math.PI / 180);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);

    // Angle of this vertex around Y axis
    const vertexAngle = Math.atan2(x, z);

    // Angle relative to front center, normalized to -PI..PI
    let relAngle = vertexAngle - frontAngle;
    while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
    while (relAngle < -Math.PI) relAngle += 2 * Math.PI;

    // Map printable arc to U 0..1
    let u = (relAngle + printableArcRad / 2) / printableArcRad;
    u = Math.max(0, Math.min(1, u));

    // V = height 0..1, flipped so top of artwork = top of tumbler
    const v = (y - minY) / yRange;

    uvs[i * 2] = u;
    uvs[i * 2 + 1] = 1 - v;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.attributes.uv.needsUpdate = true;
}

function GltfMesh({
  url, dims, handleArcDeg, overlayCanvas, onReady,
}: {
  url: string;
  dims?: TumblerDimensions | null;
  handleArcDeg?: number;
  overlayCanvas?: HTMLCanvasElement | null;
  onReady?: OnReady;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const overlayMeshRef = useRef<THREE.Mesh | null>(null);
  const overlayTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const overlayMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const debugGroupRef = useRef<THREE.Group | null>(null);
  const measuredHandleAngleRef = useRef<number>(0);

  // ── Phase 1: Scale to physical mm + Phase 2: Detect handle ──
  const transform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const rawSize = box.getSize(new THREE.Vector3());
    return computeModelTransform(rawSize, dims);
  }, [gltf.scene, dims]);

  // ── Phase 1+2+5: Scale, detect handle, add debug visuals ──
  useEffect(() => {
    if (!gltf?.scene || !dims) return;

    // Find body mesh
    let bodyMesh: THREE.Mesh | null = null;
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !bodyMesh) {
        bodyMesh = obj;
      }
    });
    if (!bodyMesh) return;
    const mesh = bodyMesh as THREE.Mesh;

    // ── Phase 1: Log raw bounding box for diagnostics ──
    const rawBox = new THREE.Box3().setFromObject(gltf.scene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    console.log("[GltfMesh] raw bounding box size:",
      { x: rawSize.x.toFixed(4), y: rawSize.y.toFixed(4), z: rawSize.z.toFixed(4) });
    console.log("[GltfMesh] scale factor:", transform.scale.toFixed(4));

    // After scale is applied by the parent <group>, effective mm sizes are:
    const effectiveDiameter = Math.max(rawSize.x, rawSize.z) * transform.scale;
    const effectiveHeight = rawSize.y * transform.scale;
    console.log("[GltfMesh] effective mm:",
      { diameter: effectiveDiameter.toFixed(1), height: effectiveHeight.toFixed(1) });

    // ── Phase 2: Find handle angle from geometry ──
    const handleAngle = findHandleAngle(mesh.geometry);
    measuredHandleAngleRef.current = handleAngle;
    console.log("[GltfMesh] handle angle:",
      (handleAngle * 180 / Math.PI).toFixed(1) + "°",
      { x: Math.sin(handleAngle).toFixed(3), z: Math.cos(handleAngle).toFixed(3) });

    // ── Generate cylindrical UVs using measured handle angle ──
    const hasUVs = !!mesh.geometry.attributes.uv;
    if (!hasUVs) {
      generateCylindricalUVs(mesh.geometry, handleAngle, handleArcDeg ?? 0);
    }

    // ── Phase 5: Debug visuals — calibration circle + handle indicator ──
    // Clean up previous debug group
    if (debugGroupRef.current) {
      gltf.scene.remove(debugGroupRef.current);
      debugGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    const debugGroup = new THREE.Group();
    debugGroup.name = "debug-handle-visuals";

    // Measurements in native (pre-scale) units — the parent <group> applies scale
    const nativeRadius = Math.max(rawSize.x, rawSize.z) / 2;
    const nativeHalfHeight = rawSize.y / 2;
    const rawCenter = rawBox.getCenter(new THREE.Vector3());

    // Blue circle at top rim showing physical diameter
    const circleGeo = new THREE.RingGeometry(
      nativeRadius - 0.3 / transform.scale,
      nativeRadius + 0.3 / transform.scale,
      64,
    );
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(rawCenter.x, rawCenter.y + nativeHalfHeight, rawCenter.z);
    debugGroup.add(circle);

    // Red dot at handle position on the top rim
    const dotSize = 1.5 / transform.scale; // 1.5mm in native units
    const handleDotGeo = new THREE.SphereGeometry(dotSize, 8, 8);
    const handleDotMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const handleDot = new THREE.Mesh(handleDotGeo, handleDotMat);
    handleDot.position.set(
      rawCenter.x + Math.sin(handleAngle) * nativeRadius,
      rawCenter.y + nativeHalfHeight,
      rawCenter.z + Math.cos(handleAngle) * nativeRadius,
    );
    debugGroup.add(handleDot);

    // Green dot at front face (opposite handle) for reference
    const frontAngle = handleAngle + Math.PI;
    const frontDotGeo = new THREE.SphereGeometry(dotSize, 8, 8);
    const frontDotMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const frontDot = new THREE.Mesh(frontDotGeo, frontDotMat);
    frontDot.position.set(
      rawCenter.x + Math.sin(frontAngle) * nativeRadius,
      rawCenter.y + nativeHalfHeight,
      rawCenter.z + Math.cos(frontAngle) * nativeRadius,
    );
    debugGroup.add(frontDot);

    gltf.scene.add(debugGroup);
    debugGroupRef.current = debugGroup;

    return () => {
      if (debugGroupRef.current) {
        gltf.scene.remove(debugGroupRef.current);
        debugGroupRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
        debugGroupRef.current = null;
      }
    };
  }, [gltf.scene, dims, handleArcDeg, transform.scale]);

  // ── Phase 4: Overlay cylinder using measured handle angle ──
  // Original GLB material is NEVER touched — overlay sits 0.5mm proud.
  useEffect(() => {
    if (!gltf?.scene || !dims) return;

    let bodyMesh: THREE.Mesh | null = null;
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name !== "artwork-overlay" && !bodyMesh) {
        bodyMesh = obj;
      }
    });
    if (!bodyMesh) return;

    if (overlayCanvas) {
      const handleAngle = measuredHandleAngleRef.current;
      const frontAngle = handleAngle + Math.PI;
      const arc = handleArcDeg ?? 0;
      const printableArcRad = ((360 - arc) / 360) * Math.PI * 2;

      // Measure in native (pre-scale) units
      const rawBox = new THREE.Box3().setFromObject(bodyMesh);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const rawCenter = rawBox.getCenter(new THREE.Vector3());
      const nativeRadius = Math.max(rawSize.x, rawSize.z) / 2;
      // 0.5mm proud, converted to native units
      const overlayRadius = nativeRadius + 0.5 / transform.scale;
      const nativeHeight = dims.printableHeightMm / transform.scale;

      // thetaStart: CylinderGeometry theta=0 starts at +X, goes CCW from top.
      // frontAngle is in atan2(x,z) convention where 0 = +Z.
      // Convert: CylinderGeometry angle = atan2(x,z) rotated by -π/2
      // So cylTheta = frontAngle + π/2, then center the arc there.
      const cylFront = frontAngle + Math.PI / 2;
      const thetaStart = cylFront - printableArcRad / 2;

      // ── Create or update texture ──
      if (!overlayTextureRef.current) {
        const tex = new THREE.CanvasTexture(overlayCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        overlayTextureRef.current = tex;
      } else {
        overlayTextureRef.current.image = overlayCanvas;
        overlayTextureRef.current.needsUpdate = true;
      }

      // ── Create or update overlay mesh ──
      if (!overlayMeshRef.current) {
        const geo = new THREE.CylinderGeometry(
          overlayRadius, overlayRadius, nativeHeight, 64, 1, true,
          thetaStart, printableArcRad,
        );
        const mat = new THREE.MeshBasicMaterial({
          map: overlayTextureRef.current,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.FrontSide,
        });
        overlayMatRef.current = mat;

        const overlayMesh = new THREE.Mesh(geo, mat);
        overlayMesh.position.copy(rawCenter);
        overlayMesh.name = "artwork-overlay";
        overlayMeshRef.current = overlayMesh;

        (bodyMesh as THREE.Mesh).parent?.add(overlayMesh);
      } else {
        overlayMeshRef.current.geometry.dispose();
        overlayMeshRef.current.geometry = new THREE.CylinderGeometry(
          overlayRadius, overlayRadius, nativeHeight, 64, 1, true,
          thetaStart, printableArcRad,
        );
        overlayMeshRef.current.position.copy(rawCenter);
        if (overlayMatRef.current) {
          overlayMatRef.current.map = overlayTextureRef.current;
          overlayMatRef.current.needsUpdate = true;
        }
      }
    } else {
      // ── Remove overlay when cleared ──
      if (overlayMeshRef.current) {
        overlayMeshRef.current.parent?.remove(overlayMeshRef.current);
        overlayMeshRef.current.geometry.dispose();
        overlayMeshRef.current = null;
      }
      if (overlayMatRef.current) {
        overlayMatRef.current.dispose();
        overlayMatRef.current = null;
      }
      if (overlayTextureRef.current) {
        overlayTextureRef.current.dispose();
        overlayTextureRef.current = null;
      }
    }

    return () => {
      if (overlayMeshRef.current) {
        overlayMeshRef.current.parent?.remove(overlayMeshRef.current);
        overlayMeshRef.current.geometry.dispose();
        overlayMeshRef.current = null;
      }
      if (overlayMatRef.current) {
        overlayMatRef.current.dispose();
        overlayMatRef.current = null;
      }
      if (overlayTextureRef.current) {
        overlayTextureRef.current.dispose();
        overlayTextureRef.current = null;
      }
    };
  }, [gltf.scene, overlayCanvas, dims, handleArcDeg, transform.scale]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => { if (ref.current) onReady?.(ref.current); });

  return (
    <group ref={ref} scale={transform.scale} rotation={transform.rotation}>
      <primitive object={gltf.scene} castShadow receiveShadow />
    </group>
  );
}

function ModelByExtension({
  url, ext, dims, handleArcDeg, overlayCanvas, onReady,
}: { url: string; ext: string; dims?: TumblerDimensions | null; handleArcDeg?: number; overlayCanvas?: HTMLCanvasElement | null; onReady?: OnReady }) {
  if (ext === "stl") return <StlMesh url={url} dims={dims} onReady={onReady} />;
  if (ext === "obj") return <ObjMesh url={url} dims={dims} onReady={onReady} />;
  if (ext === "glb" || ext === "gltf") return (
    <Suspense fallback={null}>
      <GltfMesh url={url} dims={dims} handleArcDeg={handleArcDeg} overlayCanvas={overlayCanvas} onReady={onReady} />
    </Suspense>
  );
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

export default function ModelViewer({ file, overlay, tumblerDims, handleArcDeg, bedCanvas }: ModelViewerProps) {
  // Use stable bedCanvas ref prop — only present when overlay is active
  const overlayCanvas = overlay ? (bedCanvas ?? null) : null;
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
  // When tumblerDims provided: 1 unit = 1mm → grid/shadow/camera in mm
  // Otherwise: normalized (Bounds handles fit)
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

  const isTumbler = overlay?.workspaceMode === "tumbler-wrap" || !!tumblerDims;

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
              overlayCanvas={overlayCanvas}
              onReady={handleModelReady}
            />
          </Suspense>
          <AutoFit url={url} />
        </Bounds>

        {/* Engravable zone highlight — shown when tumbler loaded, no design yet */}
        {tumblerDims && modelBounds && !overlay && (
          <EngravableZoneRing dims={tumblerDims} modelBounds={modelBounds} />
        )}

        {/* Design overlay — cylindrical for tumblers, flat plane for flat bed */}
        {/* Skip OverlayCylinder for GLB files — texture is applied directly to the mesh */}
        {overlay && modelBounds && (() => {
          const isGlb = ext === "glb" || ext === "gltf";
          const useDirectTexture = isGlb && isTumbler && !!overlayCanvas;
          if (useDirectTexture) return null; // handled by GltfMesh
          return isTumbler && tumblerDims
            ? <OverlayCylinder overlay={overlay} dims={tumblerDims} modelBounds={modelBounds} />
            : <OverlayPlane overlay={overlay} modelBounds={modelBounds} />;
        })()}

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
