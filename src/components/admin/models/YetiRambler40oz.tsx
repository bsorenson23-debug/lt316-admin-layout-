import * as THREE from "three";
import { useRef, useMemo, useEffect } from "react";
import { Text, useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";
import type { TumblerMapping } from "@/types/productTemplate";
import { normalizeGeometry } from "@/lib/modelAxisCorrection";
import { analyzeTumblerMesh } from "@/lib/analyzeTumblerMesh";
import { getTumblerWrapLayout } from "@/utils/tumblerWrapLayout";
import type {
  BrandLogoReference,
  FinishBandReference,
  ProductAppearanceReferenceLayer,
} from "@/lib/productAppearanceReferenceLayers";

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
  overallHeightMm: number;
  printHeightMm: number;
  printableTopOffsetMm: number;
  wrapWidthMm: number;
  handleArcDeg: number;
  glbPath?: string;
  tumblerMapping?: TumblerMapping;
  bodyTintColor?: string;
  rimTintColor?: string;
  appearanceReferenceLayers?: ProductAppearanceReferenceLayer[] | null;
  showTemplateSurfaceZones?: boolean;
  bodyTopOffsetMm?: number;
  bodyHeightMm?: number;
  lidSeamFromOverallMm?: number;
  silverBandBottomFromOverallMm?: number;
  onReady?: (obj: THREE.Object3D) => void;
}

const DEFAULT_GLB_PATH = "/models/templates/yeti-40oz-body.glb";
const WRAP_TEXTURE_PX_PER_MM = 4;
const BODY_RADIUS_TOLERANCE_WITH_HANDLE = 1.14;
const BODY_RADIUS_TOLERANCE_DEFAULT = 1.03;

const CYL_OVERLAY_VERTEX_SHADER = `
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CYL_OVERLAY_FRAGMENT_SHADER = `
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

