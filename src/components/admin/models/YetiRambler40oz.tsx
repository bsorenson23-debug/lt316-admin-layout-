import * as THREE from "three";
import { useRef, useMemo, useEffect } from "react";
import { useGLTF, Decal } from "@react-three/drei";
import type { GLTF } from "three-stdlib";
import type { TumblerMapping } from "@/types/productTemplate";
import { normalizeGeometry } from "@/lib/modelAxisCorrection";
import { analyzeTumblerMesh } from "@/lib/analyzeTumblerMesh";

type GLTFResult = GLTF & {
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, never>;
};

/** Find the first usable Mesh node regardless of naming convention */
function resolveBodyMesh(nodes: Record<string, THREE.Object3D>): THREE.Mesh {
  const candidate =
    nodes.body_mesh ??
    nodes["(Unsaved)"] ??
    Object.values(nodes).find(
      (n): n is THREE.Mesh => (n as THREE.Mesh).isMesh === true,
    );
  if (!candidate || !(candidate as THREE.Mesh).isMesh) {
    throw new Error(
      "[YetiRambler40oz] No mesh found in GLB. Node names: " +
        Object.keys(nodes).join(", "),
    );
  }
  return candidate as THREE.Mesh;
}

export interface DecalItem {
  id: string;
  canvas: HTMLCanvasElement;
  /** Left edge on bed grid (mm) */
  gridX: number;
  /** Top edge on bed grid (mm) */
  gridY: number;
  /** Width on bed grid (mm) */
  gridW: number;
  /** Height on bed grid (mm) */
  gridH: number;
}

interface Props {
  placedItems: DecalItem[];
  diameterMm: number;
  printHeightMm: number;
  wrapWidthMm: number;
  handleArcDeg: number;
  /** GLB path — passed from the template so it works with any filename */
  glbPath?: string;
  /** Tumbler mapping from the wizard — orients the front face */
  tumblerMapping?: TumblerMapping;
  onReady?: (obj: THREE.Object3D) => void;
}

const DEFAULT_GLB_PATH = "/models/templates/yeti-40oz-body.glb";

