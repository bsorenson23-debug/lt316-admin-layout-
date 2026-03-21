"use client";

/**
 * LaserSimulatorOverlay
 *
 * Full-screen modal that animates an SVG as if being laser engraved —
 * powered by GSAP stroke-dashoffset animation. A glowing orange "laser dot"
 * traces each path at a speed proportional to the machine speed setting.
 *
 * Usage:
 *   <LaserSimulatorOverlay svgContent={item.svgText} speedMmPerSec={100} onClose={...} />
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { estimateLaserTime } from "@/utils/svgLaserUtils";

interface Props {
  svgContent: string;
  itemName: string;
  speedMmPerSec?: number;
  passes?: number;
  onClose: () => void;
}

export function LaserSimulatorOverlay({
  svgContent,
  itemName,
  speedMmPerSec = 100,
  passes = 1,
  onClose,
}: Props) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const dotRef          = useRef<HTMLDivElement>(null);
  const tlRef           = useRef<gsap.core.Timeline | null>(null);
  const [progress, setProgress]   = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsed, setElapsed]     = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeEst = estimateLaserTime(svgContent, speedMmPerSec, passes);

  // ── Run animation on mount ────────────────────────────────────────────────
  useEffect(() => {
    const container = svgContainerRef.current;
    const dot = dotRef.current;
    if (!container || !dot) return;

    // Give SVG time to render before querying geometry
    const raf = requestAnimationFrame(() => {
      const paths = Array.from(
        container.querySelectorAll<SVGGeometryElement>(
          "path, line, polyline, polygon, circle, ellipse, rect"
        )
      ).filter(el => el.getTotalLength && el.getTotalLength() > 0);

      if (paths.length === 0) return;

      // Paint all paths laser-orange with stroke-dashoffset ready to animate
      const LASER_COLOR = "#ff6a00";
      const PX_PER_SEC  = speedMmPerSec / 0.2646; // mm/s → svg-px/s

      paths.forEach(path => {
        const len = path.getTotalLength();
        gsap.set(path, {
          attr: {
            stroke: LASER_COLOR,
            strokeWidth: 1.5,
            strokeDasharray: len,
            strokeDashoffset: len,
            fill: "none",
          },
        });
      });

      const tl = gsap.timeline({
        onUpdate() { setProgress(tl.progress()); },
        onComplete() { setIsPlaying(false); },
      });

      // Track which path is currently being drawn for the dot
      let cumulativeTime = 0;
      paths.forEach(path => {
        const len      = path.getTotalLength();
        const duration = len / PX_PER_SEC;

        tl.to(path, {
          duration,
          ease: "linear",
          attr: { strokeDashoffset: 0 },
          onUpdate() {
            // Move dot to current drawing position
            const localProgress = tl.time() - cumulativeTime;
            const distAlong = Math.min(len, localProgress * PX_PER_SEC);
            const pt = (path as SVGGeometryElement).getPointAtLength(distAlong);
            const containerRect = container.getBoundingClientRect();
            const svgEl = container.querySelector("svg");
            if (svgEl && containerRect) {
              const svgRect = svgEl.getBoundingClientRect();
              gsap.set(dot, {
                x: svgRect.left - containerRect.left + pt.x * (svgRect.width  / (svgEl.viewBox?.baseVal?.width  || svgRect.width)),
                y: svgRect.top  - containerRect.top  + pt.y * (svgRect.height / (svgEl.viewBox?.baseVal?.height || svgRect.height)),
              });
            }
          },
        }, cumulativeTime);

        cumulativeTime += duration;
      });

      tlRef.current = tl;
    });

    // Elapsed time counter
    intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    return () => {
      cancelAnimationFrame(raf);
      tlRef.current?.kill();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [svgContent, speedMmPerSec]);

  const handlePlayPause = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (tl.paused()) { tl.play(); setIsPlaying(true); }
    else             { tl.pause(); setIsPlaying(false); }
  }, []);

  const handleRestart = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.restart();
    setProgress(0);
    setElapsed(0);
    setIsPlaying(true);
  }, []);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.92)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      {/* Header */}
      <div style={{ color: "#fff", fontSize: 15, fontFamily: "system-ui", marginBottom: 16, display: "flex", gap: 16, alignItems: "center" }}>
        <span style={{ color: "#ff6a00", fontWeight: 700 }}>LASER SIMULATION</span>
        <span style={{ color: "#888" }}>{itemName}</span>
        <span style={{ color: "#5ab0d0" }}>{speedMmPerSec} mm/s · {passes} pass{passes > 1 ? "es" : ""}</span>
      </div>

      {/* SVG canvas */}
      <div style={{ position: "relative", background: "#0a0a0a", border: "1px solid #2a3a45", borderRadius: 8, overflow: "hidden" }}>
        <div
          ref={svgContainerRef}
          style={{ width: 480, height: 480, display: "flex", alignItems: "center", justifyContent: "center" }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
        {/* Laser dot */}
        <div
          ref={dotRef}
          style={{
            position: "absolute", width: 10, height: 10,
            borderRadius: "50%",
            background: "radial-gradient(circle, #fff 0%, #ff6a00 40%, transparent 70%)",
            boxShadow: "0 0 8px 4px #ff6a00, 0 0 20px 8px rgba(255,106,0,0.4)",
            transform: "translate(-50%, -50%)",
            top: 0, left: 0,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
        {/* Scanline overlay for realism */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }} />
      </div>

      {/* Progress bar */}
      <div style={{ width: 480, marginTop: 12 }}>
        <div style={{ height: 3, background: "#1a2a2a", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, #ff6a00, #ffaa00)",
            boxShadow: "0 0 6px #ff6a00",
            transition: "width 0.05s linear",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, fontFamily: "monospace", color: "#556" }}>
          <span>Elapsed {fmtTime(elapsed)}</span>
          <span>{Math.round(progress * 100)}%</span>
          <span>Est. {fmtTime(Math.round(timeEst.estimatedSeconds * passes))}</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 24, marginTop: 10, fontSize: 12, fontFamily: "monospace", color: "#5ab0d0" }}>
        <span>Path: {timeEst.totalPathMm.toFixed(0)} mm</span>
        <span>Passes: {passes}</span>
        <span>Total: {(timeEst.totalWithPasses / 1000).toFixed(2)} m</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={handlePlayPause}
          style={{ background: "#1a2a30", border: "1px solid #3a5060", color: "#fff", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button onClick={handleRestart}
          style={{ background: "#1a2a30", border: "1px solid #3a5060", color: "#8ab0c8", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
          ↺ Restart
        </button>
        <button onClick={onClose}
          style={{ background: "#2a1010", border: "1px solid #5a2020", color: "#c87878", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
          ✕ Close
        </button>
      </div>

      <p style={{ marginTop: 12, color: "#333", fontSize: 11, fontFamily: "monospace" }}>
        GSAP stroke-dashoffset simulation · speed scaled to machine setting
      </p>
    </div>
  );
}
