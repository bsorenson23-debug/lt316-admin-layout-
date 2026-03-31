"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { estimateLaserTime } from "@/utils/svgLaserUtils";
import { ModalDialog } from "./shared/ModalDialog";
import styles from "./LaserSimulatorOverlay.module.css";

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
  const dotRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const timeEstimate = estimateLaserTime(svgContent, speedMmPerSec, passes);

  useEffect(() => {
    const container = svgContainerRef.current;
    const dot = dotRef.current;
    if (!container || !dot) return;

    const raf = window.requestAnimationFrame(() => {
      const paths = Array.from(
        container.querySelectorAll<SVGGeometryElement>(
          "path, line, polyline, polygon, circle, ellipse, rect",
        ),
      ).filter((element) => element.getTotalLength && element.getTotalLength() > 0);

      if (paths.length === 0) return;

      const pxPerSecond = speedMmPerSec / 0.2646;

      paths.forEach((path) => {
        const length = path.getTotalLength();
        gsap.set(path, {
          attr: {
            stroke: "var(--accent)",
            strokeWidth: 1.5,
            strokeDasharray: length,
            strokeDashoffset: length,
            fill: "none",
          },
        });
      });

      const timeline = gsap.timeline({
        onUpdate() {
          setProgress(timeline.progress());
        },
        onComplete() {
          setIsPlaying(false);
        },
      });

      let cumulativeTime = 0;
      paths.forEach((path) => {
        const length = path.getTotalLength();
        const duration = length / pxPerSecond;

        timeline.to(path, {
          duration,
          ease: "linear",
          attr: { strokeDashoffset: 0 },
          onUpdate() {
            const localProgress = timeline.time() - cumulativeTime;
            const distance = Math.min(length, localProgress * pxPerSecond);
            const point = (path as SVGGeometryElement).getPointAtLength(distance);
            const containerRect = container.getBoundingClientRect();
            const svgElement = container.querySelector("svg");
            if (!svgElement) return;

            const svgRect = svgElement.getBoundingClientRect();
            gsap.set(dot, {
              x:
                svgRect.left -
                containerRect.left +
                point.x * (svgRect.width / (svgElement.viewBox?.baseVal?.width || svgRect.width)),
              y:
                svgRect.top -
                containerRect.top +
                point.y * (svgRect.height / (svgElement.viewBox?.baseVal?.height || svgRect.height)),
            });
          },
        }, cumulativeTime);

        cumulativeTime += duration;
      });

      tlRef.current = timeline;
    });

    intervalRef.current = window.setInterval(() => setElapsed((current) => current + 1), 1000);

    return () => {
      window.cancelAnimationFrame(raf);
      tlRef.current?.kill();
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [svgContent, speedMmPerSec]);

  const handlePlayPause = useCallback(() => {
    const timeline = tlRef.current;
    if (!timeline) return;

    if (timeline.paused()) {
      timeline.play();
      setIsPlaying(true);
      return;
    }

    timeline.pause();
    setIsPlaying(false);
  }, []);

  const handleRestart = useCallback(() => {
    const timeline = tlRef.current;
    if (!timeline) return;
    timeline.restart();
    setProgress(0);
    setElapsed(0);
    setIsPlaying(true);
  }, []);

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <ModalDialog open title="Laser Simulation" onClose={onClose} size="wide">
      <div className={styles.layout}>
        <div className={styles.header}>
          <span className={styles.kicker}>Laser Simulation</span>
          <span className={styles.itemName}>{itemName}</span>
          <span className={styles.speedInfo}>
            {speedMmPerSec} mm/s / {passes} pass{passes > 1 ? "es" : ""}
          </span>
        </div>

        <div className={styles.canvasShell}>
          <div
            ref={svgContainerRef}
            className={styles.canvasStage}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
          <div ref={dotRef} className={styles.dot} />
          <div className={styles.scanlines} />
        </div>

        <div className={styles.progressBlock}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
          <div className={styles.progressMeta}>
            <span>Elapsed {formatTime(elapsed)}</span>
            <span>{Math.round(progress * 100)}%</span>
            <span>Est. {formatTime(Math.round(timeEstimate.estimatedSeconds * passes))}</span>
          </div>
        </div>

        <div className={styles.statsRow}>
          <span>Path: {timeEstimate.totalPathMm.toFixed(0)} mm</span>
          <span>Passes: {passes}</span>
          <span>Total: {(timeEstimate.totalWithPasses / 1000).toFixed(2)} m</span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={handlePlayPause}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={handleRestart}>
            Restart
          </button>
          <button type="button" className={styles.dangerBtn} onClick={onClose}>
            Close
          </button>
        </div>

        <p className={styles.caption}>
          GSAP stroke-dashoffset simulation scaled to the active machine speed.
        </p>
      </div>
    </ModalDialog>
  );
}
