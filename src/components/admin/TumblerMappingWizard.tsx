"use client";

import React, { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import type { GLTF } from "three-stdlib";
import type { TumblerMapping } from "@/types/productTemplate";
import { detectAxisCorrection } from "@/lib/modelAxisCorrection";
import { analyzeTumblerMesh } from "@/lib/analyzeTumblerMesh";
import { ModalDialog } from "./shared/ModalDialog";
import styles from "./TumblerMappingWizard.module.css";

// ─── Types ──────────────────────────────────────────────────────────────────

type GLTFResult = GLTF & {
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, never>;
};

interface Props {
  glbPath: string;
  diameterMm: number;
  printHeightMm: number;
  productType: "tumbler" | "mug" | "bottle" | "flat";
  existingMapping?: TumblerMapping;
  handleArcDeg: number;
  onSave: (mapping: TumblerMapping) => void;
  onCancel: () => void;
}

type WizardStep = 1 | 2 | 3;

/** Camera shared across all steps: eye-level, pulled back enough to see full tumbler */
const WIZARD_CAMERA = { position: [0, 0, 600] as [number, number, number], fov: 30 };

// ─── Snap points for handle width slider ────────────────────────────────────

const HANDLE_SNAP_POINTS = [
  { value: 0, label: "None" },
  { value: 45, label: "Small" },
  { value: 90, label: "Standard" },
  { value: 120, label: "Wide" },
] as const;

const SNAP_THRESHOLD = 5; // degrees

function snapHandleValue(raw: number): number {
  for (const pt of HANDLE_SNAP_POINTS) {
    if (Math.abs(raw - pt.value) <= SNAP_THRESHOLD) return pt.value;
  }
  return raw;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveBodyMesh(nodes: Record<string, THREE.Object3D>): THREE.Mesh {
  const candidate =
    nodes.body_mesh ??
    nodes["(Unsaved)"] ??
    Object.values(nodes).find(
      (n): n is THREE.Mesh => (n as THREE.Mesh).isMesh === true,
    );
  if (!candidate || !(candidate as THREE.Mesh).isMesh) {
    throw new Error(
      "[TumblerMappingWizard] No mesh found in GLB. Node names: " +
        Object.keys(nodes).join(", "),
    );
  }
  return candidate as THREE.Mesh;
}

function resolveNamedMesh(
  nodes: Record<string, THREE.Object3D>,
  name: string,
): THREE.Mesh | null {
  const candidate = nodes[name];
  return candidate && (candidate as THREE.Mesh).isMesh ? (candidate as THREE.Mesh) : null;
}

function applyAxisRotation(
  geometry: THREE.BufferGeometry,
  rotation: [number, number, number],
) {
  const [rx, ry, rz] = rotation;
  if (rx !== 0) geometry.rotateX(rx);
  if (ry !== 0) geometry.rotateY(ry);
  if (rz !== 0) geometry.rotateZ(rz);
}

function cloneAdjustedMaterial(
  material: THREE.Material | THREE.Material[] | null,
  overrides?: Partial<THREE.MeshStandardMaterialParameters>,
): THREE.Material | THREE.Material[] {
  const fix = (base: THREE.Material) => {
    const cloned = base.clone();
    if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
      cloned.metalness = overrides?.metalness ?? Math.min(cloned.metalness, 0.45);
      cloned.roughness = overrides?.roughness ?? Math.max(cloned.roughness, 0.55);
      if (overrides?.color) cloned.color = new THREE.Color(overrides.color);
      cloned.needsUpdate = true;
    }
    return cloned;
  };

  if (Array.isArray(material)) {
    return material.map(fix);
  }
  return fix(material ?? new THREE.MeshStandardMaterial({ color: "#8a8f92" }));
}

/** Sets camera position imperatively — works inside R3F Canvas */
function SetCameraPosition({ position }: { position: [number, number, number] }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, position, invalidate]);
  return null;
}

/** Standard lighting rig for all wizard scenes */
function WizardLights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[200, 200, 200]} intensity={0.6} />
      <directionalLight position={[-200, -100, -200]} intensity={0.3} />
      <directionalLight position={[0, -200, 0]} intensity={0.2} />
    </>
  );
}

