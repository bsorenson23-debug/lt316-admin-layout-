"use client";

import React, { Suspense, useCallback, useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Grid, Bounds, useBounds } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PlacedItem, PlacedItemPatch } from "@/types/admin";
import type { TumblerDimensions } from "./ModelViewer";
import { YetiRambler40oz } from "./models/YetiRambler40oz";
import type { DecalItem } from "./models/YetiRambler40oz";
import type { ProductTemplate } from "@/types/productTemplate";
import { getWrapFrontCenter } from "@/utils/tumblerWrapLayout";
import styles from "./TumblerPlacementView.module.css";

// ---------------------------------------------------------------------------
// Rasterize a single PlacedItem's SVG into its own canvas (4 px/mm)
// ---------------------------------------------------------------------------

const PX_PER_MM = 4;

async function rasterizeItem(item: PlacedItem, tintColor?: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(item.width * PX_PER_MM);
  canvas.height = Math.ceil(item.height * PX_PER_MM);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const blob = new Blob([item.svgText], { type: "image/svg+xml" });
  const blobUrl = URL.createObjectURL(blob);

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (tintColor) {
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = tintColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
      }
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
    img.src = blobUrl;
  });

  return canvas;
}

// ---------------------------------------------------------------------------
// Camera preset positions (all in mm, relative to tumbler center)
// ---------------------------------------------------------------------------

type CameraPreset = "front" | "back" | "left" | "right";

function presetPosition(preset: CameraPreset, H: number): [number, number, number] {
  const dist = H * 1.4;
  const elev = H * 0.3;
  switch (preset) {
    case "front":  return [0, elev, dist];
    case "back":   return [0, elev, -dist];
    case "left":   return [-dist, elev, 0];
    case "right":  return [dist, elev, 0];
  }
}

// ---------------------------------------------------------------------------
// Inner scene component — needs R3F context for camera access
// ---------------------------------------------------------------------------

function CameraController({
  preset,
  H,
  onDone,
}: {
  preset: CameraPreset | null;
  H: number;
  onDone: () => void;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    if (!preset) return;
    const [x, y, z] = presetPosition(preset, H);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    camera.updateProjectionMatrix();
    onDone();
  }, [preset, H, camera, onDone]);

  const minDist = Math.max(20, H * 0.6);
  const maxDist = H * 4;

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      enablePan={false}
      minDistance={minDist}
      maxDistance={maxDist}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 1.5}
    />
  );
}

