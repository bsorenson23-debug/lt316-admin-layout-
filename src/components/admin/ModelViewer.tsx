"use client";

import React, { Suspense, useMemo, useEffect } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment, Bounds, Html, useProgress } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Loading indicator
// ---------------------------------------------------------------------------

function LoadingIndicator() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{
        color: "#aaa",
        fontSize: 11,
        background: "rgba(0,0,0,0.7)",
        padding: "6px 14px",
        borderRadius: 4,
        border: "1px solid #333",
        whiteSpace: "nowrap",
      }}>
        Loading {Math.round(progress)}%
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Format-specific mesh components
// ---------------------------------------------------------------------------

function StlMesh({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);
  return (
    <Bounds fit clip observe>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#8fa8c0" metalness={0.25} roughness={0.55} />
      </mesh>
    </Bounds>
  );
}

function ObjMesh({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  return (
    <Bounds fit clip observe>
      <primitive object={obj} />
    </Bounds>
  );
}

function GltfMesh({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  return (
    <Bounds fit clip observe>
      <primitive object={gltf.scene} />
    </Bounds>
  );
}

function ModelByExtension({ url, ext }: { url: string; ext: string }) {
  if (ext === "stl") return <StlMesh url={url} />;
  if (ext === "obj") return <ObjMesh url={url} />;
  if (ext === "glb" || ext === "gltf") return <GltfMesh url={url} />;
  return (
    <Html center>
      <span style={{ color: "#f87171", fontSize: 11 }}>
        Unsupported: .{ext}
      </span>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface ModelViewerProps {
  file: File;
}

export default function ModelViewer({ file }: ModelViewerProps) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  return (
    <Canvas
      shadows
      camera={{ position: [0, 2, 6], fov: 45, near: 0.01, far: 2000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Environment preset="studio" />

      <Suspense fallback={<LoadingIndicator />}>
        <ModelByExtension url={url} ext={ext} />
      </Suspense>

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={0.1}
        maxDistance={500}
        makeDefault
      />
    </Canvas>
  );
}