/**
 * Shared hook: load GLB, resolve body mesh, analyze rim for true cylinder
 * center/radius, and scale to physical mm using the template's diameterMm.
 *
 * After this hook:
 *   - <group scale={scaleFactor}> makes 1 visual unit = 1 mm in the scene
 *   - Inside that group, everything is in MODEL UNITS (cm-scale for this GLB)
 *   - modelRadius / modelBodyHeight are in model units (for overlays & decals)
 *   - The cylinder axis sits at the origin (rim-centered)
 */
function useWizardModel(glbPath: string, diameterMm: number) {
  const { nodes, scene } = useGLTF(glbPath) as unknown as GLTFResult;
  const bodyMesh = useMemo(() => resolveBodyMesh(nodes), [nodes]);
  const rimMesh = useMemo(() => resolveNamedMesh(nodes, "rim_mesh"), [nodes]);

  const transformed = useMemo(() => {
    scene.updateMatrixWorld(true);

    const bodyGeometry = bodyMesh.geometry.clone();
    bodyGeometry.applyMatrix4(bodyMesh.matrixWorld);
    bodyGeometry.computeBoundingBox();

    const box = bodyGeometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const rotation = detectAxisCorrection(size.x, size.y, size.z);
    applyAxisRotation(bodyGeometry, rotation);
    bodyGeometry.computeBoundingBox();
    bodyGeometry.computeVertexNormals();

    const rimAnalysis = analyzeTumblerMesh(bodyGeometry);

    const centeredBody = bodyGeometry.clone();
    centeredBody.translate(-rimAnalysis.center.x, 0, -rimAnalysis.center.z);
    centeredBody.computeBoundingBox();
    centeredBody.computeVertexNormals();

    let centeredRim: THREE.BufferGeometry | null = null;
    if (rimMesh) {
      centeredRim = rimMesh.geometry.clone();
      centeredRim.applyMatrix4(rimMesh.matrixWorld);
      applyAxisRotation(centeredRim, rotation);
      centeredRim.translate(-rimAnalysis.center.x, 0, -rimAnalysis.center.z);
      centeredRim.computeBoundingBox();
      centeredRim.computeVertexNormals();
    }

    return {
      rimAnalysis,
      bodyGeometry: centeredBody,
      rimGeometry: centeredRim,
    };
  }, [scene, bodyMesh, rimMesh]);

  const scaleFactor = useMemo(() => {
    const rimDiameter = transformed.rimAnalysis.radius * 2;
    if (rimDiameter <= 0) return 1;
    return diameterMm / rimDiameter;
  }, [transformed.rimAnalysis.radius, diameterMm]);

  const bodyMaterial = useMemo(
    () => cloneAdjustedMaterial(bodyMesh.material, { metalness: 0.25, roughness: 0.65 }),
    [bodyMesh.material],
  );
  const rimMaterial = useMemo(
    () => (rimMesh ? cloneAdjustedMaterial(rimMesh.material, { metalness: 0.75, roughness: 0.35 }) : undefined),
    [rimMesh],
  );

  const { modelCenterY, geoTopY, geoBottomY } = useMemo(() => {
    const bb = transformed.bodyGeometry.boundingBox!;
    return {
      modelCenterY: (bb.max.y + bb.min.y) / 2,
      geoTopY: bb.max.y,
      geoBottomY: bb.min.y,
    };
  }, [transformed.bodyGeometry]);

  return {
    bodyGeometry: transformed.bodyGeometry,
    rimGeometry: transformed.rimGeometry,
    bodyMaterial,
    rimMaterial,
    scaleFactor,
    modelRadius: transformed.rimAnalysis.radius,
    modelBodyHeight: transformed.rimAnalysis.bodyHeight,
    modelCenterY,
    geoTopY,
    geoBottomY,
  };
}

// ─── 3D Scene (Step 1: interactive orbit) ───────────────────────────────────