export function YetiRambler40oz({
  placedItems,
  diameterMm,
  printHeightMm,
  wrapWidthMm,
  handleArcDeg: _handleArcDeg,
  glbPath = DEFAULT_GLB_PATH,
  tumblerMapping,
  onReady,
}: Props) {
  const effectiveHandleArcDeg = tumblerMapping?.handleArcDeg ?? _handleArcDeg ?? 0;
  const frontRotation = tumblerMapping?.frontFaceRotation ?? 0;
  void effectiveHandleArcDeg; // available for future handle zone overlay

  const { nodes } = useGLTF(glbPath) as unknown as GLTFResult;
  const bodyMesh = useMemo(() => resolveBodyMesh(nodes), [nodes]);
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // ── Normalize geometry: rotate to Y-up, bbox-center at origin ──
  const normalizedGeo = useMemo(
    () => normalizeGeometry(bodyMesh.geometry),
    [bodyMesh.geometry],
  );

  // ── Analyze rim for true cylinder center and radius ──
  const rimAnalysis = useMemo(
    () => analyzeTumblerMesh(normalizedGeo),
    [normalizedGeo],
  );

  // ── Re-center on rim axis (true cylinder center, not bbox center) ──
  const rimCenteredGeo = useMemo(() => {
    const clone = normalizedGeo.clone();
    clone.translate(-rimAnalysis.center.x, 0, -rimAnalysis.center.z);
    clone.computeBoundingBox();
    clone.computeVertexNormals();
    return clone;
  }, [normalizedGeo, rimAnalysis]);

  // ── Scale: group scale maps model units → mm ──
  // Model is in cm-scale units (radius ~4.77, height ~25.53).
  // scaleFactor ≈ 10.27 makes 1 visual unit = 1 mm in the scene.
  const scaleFactor = useMemo(() => {
    const rimDiameter = rimAnalysis.radius * 2;
    if (rimDiameter <= 0) return 1;
    return diameterMm / rimDiameter;
  }, [rimAnalysis, diameterMm]);

  // Model-unit values for Decal positioning (used INSIDE the scale group)
  const modelRadius = rimAnalysis.radius;         // ~4.77 model units
  const modelBodyHeight = rimAnalysis.bodyHeight;  // ~25.53 model units

  // ── Notify parent when ready ──
  useEffect(() => {
    if (groupRef.current) onReady?.(groupRef.current);
  });

  // ── Convert bed grid coordinates → 3D Decal position ──
  //
  // Coordinate spaces:
  //   GRID:  mm values (gridX, gridY, gridW, gridH, wrapWidthMm, printHeightMm)
  //   MODEL: cm-scale native units (modelRadius, modelBodyHeight)
  //   SCENE: mm after <group scale={scaleFactor}> is applied
  //
  // Decals are children of the mesh INSIDE the scale group,
  // so all positions and scales must be in MODEL UNITS.
  //
  // To convert mm → model units: divide by scaleFactor
  function gridTo3D(item: DecalItem) {
    // Angle computation uses mm (dimensionless result in radians)
    const radiusMm = diameterMm / 2;
    const frontX = wrapWidthMm / 2;
    const artCX = item.gridX + item.gridW / 2;
    const artCY = item.gridY + item.gridH / 2;
    const baseAngle = (artCX - frontX) / radiusMm;

    // Apply calibration offsets
    const calX = tumblerMapping?.calibrationOffsetX ?? 0;
    const calY = tumblerMapping?.calibrationOffsetY ?? 0;
    const calRotation = ((tumblerMapping?.calibrationRotation ?? 0) * Math.PI) / 180;
    const calAngle = (calX / scaleFactor) / modelRadius;
    const angleRad = baseAngle + calRotation + calAngle;

    // Position on cylinder surface in MODEL UNITS
    const decalX = Math.sin(angleRad) * modelRadius;
    const decalZ = Math.cos(angleRad) * modelRadius;

    // Y: map grid Y (0=top, printHeight=bottom) to model Y
    // Model top = +modelBodyHeight/2, bottom = -modelBodyHeight/2
    const rawDecalY = (modelBodyHeight / 2) - (artCY / scaleFactor) + (calY / scaleFactor);

    // Clamp so decal never extends past the engravable body zone
    const decalHalfH = (item.gridH / scaleFactor) / 2;
    const engravableTop = modelBodyHeight / 2;
    const engravableBottom = -modelBodyHeight / 2;
    const decalY = Math.max(
      engravableBottom + decalHalfH,
      Math.min(engravableTop - decalHalfH, rawDecalY),
    );

    return {
      position: [decalX, decalY, decalZ] as [number, number, number],
      rotation: [0, -angleRad, 0] as [number, number, number],
      scale: [
        item.gridW / scaleFactor,
        item.gridH / scaleFactor,
        20 / scaleFactor,
      ] as [number, number, number],
    };
  }

  // ── Create Three.js textures from canvases ──
  const textures = useMemo(() => {
    return placedItems.map((item) => {
      const tex = new THREE.CanvasTexture(item.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return { id: item.id, texture: tex };
    });
  }, [placedItems]);

  // Dispose textures on change/unmount
  useEffect(() => {
    return () => { textures.forEach((t) => t.texture.dispose()); };
  }, [textures]);

  return (
    <group ref={groupRef} scale={scaleFactor}>
      {/* Front face rotation from tumbler mapping */}
      <group rotation={[0, -frontRotation, 0]}>
        <mesh
          ref={meshRef}
          geometry={rimCenteredGeo}
          material={bodyMesh.material}
          castShadow
          receiveShadow
        >
          {placedItems.map((item, idx) => {
            const { position, rotation, scale } = gridTo3D(item);
            const tex = textures[idx]?.texture;
            if (!tex) return null;
            return (
              <Decal
                key={item.id}
                position={position}
                rotation={rotation}
                scale={scale}
              >
                <meshBasicMaterial
                  map={tex}
                  transparent
                  polygonOffset
                  polygonOffsetFactor={-10}
                  depthTest
                  depthWrite={false}
                />
              </Decal>
            );
          })}
        </mesh>
      </group>
    </group>
  );
}

useGLTF.preload(DEFAULT_GLB_PATH);