function buildWrapTexture(
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
    if (
      !item.canvas ||
      item.canvas.width <= 0 ||
      item.canvas.height <= 0 ||
      item.gridW <= 0 ||
      item.gridH <= 0
    ) {
      return;
    }

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function findVisibleSilverBandLayer(
  layers: readonly ProductAppearanceReferenceLayer[] | null | undefined,
): FinishBandReference | null {
  return (
    layers?.find(
      (layer): layer is FinishBandReference =>
        layer.kind === "top-finish-band" &&
        layer.visibility === "visible" &&
        isFiniteNumber(layer.yMm) &&
        isFiniteNumber(layer.heightMm),
    ) ?? null
  );
}

function findVisibleFrontLogoLayer(
  layers: readonly ProductAppearanceReferenceLayer[] | null | undefined,
): BrandLogoReference | null {
  return (
    layers?.find(
      (layer): layer is BrandLogoReference =>
        layer.kind === "front-brand-logo" &&
        layer.visibility === "visible",
    ) ?? null
  );
}

export function YetiRambler40oz({
  placedItems,
  diameterMm,
  topDiameterMm,
  overallHeightMm,
  printHeightMm,
  printableTopOffsetMm,
  wrapWidthMm,
  handleArcDeg: _handleArcDeg,
  glbPath = DEFAULT_GLB_PATH,
  tumblerMapping,
  bodyTintColor = "#1f2322",
  rimTintColor = "#cfd2d0",
  appearanceReferenceLayers = null,
  showTemplateSurfaceZones = false,
  bodyTopOffsetMm,
  bodyHeightMm,
  lidSeamFromOverallMm,
  silverBandBottomFromOverallMm,
  onReady,
}: Props) {
  const effectiveHandleArcDeg = tumblerMapping?.handleArcDeg ?? _handleArcDeg ?? 0;
  const wrapLayout = useMemo(
    () => getTumblerWrapLayout(effectiveHandleArcDeg),
    [effectiveHandleArcDeg],
  );

  const { nodes } = useGLTF(glbPath) as unknown as GLTFResult;
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

  const radiusMm = computedWrapWidthMm / (2 * Math.PI);
  const maxCalX = computedWrapWidthMm * 0.12;
  const maxCalY = printHeightMm * 0.2;
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
  }, [onReady, rimCenteredGeo, scaleFactorXz, scaleFactorY]);

  const overlayUniforms = useMemo(() => {
    if (!wrapTexture) return null;
    return {
      uWrapMap: { value: wrapTexture },
      uPrintHeightMm: { value: Math.max(1, printHeightMm) },
      uPrintTopOffsetMm: { value: Math.max(0, printableTopOffsetMm) },
      uScaleFactorY: { value: scaleFactorY > 0 ? scaleFactorY : scaleFactorXz || 1 },
      uRimTopLocalY: { value: rimAnalysis.topY },
      uFrontRotation: { value: frontRotation },
      uBodyRadiusLocal: { value: Math.max(0.0001, bodyRadiusLocal) },
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
    scaleFactorY,
    scaleFactorXz,
    rimAnalysis.topY,
    frontRotation,
    bodyRadiusLocal,
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
    uBodyRadiusLocal: { value: Math.max(0.0001, bodyRadiusLocal) },
    uBodyRadiusTolerance: { value: bodyRadiusTolerance },
    uScaleFactorY: { value: scaleFactorY > 0 ? scaleFactorY : scaleFactorXz || 1 },
    uRimTopLocalY: { value: rimAnalysis.topY },
  }), [
    bodyTintColor,
    rimTintColor,
    printableTopOffsetMm,
    printHeightMm,
    bodyRadiusLocal,
    bodyRadiusTolerance,
    scaleFactorY,
    scaleFactorXz,
    rimAnalysis.topY,
  ]);

  const baseBandMaterial = useMemo(() => {
    const material = resolveBaseMaterial(bodyMesh.material);

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
  }, [baseColorUniforms, bodyMesh.material]);

  useEffect(() => {
    return () => {
      baseBandMaterial.dispose();
    };
  }, [baseBandMaterial]);

  const upstreamSilverBandLayer = useMemo(
    () => findVisibleSilverBandLayer(appearanceReferenceLayers),
    [appearanceReferenceLayers],
  );
  const upstreamFrontLogoLayer = useMemo(
    () => findVisibleFrontLogoLayer(appearanceReferenceLayers),
    [appearanceReferenceLayers],
  );

  const overlayZoneConfig = useMemo(() => {
    if (!showTemplateSurfaceZones || overallHeightMm <= 0) return null;

    const fallbackBodyTop = Math.max(0, printableTopOffsetMm);
    const fallbackBodyHeight = Math.max(1, printHeightMm);
    const fallbackLidSeam = Math.max(2, Math.min(fallbackBodyTop * 0.35, 16));
    const fallbackSilverBandBottom = Math.max(
      fallbackLidSeam + 1,
      Math.min(fallbackBodyTop, overallHeightMm),
    );
    const upstreamSilverBandTop = upstreamSilverBandLayer?.yMm;
    const upstreamSilverBandBottom =
      isFiniteNumber(upstreamSilverBandLayer?.yMm) &&
      isFiniteNumber(upstreamSilverBandLayer?.heightMm)
        ? upstreamSilverBandLayer.yMm + upstreamSilverBandLayer.heightMm
        : null;

    const resolvedLidSeam = THREE.MathUtils.clamp(
      upstreamSilverBandTop ?? lidSeamFromOverallMm ?? fallbackLidSeam,
      0,
      overallHeightMm - 1,
    );
    const resolvedSilverBandBottom = THREE.MathUtils.clamp(
      upstreamSilverBandBottom ?? silverBandBottomFromOverallMm ?? fallbackSilverBandBottom,
      resolvedLidSeam + 0.8,
      overallHeightMm,
    );
    const resolvedBodyTop = THREE.MathUtils.clamp(
      bodyTopOffsetMm ?? resolvedSilverBandBottom ?? fallbackBodyTop,
      resolvedSilverBandBottom,
      overallHeightMm,
    );
    const resolvedBodyBottom = THREE.MathUtils.clamp(
      resolvedBodyTop + (bodyHeightMm ?? fallbackBodyHeight),
      resolvedBodyTop + 1,
      overallHeightMm,
    );

    const mmToLocalY = (mmFromTop: number) =>
      rimAnalysis.topY - (mmFromTop / (scaleFactorY > 0 ? scaleFactorY : 1));
    const expandedRadius = bodyRadiusLocal + 0.32;
    const bodyCenterY = (mmToLocalY(resolvedBodyTop) + mmToLocalY(resolvedBodyBottom)) / 2;
    const bodyHeightLocal = (resolvedBodyBottom - resolvedBodyTop) / (scaleFactorY > 0 ? scaleFactorY : 1);
    const silverCenterY = (mmToLocalY(resolvedLidSeam) + mmToLocalY(resolvedSilverBandBottom)) / 2;
    const silverHeightLocal =
      (resolvedSilverBandBottom - resolvedLidSeam) / (scaleFactorY > 0 ? scaleFactorY : 1);

    return {
      expandedRadius,
      bodyCenterY,
      bodyHeightLocal,
      silverCenterY,
      silverHeightLocal,
    };
  }, [
    showTemplateSurfaceZones,
    overallHeightMm,
    printableTopOffsetMm,
    printHeightMm,
    upstreamSilverBandLayer,
    bodyTopOffsetMm,
    bodyHeightMm,
    lidSeamFromOverallMm,
    silverBandBottomFromOverallMm,
    rimAnalysis.topY,
    scaleFactorY,
    bodyRadiusLocal,
  ]);

  const frontLogoConfig = useMemo(() => {
    if (!upstreamFrontLogoLayer || overallHeightMm <= 0) return null;
    const safeScaleY = scaleFactorY > 0 ? scaleFactorY : 1;
    const safeScaleXz = scaleFactorXz > 0 ? scaleFactorXz : 1;
    const centerYMm = THREE.MathUtils.clamp(
      isFiniteNumber(upstreamFrontLogoLayer.centerYMm)
        ? upstreamFrontLogoLayer.centerYMm
        : printableTopOffsetMm + printHeightMm * 0.28,
      0,
      overallHeightMm,
    );
    const widthMm = THREE.MathUtils.clamp(
      isFiniteNumber(upstreamFrontLogoLayer.widthMm)
        ? upstreamFrontLogoLayer.widthMm
        : 32,
      8,
      Math.max(8, computedWrapWidthMm * 0.22),
    );
    const heightMm = THREE.MathUtils.clamp(
      isFiniteNumber(upstreamFrontLogoLayer.heightMm)
        ? upstreamFrontLogoLayer.heightMm
        : 12,
      4,
      Math.max(4, printHeightMm * 0.18),
    );
    const angleRad = frontRotation + THREE.MathUtils.degToRad(upstreamFrontLogoLayer.angleDeg ?? 0);
    const radiusLocal = bodyRadiusLocal + 0.42;
    const widthLocal = widthMm / safeScaleXz;
    const heightLocal = heightMm / safeScaleY;

    return {
      label: upstreamFrontLogoLayer.label,
      position: [
        Math.sin(angleRad) * radiusLocal,
        rimAnalysis.topY - centerYMm / safeScaleY,
        Math.cos(angleRad) * radiusLocal,
      ] as [number, number, number],
      rotationY: angleRad,
      widthLocal,
      heightLocal,
      fontSizeLocal: Math.max(1.6, Math.min(heightLocal * 0.46, widthLocal * 0.16)),
    };
  }, [
    bodyRadiusLocal,
    computedWrapWidthMm,
    frontRotation,
    overallHeightMm,
    printHeightMm,
    printableTopOffsetMm,
    rimAnalysis.topY,
    scaleFactorXz,
    scaleFactorY,
    upstreamFrontLogoLayer,
  ]);

  return (
    <group ref={groupRef} scale={[scaleFactorXz, scaleFactorY, scaleFactorXz]}>
      <mesh
        geometry={rimCenteredGeo}
        castShadow
        receiveShadow
        material={baseBandMaterial}
      />

      {overlayUniforms && (
        <mesh
          geometry={rimCenteredGeo}
          renderOrder={2}
          name="engraving_overlay_preview"
          userData={{ bodyContractIgnore: true, engravingOverlayPreview: true }}
        >
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

      {overlayZoneConfig && (
        <group renderOrder={4}>
          <mesh
            position={[0, overlayZoneConfig.bodyCenterY, 0]}
            renderOrder={4}
          >
            <cylinderGeometry
              args={[
                overlayZoneConfig.expandedRadius,
                overlayZoneConfig.expandedRadius,
                overlayZoneConfig.bodyHeightLocal,
                96,
                1,
                true,
              ]}
            />
            <meshBasicMaterial
              color="#3cbf67"
              transparent
              opacity={0.32}
              side={THREE.DoubleSide}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-5}
            />
          </mesh>
          <mesh
            position={[0, overlayZoneConfig.silverCenterY, 0]}
            renderOrder={5}
          >
            <cylinderGeometry
              args={[
                overlayZoneConfig.expandedRadius + 0.08,
                overlayZoneConfig.expandedRadius + 0.08,
                overlayZoneConfig.silverHeightLocal,
                96,
                1,
                true,
              ]}
            />
            <meshBasicMaterial
              color="#d7dde6"
              transparent
              opacity={0.34}
              side={THREE.DoubleSide}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-6}
            />
          </mesh>
        </group>
      )}

      {frontLogoConfig && (
        <group
          position={frontLogoConfig.position}
          rotation={[0, frontLogoConfig.rotationY, 0]}
          renderOrder={6}
          name="manufacturer_logo_reference"
          userData={{
            bodyContractIgnore: true,
            appearanceReferenceLayer: true,
            referenceOnly: true,
          }}
        >
          <mesh renderOrder={6}>
            <planeGeometry args={[frontLogoConfig.widthLocal, frontLogoConfig.heightLocal]} />
            <meshBasicMaterial
              color={rimTintColor}
              transparent
              opacity={0.9}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-7}
            />
          </mesh>
          <Text
            position={[0, 0, 0.03]}
            renderOrder={7}
            fontSize={frontLogoConfig.fontSizeLocal}
            color={bodyTintColor}
            anchorX="center"
            anchorY="middle"
            maxWidth={frontLogoConfig.widthLocal * 0.86}
            textAlign="center"
            userData={{
              bodyContractIgnore: true,
              appearanceReferenceLayer: true,
              referenceOnly: true,
            }}
          >
            {frontLogoConfig.label}
          </Text>
        </group>
      )}
    </group>
  );
}

useGLTF.preload(DEFAULT_GLB_PATH);