function TumblerScene({
  glbPath,
  diameterMm,
  onControlsRef,
}: {
  glbPath: string;
  diameterMm: number;
  onControlsRef: (ref: React.RefObject<typeof OrbitControls | null>) => void;
}) {
  const { bodyGeometry, rimGeometry, bodyMaterial, rimMaterial, scaleFactor } = useWizardModel(glbPath, diameterMm);
  const controlsRef = useRef<typeof OrbitControls>(null);

  useEffect(() => {
    onControlsRef(controlsRef as React.RefObject<typeof OrbitControls | null>);
  }, [onControlsRef]);

  return (
    <>
      <WizardLights />

      <group scale={scaleFactor}>
        <mesh
          geometry={bodyGeometry}
          material={bodyMaterial}
          castShadow
          receiveShadow
        />
        {rimGeometry && (
          <mesh geometry={rimGeometry} material={rimMaterial} castShadow receiveShadow />
        )}
      </group>

      <OrbitControls
        ref={controlsRef as React.RefObject<never>}
        target={[0, 0, 0]}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
      />
    </>
  );
}

// ─── Handle Zone Scene (Step 2) ─────────────────────────────────────────────

function HandleVerifyScene({
  glbPath,
  diameterMm,
  frontFaceRotation,
  handleArcDeg,
}: {
  glbPath: string;
  diameterMm: number;
  frontFaceRotation: number;
  handleArcDeg: number;
}) {
  const { bodyGeometry, rimGeometry, bodyMaterial, rimMaterial, scaleFactor, modelRadius, modelBodyHeight, modelCenterY } =
    useWizardModel(glbPath, diameterMm);

  // Overlay in MODEL UNITS — lives inside the scale group with the mesh
  const handleZoneMesh = useMemo(() => {
    if (handleArcDeg <= 0) return null;
    const handleAngle = (handleArcDeg * Math.PI) / 180;
    const r = modelRadius + 0.03; // slightly proud of surface, in model units
    const startAngle = frontFaceRotation + Math.PI - handleAngle / 2;
    return new THREE.CylinderGeometry(r, r, modelBodyHeight, 64, 1, true, startAngle, handleAngle);
  }, [handleArcDeg, modelBodyHeight, modelRadius, frontFaceRotation]);

  const backAngle = frontFaceRotation + Math.PI;
  const camDist = 600;
  const camX = Math.sin(backAngle) * camDist;
  const camZ = Math.cos(backAngle) * camDist;

  return (
    <>
      <WizardLights />

      <group scale={scaleFactor}>
        <mesh
          geometry={bodyGeometry}
          material={bodyMaterial}
          castShadow
          receiveShadow
        />
        {rimGeometry && (
          <mesh geometry={rimGeometry} material={rimMaterial} castShadow receiveShadow />
        )}

        {/* Overlay at geometry center Y — model units */}
        {handleZoneMesh && (
          <mesh geometry={handleZoneMesh} position={[0, modelCenterY, 0]}>
            <meshBasicMaterial
              color="#e24b4a"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>

      <OrbitControls
        target={[0, 0, 0]}
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
      />

      <SetCameraPosition position={[camX, 50, camZ]} />
    </>
  );
}

// ─── Blueprint Dimension Annotations ─────────────────────────────────────────

/** Straight dimension line with arrow heads and a label */
function DimensionLine({
  start,
  end,
  label,
  color = "#00bbff",
  labelOffset = [0, 0.8, 0] as [number, number, number],
}: {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  color?: string;
  labelOffset?: [number, number, number];
}) {
  const lineObj = useMemo(() => {
    const pts = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
  }, [start, end, color]);

  const mid: [number, number, number] = [
    (start[0] + end[0]) / 2 + labelOffset[0],
    (start[1] + end[1]) / 2 + labelOffset[1],
    (start[2] + end[2]) / 2 + labelOffset[2],
  ];

  // Arrow heads — small cones at each end
  const dir = useMemo(() => {
    const d = new THREE.Vector3(...end).sub(new THREE.Vector3(...start)).normalize();
    return d;
  }, [start, end]);
  const arrowLen = 0.4;
  const startArrowPos: [number, number, number] = [
    start[0] + dir.x * arrowLen / 2,
    start[1] + dir.y * arrowLen / 2,
    start[2] + dir.z * arrowLen / 2,
  ];
  const endArrowPos: [number, number, number] = [
    end[0] - dir.x * arrowLen / 2,
    end[1] - dir.y * arrowLen / 2,
    end[2] - dir.z * arrowLen / 2,
  ];
  // Quaternion to point cone along the direction
  const startQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    return q;
  }, [dir]);
  const endQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return q;
  }, [dir]);

  return (
    <group>
      <primitive object={lineObj} />
      {/* Arrow head at start */}
      <mesh position={startArrowPos} quaternion={startQuat}>
        <coneGeometry args={[0.15, arrowLen, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Arrow head at end */}
      <mesh position={endArrowPos} quaternion={endQuat}>
        <coneGeometry args={[0.15, arrowLen, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Label */}
      <Html position={mid} style={{
        color, fontSize: 11, fontFamily: "monospace",
        whiteSpace: "nowrap", pointerEvents: "none",
        textShadow: "0 0 4px rgba(0,0,0,0.9)",
        fontWeight: "bold",
      }}>
        {label}
      </Html>
    </group>
  );
}

/** Arc annotation drawn as a polyline around the cylinder top */
function ArcAnnotation({
  radius,
  y,
  thetaStart,
  thetaLength,
  label,
  color,
}: {
  radius: number;
  y: number;
  thetaStart: number;
  thetaLength: number;
  label: string;
  color: string;
}) {
  const lineObj = useMemo(() => {
    const segments = 48;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = thetaStart + (i / segments) * thetaLength;
      pts.push(new THREE.Vector3(Math.sin(t) * radius, y, Math.cos(t) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
  }, [radius, y, thetaStart, thetaLength, color]);

  // Label at the arc midpoint
  const midAngle = thetaStart + thetaLength / 2;
  const labelR = radius + 0.6;
  const labelPos: [number, number, number] = [
    Math.sin(midAngle) * labelR,
    y + 0.6,
    Math.cos(midAngle) * labelR,
  ];

  return (
    <group>
      <primitive object={lineObj} />
      <Html position={labelPos} style={{
        color, fontSize: 10, fontFamily: "monospace",
        whiteSpace: "nowrap", pointerEvents: "none",
        textShadow: "0 0 4px rgba(0,0,0,0.9)",
        fontWeight: "bold",
      }}>
        {label}
      </Html>
    </group>
  );
}

// ─── Printable Area Scene (Step 3) ──────────────────────────────────────────

function PrintableAreaScene({
  glbPath,
  diameterMm,
  frontFaceRotation,
  handleArcDeg,
}: {
  glbPath: string;
  diameterMm: number;
  frontFaceRotation: number;
  handleArcDeg: number;
}) {
  const { bodyGeometry, rimGeometry, bodyMaterial, rimMaterial, scaleFactor, modelRadius, modelBodyHeight, modelCenterY, geoTopY, geoBottomY } =
    useWizardModel(glbPath, diameterMm);

  // All overlay geometry in MODEL UNITS — inside the scale group
  const r = modelRadius + 0.03; // slightly proud of surface
  const handleAngleRad = (handleArcDeg * Math.PI) / 180;
  const printAngleRad = Math.PI * 2 - handleAngleRad;
  const greenStart = frontFaceRotation - printAngleRad / 2;
  const redStart = frontFaceRotation + Math.PI - handleAngleRad / 2;

  const printableZoneMesh = useMemo(() => {
    return new THREE.CylinderGeometry(r, r, modelBodyHeight, 64, 1, true, greenStart, printAngleRad);
  }, [r, modelBodyHeight, greenStart, printAngleRad]);

  const handleZoneMesh = useMemo(() => {
    if (handleArcDeg <= 0) return null;
    return new THREE.CylinderGeometry(r, r, modelBodyHeight, 64, 1, true, redStart, handleAngleRad);
  }, [handleArcDeg, r, modelBodyHeight, redStart, handleAngleRad]);

  // Blueprint annotation positions — from actual geometry bbox (robust to centering offsets)
  const topY = geoTopY;
  const bottomY = geoBottomY;
  const bodyHeightMm = Math.round(modelBodyHeight * scaleFactor);
  const printableArcDeg = 360 - handleArcDeg;
  const printableWidthMm = Math.round((printableArcDeg / 360) * Math.PI * diameterMm);
  const arcAnnotationR = modelRadius + 0.15;
  const arcAnnotationY = topY + 0.8;

  return (
    <>
      <WizardLights />

      <group scale={scaleFactor}>
        <mesh
          geometry={bodyGeometry}
          material={bodyMaterial}
          castShadow
          receiveShadow
        />
        {rimGeometry && (
          <mesh geometry={rimGeometry} material={rimMaterial} castShadow receiveShadow />
        )}

        {/* Overlays at geometry center Y — model units */}
        <mesh geometry={printableZoneMesh} position={[0, modelCenterY, 0]}>
          <meshBasicMaterial
            color={0x1d9e75}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {handleZoneMesh && (
          <mesh geometry={handleZoneMesh} position={[0, modelCenterY, 0]}>
            <meshBasicMaterial
              color={0xe24b4a}
              transparent
              opacity={0.25}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* Blueprint dimension annotations — model units, mm labels */}

        {/* A) Diameter — horizontal line across top rim */}
        <DimensionLine
          start={[-modelRadius, topY + 1.2, 0]}
          end={[modelRadius, topY + 1.2, 0]}
          label={`\u00f8${diameterMm}mm`}
          color="#00bbff"
        />

        {/* B) Body height — vertical line along the left side */}
        <DimensionLine
          start={[-modelRadius - 1.5, topY, 0]}
          end={[-modelRadius - 1.5, bottomY, 0]}
          label={`${bodyHeightMm}mm`}
          color="#00bbff"
          labelOffset={[-1.2, 0, 0]}
        />

        {/* C) Printable arc — green arc at the top */}
        <ArcAnnotation
          radius={arcAnnotationR}
          y={arcAnnotationY}
          thetaStart={greenStart}
          thetaLength={printAngleRad}
          label={`${printableArcDeg}\u00b0 (${printableWidthMm}mm)`}
          color="#1d9e75"
        />

        {/* D) Handle zone arc — red arc at the top */}
        {handleArcDeg > 0 && (
          <ArcAnnotation
            radius={arcAnnotationR}
            y={arcAnnotationY}
            thetaStart={redStart}
            thetaLength={handleAngleRad}
            label={`${handleArcDeg}\u00b0`}
            color="#e24b4a"
          />
        )}
      </group>

      <OrbitControls
        target={[0, 0, 0]}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
      />
    </>
  );
}

// ─── Main Wizard ────────────────────────────────────────────────────────────

export function TumblerMappingWizard(props: Props) {
  const {
    glbPath,
    diameterMm,
    printHeightMm,
    existingMapping,
    handleArcDeg: initialHandleArcDeg,
    onSave,
    onCancel,
  } = props;
  const [step, setStep] = useState<WizardStep>(1);
  const [frontFaceRotation, setFrontFaceRotation] = useState(
    existingMapping?.frontFaceRotation ?? 0,
  );
  const [handleArcDeg, setHandleArcDeg] = useState<number>(() => {
    if (existingMapping?.handleArcDeg != null) {
      return existingMapping.handleArcDeg;
    }
    if (initialHandleArcDeg >= 0) return initialHandleArcDeg;
    return 0;
  });
  const [topMargin, setTopMargin] = useState(existingMapping?.printableTopY ?? 0);
  const [bottomMargin, setBottomMargin] = useState(existingMapping?.printableBottomY ?? 0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const controlsRefHolder = useRef<React.RefObject<typeof OrbitControls | null> | null>(null);
  const hasHandleStep = (existingMapping?.handleArcDeg ?? initialHandleArcDeg ?? 0) > 0;
  const stepLabels = useMemo(
    () =>
      hasHandleStep
        ? [
            { step: 1 as WizardStep, label: "Set front" },
            { step: 2 as WizardStep, label: "Verify handle" },
            { step: 3 as WizardStep, label: "Confirm" },
          ]
        : [
            { step: 1 as WizardStep, label: "Set front" },
            { step: 3 as WizardStep, label: "Confirm" },
          ],
    [hasHandleStep],
  );

  const handleControlsRef = useCallback(
    (ref: React.RefObject<typeof OrbitControls | null>) => {
      controlsRefHolder.current = ref;
    },
    [],
  );

  // Computed values
  const printableArc = 360 - handleArcDeg;
  const printableWidthMm = diameterMm > 0
    ? Math.round(Math.PI * diameterMm * (printableArc / 360) * 100) / 100
    : 0;

  // ── Step 1: Set front face ──
  const handleSetFront = useCallback(() => {
    const controls = controlsRefHolder.current?.current;
    if (controls) {
      const azimuthal = (controls as unknown as { getAzimuthalAngle(): number }).getAzimuthalAngle();
      // Camera is at angle A; the model face it's looking at is A + PI
      setFrontFaceRotation(azimuthal + Math.PI);
    }
    setShowConfirmation(true);
    setTimeout(() => {
      setShowConfirmation(false);
      setStep(hasHandleStep ? 2 : 3);
    }, 1200);
  }, [hasHandleStep]);

  // ── Step 2: Confirm handle ──
  const handleConfirmHandle = useCallback(() => {
    setStep(3);
  }, []);

  // ── Handle slider with snapping ──
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHandleArcDeg(snapHandleValue(Number(e.target.value)));
  }, []);

  // ── Step 3: Save ──
  const handleSaveMapping = useCallback(() => {
    const mapping: TumblerMapping = {
      frontFaceRotation,
      handleCenterAngle: frontFaceRotation + Math.PI,
      handleArcDeg,
      isMapped: true,
      printableTopY: topMargin > 0 ? topMargin : undefined,
      printableBottomY: bottomMargin > 0 ? bottomMargin : undefined,
    };
    setShowSaveToast(true);
    setTimeout(() => {
      onSave(mapping);
    }, 800);
  }, [frontFaceRotation, handleArcDeg, topMargin, bottomMargin, onSave]);

  return (
    <ModalDialog
      open
      title="Tumbler Mapping"
      onClose={onCancel}
      size="fullscreen"
      footer={(
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onCancel}
        >
          Cancel
        </button>
      )}
    >
        {/* ── Step pills ── */}
        <div className={styles.stepRow}>
          {stepLabels.map(({ step: stepNum, label }) => {
            const isDone = step > stepNum;
            const isCurrent = step === stepNum;
            return (
              <div
                key={label}
                className={
                  `${styles.stepPill}` +
                  `${isCurrent ? ` ${styles.stepPillCurrent}` : ""}` +
                  `${isDone ? ` ${styles.stepPillDone}` : ""}`
                }
              >
                <span className={styles.stepNum}>{isDone ? "\u2713" : stepNum}</span>
                <span className={styles.stepLabel}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* ── Content ── */}
        <div className={styles.body}>
          {/* ── 3D View ── */}
          <div className={styles.viewer}>
            <Canvas
              frameloop="demand"
              camera={{ position: WIZARD_CAMERA.position, fov: WIZARD_CAMERA.fov }}
              gl={{ antialias: true, alpha: true }}
              style={{ background: "#0a0a12" }}
            >
              {step === 1 && (
                <TumblerScene
                  glbPath={glbPath}
                  diameterMm={diameterMm}
                  onControlsRef={handleControlsRef}
                />
              )}
              {step === 2 && (
                <HandleVerifyScene
                  glbPath={glbPath}
                  diameterMm={diameterMm}
                  frontFaceRotation={frontFaceRotation}
                  handleArcDeg={handleArcDeg}
                />
              )}
              {step === 3 && (
                <PrintableAreaScene
                  glbPath={glbPath}
                  diameterMm={diameterMm}
                  frontFaceRotation={frontFaceRotation}
                  handleArcDeg={handleArcDeg}
                />
              )}
            </Canvas>

            {showConfirmation && (
              <div className={styles.confirmToast}>Front face set &#x2713;</div>
            )}
            {showSaveToast && (
              <div className={styles.confirmToast}>Tumbler mapping saved &#x2713;</div>
            )}
          </div>

          {/* ── Instructions panel ── */}
          <div className={styles.instructions}>
            {step === 1 && (
              <>
                <h3 className={styles.stepTitle}>Rotate to show the FRONT face</h3>
                <p className={styles.stepDesc}>
                  Drag to rotate the tumbler until the <strong>front face</strong> is
                  pointing toward you. This is the side customers will see.
                </p>
                <p className={styles.stepHint}>
                  For tumblers with a handle, the front is the side opposite the handle.
                </p>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={handleSetFront}
                >
                  Set as Front Face
                </button>
              </>
            )}

            {hasHandleStep && step === 2 && (
              <>
                <h3 className={styles.stepTitle}>Verify the handle position</h3>
                <p className={styles.stepDesc}>
                  The view has rotated to show the <strong>back</strong> of the tumbler.
                  The handle should be visible on this side.
                </p>
                <div className={styles.sliderGroup}>
                  <label className={styles.sliderLabel}>
                    Handle width: <strong>{handleArcDeg}&deg;</strong>
                  </label>
                  <input
                    type="range"
                    className={styles.slider}
                    min={0}
                    max={180}
                    value={handleArcDeg}
                    onChange={handleSliderChange}
                  />
                  <div className={styles.snapTicks}>
                    {HANDLE_SNAP_POINTS.map((pt) => (
                      <button
                        key={pt.value}
                        type="button"
                        className={`${styles.snapTick} ${handleArcDeg === pt.value ? styles.snapTickActive : ""}`}
                        style={{ left: `${(pt.value / 180) * 100}%` }}
                        onClick={() => setHandleArcDeg(pt.value)}
                      >
                        <span className={styles.snapDot} />
                        <span className={styles.snapLabel}>{pt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {initialHandleArcDeg > 0 && (
                  <p className={styles.stepSource}>
                    Default from template: {initialHandleArcDeg}&deg;
                  </p>
                )}
                <p className={styles.stepHint}>
                  The red band shows the excluded handle zone where artwork won&apos;t be placed.
                </p>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={handleConfirmHandle}
                >
                  Looks correct
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setStep(1)}
                >
                  Go back and adjust
                </button>
              </>
            )}

            {step === 3 && (
              <>
                <h3 className={styles.stepTitle}>Confirm printable area</h3>

                <div className={styles.legend}>
                  <span className={styles.legendDot} style={{ background: "rgba(29,158,117,0.7)" }} />
                  <span className={styles.legendText}>Engravable area</span>
                </div>
                {handleArcDeg > 0 && (
                  <div className={styles.legend}>
                    <span className={styles.legendDot} style={{ background: "rgba(226,75,74,0.7)" }} />
                    <span className={styles.legendText}>Handle zone (excluded)</span>
                  </div>
                )}

                <div className={styles.summaryBlock}>
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Front face rotation</span>
                    <span className={styles.summaryValue}>
                      {((frontFaceRotation * 180) / Math.PI).toFixed(1)}&deg;
                    </span>
                  </div>
                  {hasHandleStep && (
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Handle width</span>
                      <span className={styles.summaryValue}>{handleArcDeg}&deg;</span>
                    </div>
                  )}
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Printable arc</span>
                    <span className={styles.summaryValue}>{printableArc}&deg;</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Printable width</span>
                    <span className={styles.summaryValue}>{printableWidthMm} mm</span>
                  </div>
                </div>

                <div className={styles.marginSection}>
                  <span className={styles.marginTitle}>Height margins (optional)</span>
                  <p className={styles.stepHint}>
                    Trim if the rim or taper can&apos;t be engraved. Most operators leave at 0.
                  </p>
                  <div className={styles.marginRow}>
                    <label className={styles.marginLabel}>Top margin</label>
                    <input
                      type="number"
                      className={styles.marginInput}
                      min={0}
                      max={printHeightMm / 2}
                      step={0.5}
                      value={topMargin}
                      onChange={(e) => setTopMargin(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <span className={styles.marginUnit}>mm</span>
                  </div>
                  <div className={styles.marginRow}>
                    <label className={styles.marginLabel}>Bottom margin</label>
                    <input
                      type="number"
                      className={styles.marginInput}
                      min={0}
                      max={printHeightMm / 2}
                      step={0.5}
                      value={bottomMargin}
                      onChange={(e) => setBottomMargin(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <span className={styles.marginUnit}>mm</span>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSaveMapping}
                >
                  Save Mapping
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setStep(hasHandleStep ? 2 : 1)}
                >
                  Go back
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
    </ModalDialog>
  );
}
