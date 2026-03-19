"use client";
import React, { useRef, useState, useEffect } from "react";
import styles from "./CameraOverlayPanel.module.css";

interface Props {
  onCaptureOverlay: (dataUrl: string) => void;
}

export function CameraOverlayPanel({ onCaptureOverlay }: Props) {
  const [open, setOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setStreaming(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to access camera.");
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCaptureOverlay(canvas.toDataURL("image/png"));
    setCaptured(true);
    setTimeout(() => setCaptured(false), 1500);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        <span className={styles.toggleLabel}>Camera Overlay</span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {streaming && (
            <video
              ref={videoRef}
              className={styles.preview}
              playsInline
              muted
            />
          )}

          {error && <span className={styles.error}>{error}</span>}
          {captured && <span className={styles.success}>Captured!</span>}

          {!streaming ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={startCamera}>
              Start Camera
            </button>
          ) : (
            <>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={captureFrame}>
                Capture Frame
              </button>
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={stopCamera}>
                Stop Camera
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
