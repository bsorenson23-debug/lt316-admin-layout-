import * as THREE from "three";
import { useRef, useMemo, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";
import type { TumblerMapping } from "@/types/productTemplate";
import { normalizeGeometry } from "@/lib/modelAxisCorrection";
import { analyzeTumblerMesh } from "@/lib/analyzeTumblerMesh";
import { getTumblerWrapLayout } from "@/utils/tumblerWrapLayout";

type GLTFResult = GLTF & {
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, never>;
};

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

function resolveBaseMaterial(
  material: THREE.Material | THREE.Material[],
): THREE.MeshStandardMaterial {
  const candidates = Array.isArray(material) ? material : [material];
  const standardCandidate = candidates.find(
    (candidate): candidate is THREE.MeshStandardMaterial =>
      candidate instanceof THREE.MeshStandardMaterial,
  );

  if (standardCandidate) {
    return standardCandidate.clone();
  }

  return new THREE.MeshStandardMaterial({
    color: "#7b7b7b",
    metalness: 0.55,
    roughness: 0.42,
  });
}

export interface DecalItem {
  id: string;
  canvas: HTMLCanvasElement;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  gridRotationDeg?: number;
}

interface Props {
  placedItems: DecalItem[];
  diameterMm: number;
  topDiameterMm?: number;
  bottomDiameterMm?: number;
  overallHeightMm: number;
  printHeightMm: number;
  printableTopOffsetMm: number;
  wrapWidthMm: number;
  handleArcDeg: number;
  glbPath?: string;
  tumblerMapping?: TumblerMapping;
  bodyTintColor?: string;
  rimTintColor?: string;
  orientToFrontFace?: boolean;
  preferProceduralShell?: boolean;
  onReady?: (obj: THREE.Object3D) => void;
}

const DEFAULT_GLB_PATH = "/models/templates/yeti-40oz-body.glb";
const WRAP_TEXTURE_PX_PER_MM = 4;
export const BODY_RADIUS_TOLERANCE_WITH_HANDLE = 1.14;
export const BODY_RADIUS_TOLERANCE_DEFAULT = 1.03;

export const CYL_OVERLAY_VERTEX_SHADER = `
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CYL_OVERLAY_FRAGMENT_SHADER = `
  uniform sampler2D uWrapMap;
  uniform float uPrintHeightMm;
  uniform float uPrintTopOffsetMm;
  uniform float uScaleFactorY;
  uniform float uRimTopLocalY;
  uniform float uFrontRotation;
  uniform float uBodyRadiusLocal;
  uniform float uBodyRadiusTolerance;
  uniform float uCalY;
  uniform float uCalRotation;
  uniform float uCalAngle;
  uniform float uFrontAnchorU;
  uniform float uAlpha;

  varying vec3 vLocalPos;

  const float TAU = 6.28318530718;

  void main() {
    float radialLen = length(vLocalPos.xz);
    if (radialLen < 0.0001) {
      discard;
    }

    if (radialLen > uBodyRadiusLocal * uBodyRadiusTolerance) {
      discard;
    }

    float theta = atan(vLocalPos.x, vLocalPos.z);
    float offset = uFrontRotation + uCalRotation + uCalAngle;
    float u = fract(uFrontAnchorU + ((theta - offset) / TAU));

    float yFromTopMm = (uRimTopLocalY - vLocalPos.y) * uScaleFactorY;
    float yMm = yFromTopMm - uPrintTopOffsetMm + uCalY;
    float v = yMm / max(uPrintHeightMm, 0.0001);

    if (v < 0.0 || v > 1.0) discard;

    vec4 tex = texture2D(uWrapMap, vec2(u, v));
    if (tex.a <= 0.001) discard;

    gl_FragColor = vec4(tex.rgb, tex.a * uAlpha);
  }
`;

export function buildWrapTexture(
  placedItems: DecalItem[],
  wrapWidthMm: number,
  printHeightMm: number,
): THREE.CanvasTexture | null {
  if (wrapWidthMm <= 0 || printHeightMm <= 0 || placedItems.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(wrapWidthMm * WRAP_TEXTURE_PX_PER_MM));
  canvas.height = Math.max(1, Math.round(printHeightMm * WRAP_TEXTURE_PX_PER_MM));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const drawAt = (
    source: HTMLCanvasElement,
    xPx: number,
    yPx: number,
    wPx: number,
    hPx: number,
    rotationDeg: number,
  ) => {
    ctx.save();
    ctx.translate(xPx + wPx / 2, yPx + hPx / 2);
    if (rotationDeg) {
      ctx.rotate((rotationDeg * Math.PI) / 180);
    }
    ctx.drawImage(source, -wPx / 2, -hPx / 2, wPx, hPx);
    ctx.restore();
  };

  placedItems.forEach((item) => {
    if (!item.canvas || item.gridW <= 0 || item.gridH <= 0) return;

    const wPx = Math.max(1, Math.round(item.gridW * WRAP_TEXTURE_PX_PER_MM));
    const hPx = Math.max(1, Math.round(item.gridH * WRAP_TEXTURE_PX_PER_MM));
    const xPx = Math.round(item.gridX * WRAP_TEXTURE_PX_PER_MM);
    const yPx = Math.round(item.gridY * WRAP_TEXTURE_PX_PER_MM);
    const rotationDeg = item.gridRotationDeg ?? 0;

    drawAt(item.canvas, xPx, yPx, wPx, hPx, rotationDeg);

    // Seam wrapping support for items crossing left/right edge.
    if (xPx < 0) drawAt(item.canvas, xPx + canvas.width, yPx, wPx, hPx, rotationDeg);
    if (xPx + wPx > canvas.width) drawAt(item.canvas, xPx - canvas.width, yPx, wPx, hPx, rotationDeg);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Custom shader samples raw UVs; keep canvas top at v=0.
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return texture;
}

function buildProceduralTumblerBodyGeometry(args: {
  diameterMm: number;
  topDiameterMm?: number;
  bottomDiameterMm?: number;
  overallHeightMm: number;
}): {
  geometry: THREE.LatheGeometry;
  topY: number;
  bodyRadius: number;
} {
  const heightMm = Math.max(args.overallHeightMm, 1);
  const midDiameterMm = Math.max(args.diameterMm, 1);
  const topDiameterMm = Math.max(args.topDiameterMm ?? midDiameterMm, 1);
  const bottomDiameterMm = Math.max(args.bottomDiameterMm ?? midDiameterMm, 1);

  const bodyRadius = midDiameterMm / 2;
  const topRadius = topDiameterMm / 2;
  const bottomRadius = bottomDiameterMm / 2;
  const halfHeight = heightMm / 2;
  const lowerTransitionY = -halfHeight + (heightMm * 0.28);
  const upperTransitionY = halfHeight - (heightMm * 0.16);

  const profilePoints = [
    new THREE.Vector2(Math.max(2, topRadius * 0.94), halfHeight),
    new THREE.Vector2(Math.max(2, topRadius), halfHeight - (heightMm * 0.03)),
    new THREE.Vector2(Math.max(2, topRadius * 0.985), upperTransitionY),
    new THREE.Vector2(Math.max(2, bodyRadius), halfHeight * 0.04),
    new THREE.Vector2(Math.max(2, bodyRadius * 0.985), -heightMm * 0.18),
    new THREE.Vector2(Math.max(2, bottomRadius * 1.05), lowerTransitionY),
    new THREE.Vector2(Math.max(2, bottomRadius), -halfHeight + (heightMm * 0.035)),
    new THREE.Vector2(Math.max(2, bottomRadius * 0.96), -halfHeight),
  ];

  const geometry = new THREE.LatheGeometry(profilePoints, 72);
  geometry.rotateY(Math.PI);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return {
    geometry,
    topY: halfHeight,
    bodyRadius: Math.max(bodyRadius, topRadius, bottomRadius),
  };
}

function buildProceduralHandleGeometry(args: {
  bodyRadiusMm: number;
  overallHeightMm: number;
  handleArcDeg: number;
}): THREE.TubeGeometry | null {
  if (!(args.handleArcDeg > 0)) return null;

  const heightMm = Math.max(args.overallHeightMm, 1);
  const bodyRadiusMm = Math.max(args.bodyRadiusMm, 1);
  const attachInset = Math.max(2.2, bodyRadiusMm * 0.08);
  const outerReach = Math.max(bodyRadiusMm * 0.82, heightMm * 0.14);
  const topAttachY = heightMm * 0.16;
  const bottomAttachY = -heightMm * 0.2;
  const midY = (topAttachY + bottomAttachY) / 2;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-(bodyRadiusMm - attachInset), topAttachY, 0),
    new THREE.Vector3(-(bodyRadiusMm + outerReach * 0.76), topAttachY * 0.96, 0),
    new THREE.Vector3(-(bodyRadiusMm + outerReach), midY, 0),
    new THREE.Vector3(-(bodyRadiusMm + outerReach * 0.76), bottomAttachY * 1.02, 0),
    new THREE.Vector3(-(bodyRadiusMm - attachInset), bottomAttachY, 0),
  ]);

  const tubeRadius = Math.max(3.2, Math.min(8, heightMm * 0.022));
  const geometry = new THREE.TubeGeometry(curve, 48, tubeRadius, 16, false);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function YetiRambler40oz({
  placedItems,
  diameterMm,
  topDiameterMm,
  bottomDiameterMm,
  overallHeightMm,
  printHeightMm,
  printableTopOffsetMm,
  wrapWidthMm,
  handleArcDeg: _handleArcDeg,
  glbPath = DEFAULT_GLB_PATH,
  tumblerMapping,
  bodyTintColor = "#1f2322",
  rimTintColor = "#cfd2d0",
  orientToFrontFace = false,
  preferProceduralShell = false,
  onReady,
}: Props) {
  const shouldUseProceduralShell = preferProceduralShell || !glbPath;
  const effectiveHandleArcDeg = tumblerMapping?.handleArcDeg ?? _handleArcDeg ?? 0;
  const wrapLayout = useMemo(
    () => getTumblerWrapLayout(effectiveHandleArcDeg),
    [effectiveHandleArcDeg],
  );

  const { nodes } = useGLTF(glbPath || DEFAULT_GLB_PATH) as unknown as GLTFResult;
  const bodyMesh = useMemo(() => resolveBodyMesh(nodes), [nodes]);
  const groupRef = useRef<THREE.Group>(null);

  const normalizedGeo = useMemo(
    () => normalizeGeometry(bodyMesh.geometry),
    [bodyMesh.geometry],
  );

  const rimAnalysis = useMemo(
    () => analyzeTumblerMesh(normalizedGeo),
    [normalizedGeo],
  );

  const rimCenteredGeo = useMemo(() => {
    const clone = normalizedGeo.clone();
    clone.translate(-rimAnalysis.center.x, 0, -rimAnalysis.center.z);
    clone.computeBoundingBox();
    clone.computeVertexNormals();
    return clone;
  }, [normalizedGeo, rimAnalysis]);

  const proceduralShell = useMemo(() => {
    if (!shouldUseProceduralShell) return null;
    const body = buildProceduralTumblerBodyGeometry({
      diameterMm,
      topDiameterMm,
      bottomDiameterMm,
      overallHeightMm,
    });
    return {
      bodyGeometry: body.geometry,
      handleGeometry: buildProceduralHandleGeometry({
        bodyRadiusMm: body.bodyRadius,
        overallHeightMm,
        handleArcDeg: effectiveHandleArcDeg,
      }),
      topY: body.topY,
      bodyRadius: body.bodyRadius,
    };
  }, [
    shouldUseProceduralShell,
    diameterMm,
    topDiameterMm,
    bottomDiameterMm,
    overallHeightMm,
    effectiveHandleArcDeg,
  ]);

  const horizontalBodyRadiusLocal = useMemo(() => {
    rimCenteredGeo.computeBoundingBox();
    const box = rimCenteredGeo.boundingBox;
    if (!box) return Math.max(0.0001, rimAnalysis.radius);

    const xHalf = (box.max.x - box.min.x) / 2;
    const zHalf = (box.max.z - box.min.z) / 2;
    return Math.max(0.0001, Math.min(xHalf, zHalf));
  }, [rimCenteredGeo, rimAnalysis.radius]);

  const computedWrapWidthMm = wrapWidthMm > 0
    ? wrapWidthMm
    : Math.PI * Math.max(diameterMm, 1);

  const scaleFactorXz = useMemo(() => {
    const scaleFromWrap =
      computedWrapWidthMm > 0 && rimAnalysis.radius > 0
        ? computedWrapWidthMm / (2 * Math.PI * rimAnalysis.radius)
        : 0;

    if (Number.isFinite(scaleFromWrap) && scaleFromWrap > 0) return scaleFromWrap;

    const rimDiameter = rimAnalysis.radius * 2;
    if (rimDiameter > 0 && diameterMm > 0) return diameterMm / rimDiameter;

    return 1;
  }, [rimAnalysis.radius, computedWrapWidthMm, diameterMm]);

  const scaleFactorY = useMemo(() => {
    if (overallHeightMm > 0 && rimAnalysis.bodyHeight > 0) {
      return overallHeightMm / rimAnalysis.bodyHeight;
    }
    return scaleFactorXz;
  }, [overallHeightMm, rimAnalysis.bodyHeight, scaleFactorXz]);

  const bodyRadiusLocal = useMemo(() => {
    const targetTopDiameterMm = Math.max(0, topDiameterMm ?? diameterMm);
    const targetTopRadiusLocal =
      targetTopDiameterMm > 0 && scaleFactorXz > 0
        ? (targetTopDiameterMm / 2) / scaleFactorXz
        : 0;

    return Math.max(
      0.0001,
      targetTopRadiusLocal,
      horizontalBodyRadiusLocal,
      rimAnalysis.radius,
    );
  }, [
    topDiameterMm,
    diameterMm,
    scaleFactorXz,
    horizontalBodyRadiusLocal,
    rimAnalysis.radius,
  ]);

  const bodyRadiusTolerance = effectiveHandleArcDeg > 0
    ? BODY_RADIUS_TOLERANCE_WITH_HANDLE
    : BODY_RADIUS_TOLERANCE_DEFAULT;
  const renderGeometry = proceduralShell?.bodyGeometry ?? rimCenteredGeo;
  const renderBodyRadiusLocal = proceduralShell?.bodyRadius ?? bodyRadiusLocal;
  const renderTopLocalY = proceduralShell?.topY ?? rimAnalysis.topY;
  const renderScaleFactorXz = proceduralShell ? 1 : scaleFactorXz;
  const renderScaleFactorY = proceduralShell ? 1 : scaleFactorY;

  const radiusMm = computedWrapWidthMm / (2 * Math.PI);
  const maxCalX = computedWrapWidthMm * 0.12;
  const maxCalY = printHeightMm * 0.2;
  const maxCalRotationDeg = 35;

  const frontRotation = tumblerMapping?.frontFaceRotation ?? 0;
  const visualFrontRotation = orientToFrontFace ? -frontRotation : 0;
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
  const calAngle = radiusMm > 0 ? calX / radiusMm : 0;

  const wrapTexture = useMemo(
    () => buildWrapTexture(placedItems, computedWrapWidthMm, printHeightMm),
    [placedItems, computedWrapWidthMm, printHeightMm],
  );

  useEffect(() => {
    return () => {
      wrapTexture?.dispose();
    };
  }, [wrapTexture]);

  useEffect(() => {
    if (groupRef.current) onReady?.(groupRef.current);
  }, [onReady, renderGeometry, renderScaleFactorXz, renderScaleFactorY, proceduralShell]);

  useEffect(() => {
    return () => {
      proceduralShell?.bodyGeometry.dispose();
      proceduralShell?.handleGeometry?.dispose();
    };
  }, [proceduralShell]);

  const overlayUniforms = useMemo(() => {
    if (!wrapTexture) return null;
    return {
      uWrapMap: { value: wrapTexture },
      uPrintHeightMm: { value: Math.max(1, printHeightMm) },
      uPrintTopOffsetMm: { value: Math.max(0, printableTopOffsetMm) },
      uScaleFactorY: { value: renderScaleFactorY > 0 ? renderScaleFactorY : renderScaleFactorXz || 1 },
      uRimTopLocalY: { value: renderTopLocalY },
      uFrontRotation: { value: frontRotation },
      uBodyRadiusLocal: { value: Math.max(0.0001, renderBodyRadiusLocal) },
      uBodyRadiusTolerance: { value: bodyRadiusTolerance },
      uCalY: { value: calY },
      uCalRotation: { value: calRotation },
      uCalAngle: { value: calAngle },
      uFrontAnchorU: { value: wrapLayout.frontAnchorU },
      uAlpha: { value: 1.0 },
    };
  }, [
    wrapTexture,
    printHeightMm,
    printableTopOffsetMm,
    renderScaleFactorY,
    renderScaleFactorXz,
    renderTopLocalY,
    frontRotation,
    renderBodyRadiusLocal,
    bodyRadiusTolerance,
    calY,
    calRotation,
    calAngle,
    wrapLayout.frontAnchorU,
  ]);

  const baseColorUniforms = useMemo(() => ({
    uBodyColor: { value: new THREE.Color(bodyTintColor) },
    uRimColor: { value: new THREE.Color(rimTintColor) },
    uBodyStartMm: { value: Math.max(0, printableTopOffsetMm) },
    uBodyEndMm: { value: Math.max(0, printableTopOffsetMm) + Math.max(0, printHeightMm) },
    uBodyRadiusLocal: { value: Math.max(0.0001, renderBodyRadiusLocal) },
    uBodyRadiusTolerance: { value: bodyRadiusTolerance },
    uScaleFactorY: { value: renderScaleFactorY > 0 ? renderScaleFactorY : renderScaleFactorXz || 1 },
    uRimTopLocalY: { value: renderTopLocalY },
  }), [
    bodyTintColor,
    rimTintColor,
    printableTopOffsetMm,
    printHeightMm,
    renderBodyRadiusLocal,
    bodyRadiusTolerance,
    renderScaleFactorY,
    renderScaleFactorXz,
    renderTopLocalY,
  ]);

  const baseBandMaterial = useMemo(() => {
    const material = shouldUseProceduralShell
      ? new THREE.MeshStandardMaterial({
          color: bodyTintColor,
          metalness: 0.34,
          roughness: 0.58,
        })
      : resolveBaseMaterial(bodyMesh.material);

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBodyColor = baseColorUniforms.uBodyColor;
      shader.uniforms.uRimColor = baseColorUniforms.uRimColor;
      shader.uniforms.uBodyStartMm = baseColorUniforms.uBodyStartMm;
      shader.uniforms.uBodyEndMm = baseColorUniforms.uBodyEndMm;
      shader.uniforms.uBodyRadiusLocal = baseColorUniforms.uBodyRadiusLocal;
      shader.uniforms.uBodyRadiusTolerance = baseColorUniforms.uBodyRadiusTolerance;
      shader.uniforms.uScaleFactorY = baseColorUniforms.uScaleFactorY;
      shader.uniforms.uRimTopLocalY = baseColorUniforms.uRimTopLocalY;

      shader.vertexShader = `
        varying vec3 vLocalPos;
        varying float vLocalY;
      ${shader.vertexShader}
      `.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vLocalPos = position;
        vLocalY = position.y;`,
      );

      shader.fragmentShader = `
        uniform vec3 uBodyColor;
        uniform vec3 uRimColor;
        uniform float uBodyStartMm;
        uniform float uBodyEndMm;
        uniform float uBodyRadiusLocal;
        uniform float uBodyRadiusTolerance;
        uniform float uScaleFactorY;
        uniform float uRimTopLocalY;
        varying vec3 vLocalPos;
        varying float vLocalY;
      ${shader.fragmentShader}
      `.replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `
          float radialLen = length(vLocalPos.xz);
          bool isCupBody = radialLen <= uBodyRadiusLocal * uBodyRadiusTolerance;
          float yFromTopMm = (uRimTopLocalY - vLocalY) * uScaleFactorY;
          vec3 bandColor = (yFromTopMm >= uBodyStartMm && yFromTopMm <= uBodyEndMm)
            ? uBodyColor
            : uRimColor;
          vec3 finalColor = isCupBody ? bandColor : uBodyColor;
          vec4 diffuseColor = vec4( finalColor, opacity );
        `,
      );
    };

    material.customProgramCacheKey = () => "yeti-hard-band-v4";
    return material;
  }, [baseColorUniforms, bodyMesh.material, bodyTintColor, shouldUseProceduralShell]);

  useEffect(() => {
    return () => {
      baseBandMaterial.dispose();
    };
  }, [baseBandMaterial]);

  const proceduralHandleMaterial = useMemo(() => {
    if (!proceduralShell?.handleGeometry) return null;
    return new THREE.MeshStandardMaterial({
      color: bodyTintColor,
      metalness: 0.26,
      roughness: 0.62,
    });
  }, [bodyTintColor, proceduralShell?.handleGeometry]);

  useEffect(() => {
    return () => {
      proceduralHandleMaterial?.dispose();
    };
  }, [proceduralHandleMaterial]);

  return (
    <group
      ref={groupRef}
      rotation={[0, visualFrontRotation, 0]}
      scale={[renderScaleFactorXz, renderScaleFactorY, renderScaleFactorXz]}
    >
      <mesh
        geometry={renderGeometry}
        castShadow
        receiveShadow
        material={baseBandMaterial}
      />

      {overlayUniforms && (
        <mesh geometry={renderGeometry} renderOrder={2}>
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

      {proceduralShell?.handleGeometry && proceduralHandleMaterial && (
        <mesh
          geometry={proceduralShell.handleGeometry}
          castShadow
          receiveShadow
          material={proceduralHandleMaterial}
        />
      )}
    </group>
  );
}

useGLTF.preload(DEFAULT_GLB_PATH);