function AutoFit() {
  const bounds = useBounds();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    const timer = setTimeout(() => { bounds.refresh().clip().fit(); }, 120);
    return () => clearTimeout(timer);
  }, [bounds]);
  return null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TumblerPlacementViewProps {
  placedItems: PlacedItem[];
  tumblerDims: TumblerDimensions;
  selectedTemplate: ProductTemplate | null;
  bedWidthMm: number;
  bedHeightMm: number;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onUpdateItem: (id: string, patch: PlacedItemPatch) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TumblerPlacementView({
  placedItems,
  tumblerDims,
  selectedTemplate,
  bedWidthMm,
  bedHeightMm,
  selectedItemId,
  onSelectItem,
  onUpdateItem,
}: TumblerPlacementViewProps) {
  const [cameraPreset, setCameraPreset] = useState<CameraPreset | null>("front");
  const [activePreset, setActivePreset] = useState<CameraPreset>("front");
  const [decalItems, setDecalItems] = useState<DecalItem[]>([]);

  const selectedItem = placedItems.find((p) => p.id === selectedItemId) ?? null;

  const dims = selectedTemplate?.dimensions;
  const diameterMm = tumblerDims.diameterMm;
  const printHeightMm = tumblerDims.printableHeightMm;
  const wrapWidthMm = bedWidthMm;
  const handleArcDeg = dims?.handleArcDeg ?? 0;
  const glbPath = selectedTemplate?.glbPath || undefined;
  const bodyTintColor = selectedTemplate?.dimensions.bodyColorHex ?? "#b0b8c4";
  const rimTintColor = selectedTemplate?.dimensions.rimColorHex ?? "#d0d0d0";
  const tumblerMappingProp = selectedTemplate?.tumblerMapping;
  const clampedTumblerMapping = useMemo(() => {
    if (!tumblerMappingProp) return tumblerMappingProp;
    const calXLimit = Math.max(15, Math.min(45, Math.round(wrapWidthMm * 0.12)));
    const calYLimit = Math.max(10, Math.min(35, Math.round(printHeightMm * 0.2)));
    const calRotLimit = 35;
    const clampCal = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));
    return {
      ...tumblerMappingProp,
      calibrationOffsetX: clampCal(tumblerMappingProp.calibrationOffsetX ?? 0, -calXLimit, calXLimit),
      calibrationOffsetY: clampCal(tumblerMappingProp.calibrationOffsetY ?? 0, -calYLimit, calYLimit),
      calibrationRotation: clampCal(tumblerMappingProp.calibrationRotation ?? 0, -calRotLimit, calRotLimit),
    };
  }, [tumblerMappingProp, wrapWidthMm, printHeightMm]);
  const H = tumblerDims.overallHeightMm;

  // Serialized position key — only re-rasterize when items actually change
  const itemPositionKey = useMemo(
    () => placedItems
      .filter((i) => i.visible !== false)
      .map((i) => `${i.id}:${i.x}:${i.y}:${i.width}:${i.height}:${i.rotation}:${i.visible !== false}`)
      .join("|"),
    [placedItems],
  );

  // Rasterize placed items into canvas textures for Decals
  useEffect(() => {
    const visible = placedItems.filter((i) => i.visible !== false);
    if (visible.length === 0) {
      setDecalItems([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      visible.map(async (item) => {
        const canvas = await rasterizeItem(item, rimTintColor);
        return {
          id: item.id,
          canvas,
          gridX: item.x,
          gridY: item.y,
          gridW: item.width,
          gridH: item.height,
          gridRotationDeg: item.rotation ?? 0,
        } as DecalItem;
      }),
    ).then((items) => {
      if (!cancelled) setDecalItems(items);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemPositionKey, rimTintColor]);

  const handleCameraPreset = useCallback((p: CameraPreset) => {
    setActivePreset(p);
    setCameraPreset(p);
  }, []);

  const clearPreset = useCallback(() => {
    setCameraPreset(null);
  }, []);

  // ── Alignment actions ──
  const alignFrontH = useCallback(() => {
    if (!selectedItemId || !selectedItem) return;
    onUpdateItem(selectedItemId, {
      x: getWrapFrontCenter(wrapWidthMm, handleArcDeg) - (selectedItem.width / 2),
    });
  }, [selectedItemId, selectedItem, wrapWidthMm, handleArcDeg, onUpdateItem]);

  const alignCenterV = useCallback(() => {
    if (!selectedItemId || !selectedItem) return;
    onUpdateItem(selectedItemId, {
      y: (printHeightMm / 2) - (selectedItem.height / 2),
    });
  }, [selectedItemId, selectedItem, printHeightMm, onUpdateItem]);

  const alignBoth = useCallback(() => {
    if (!selectedItemId || !selectedItem) return;
    onUpdateItem(selectedItemId, {
      x: getWrapFrontCenter(wrapWidthMm, handleArcDeg) - (selectedItem.width / 2),
      y: (printHeightMm / 2) - (selectedItem.height / 2),
    });
  }, [selectedItemId, selectedItem, wrapWidthMm, printHeightMm, handleArcDeg, onUpdateItem]);

  // ── Scene scale ──
  const nearClip = 1;
  const farClip = 8000;
  const gridCell = H * 0.05;
  const gridSection = H * 0.25;
  const gridFade = H * 3.5;
  const shadowScale = H * 4;
  const shadowFar = H * 0.7;

  return (
    <div className={styles.wrap}>
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
        <color attach="background" args={["#12121a"]} />

        {/* Three-point lighting — no Environment preset per CLAUDE.md */}
        <hemisphereLight args={["#ffe8cc", "#2a3a50", 0.7]} />
        <directionalLight position={[5, 9, 4]} intensity={1.8} color="#fff8f0" />
        <directionalLight position={[-5, 3, -2]} intensity={0.5} color="#c8d8ff" />
        <directionalLight position={[0, 4, -9]} intensity={0.35} color="#ffffff" />

        <Bounds observe={false} margin={1.8}>
          <Suspense fallback={null}>
            <YetiRambler40oz
              placedItems={decalItems}
              diameterMm={diameterMm}
              topDiameterMm={tumblerDims.topDiameterMm}
              overallHeightMm={tumblerDims.overallHeightMm}
              printHeightMm={printHeightMm}
              printableTopOffsetMm={tumblerDims.printableTopOffsetMm ?? 0}
              wrapWidthMm={wrapWidthMm}
              handleArcDeg={handleArcDeg}
              glbPath={glbPath}
              tumblerMapping={clampedTumblerMapping}
              bodyTintColor={bodyTintColor}
              rimTintColor={rimTintColor}
            />
          </Suspense>
          <AutoFit />
        </Bounds>

        <ContactShadows
          position={[0, -(H / 2) - 1, 0]}
          opacity={0.35}
          scale={shadowScale}
          blur={2.5}
          far={shadowFar}
          color="#000018"
        />

        <Grid
          position={[0, -(H / 2) - 2, 0]}
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

        <CameraController preset={cameraPreset} H={H} onDone={clearPreset} />
      </Canvas>

      {/* ── Alignment toolbar (top-left) ── */}
      <div className={styles.alignToolbar}>
        <button
          className={styles.alignBtn}
          onClick={alignFrontH}
          disabled={!selectedItem}
          title="Center horizontally on front face"
        >
          Center on front
        </button>
        <button
          className={styles.alignBtn}
          onClick={alignCenterV}
          disabled={!selectedItem}
          title="Center vertically"
        >
          Center vertical
        </button>
        <button
          className={styles.alignBtn}
          onClick={alignBoth}
          disabled={!selectedItem}
          title="Center on front face, both axes"
        >
          Center both
        </button>
      </div>

      {/* ── Position readout (bottom-left) ── */}
      <div className={styles.positionReadout}>
        {selectedItem ? (
          <>
            X: {selectedItem.x.toFixed(1)}mm{"\u2002"}
            Y: {selectedItem.y.toFixed(1)}mm{"\u2002"}
            W: {selectedItem.width.toFixed(1)} × H: {selectedItem.height.toFixed(1)}mm
          </>
        ) : (
          "No item selected"
        )}
      </div>

      {/* ── Camera presets (bottom-right) ── */}
      <div className={styles.cameraPresets}>
        {(["front", "back", "left", "right"] as CameraPreset[]).map((p) => (
          <button
            key={p}
            className={`${styles.cameraBtn} ${activePreset === p ? styles.cameraBtnActive : ""}`}
            onClick={() => handleCameraPreset(p)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
