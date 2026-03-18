/**
 * Browser-side video red-dot analysis.
 *
 * Uses the HTML5 Video + Canvas API to:
 *   1. Extract frames from a recorded video at a fixed rate
 *   2. Detect the laser red-dot centroid in each frame
 *   3. Cluster temporal detections into discrete hole-visit events
 *   4. Return one representative pixel position per sequence hole
 *
 * Runs entirely client-side — no server or native modules needed.
 */

import type { DetectedHitPx } from "./lensCalibration";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RedDotAnalysisOptions {
  /** Frames per second to sample from the video (default 8) */
  sampleFps?: number;
  /**
   * Minimum red-channel dominance score (R - max(G,B)) to consider a pixel
   * as a red-dot pixel (default 80, range 0–255).
   */
  redThreshold?: number;
  /**
   * Minimum absolute R channel value (default 160).
   * Prevents dark reddish pixels from matching.
   */
  minRedChannel?: number;
  /**
   * Minimum total weight (sum of per-pixel scores) required to declare a
   * detection in a frame (default 3000).
   * Increase to filter accidental red reflections.
   */
  minFrameWeight?: number;
  /**
   * Gap (in frames) with no detection that splits a cluster into two
   * separate hole visits (default 6).
   */
  clusterGapFrames?: number;
  /** Called with 0–1 progress as frames are extracted */
  onProgress?: (progress: number) => void;
}

// ---------------------------------------------------------------------------
// Frame extraction
// ---------------------------------------------------------------------------

/** Raw per-frame detection (pixel centroid) */
interface FrameDetection {
  frameIdx: number;
  xPx: number;
  yPx: number;
  weight: number;
}

/**
 * Seek-based frame extraction.  For each sampled timestamp we seek the video
 * element and capture a canvas snapshot.  This avoids decoding every frame
 * and keeps memory use low even for long recordings.
 */
export async function extractFramesFromVideo(
  file: File,
  options: RedDotAnalysisOptions = {}
): Promise<FrameDetection[]> {
  const {
    sampleFps = 8,
    redThreshold = 80,
    minRedChannel = 160,
    minFrameWeight = 3000,
    onProgress,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.muted = true;
    video.preload = "auto";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { reject(new Error("Canvas 2D not supported")); return; }

    video.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load video. Try MP4, MOV, or WebM."));
    });

    video.addEventListener("loadedmetadata", () => {
      const { videoWidth: W, videoHeight: H, duration } = video;
      if (!Number.isFinite(duration) || duration <= 0) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Video has no duration."));
        return;
      }

      canvas.width = W;
      canvas.height = H;

      const frameCount = Math.max(1, Math.floor(duration * sampleFps));
      const detections: FrameDetection[] = [];
      let frameIdx = 0;

      function seekNext() {
        if (frameIdx >= frameCount) {
          URL.revokeObjectURL(objectUrl);
          resolve(detections);
          return;
        }
        video.currentTime = (frameIdx / frameCount) * duration;
        frameIdx++;
      }

      video.addEventListener("seeked", () => {
        ctx.drawImage(video, 0, 0, W, H);
        const imageData = ctx.getImageData(0, 0, W, H);
        const hit = scanForRedDot(imageData, redThreshold, minRedChannel, minFrameWeight);
        if (hit) detections.push({ frameIdx: frameIdx - 1, ...hit });
        onProgress?.(frameIdx / frameCount);
        seekNext();
      });

      seekNext();
    });
  });
}

// ---------------------------------------------------------------------------
// Per-frame red dot detection
// ---------------------------------------------------------------------------

function scanForRedDot(
  imageData: ImageData,
  redThreshold: number,
  minRedChannel: number,
  minWeight: number
): { xPx: number; yPx: number; weight: number } | null {
  const { data, width, height } = imageData;
  let sumX = 0;
  let sumY = 0;
  let totalWeight = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < minRedChannel) continue;

      const score = r - Math.max(g, b);
      if (score < redThreshold) continue;

      sumX += x * score;
      sumY += y * score;
      totalWeight += score;
    }
  }

  if (totalWeight < minWeight) return null;
  return { xPx: sumX / totalWeight, yPx: sumY / totalWeight, weight: totalWeight };
}

// ---------------------------------------------------------------------------
// Temporal clustering → one centroid per sequence hole
// ---------------------------------------------------------------------------

interface Cluster {
  frames: FrameDetection[];
  centroidX: number;
  centroidY: number;
}

function clusterFrameDetections(
  frames: FrameDetection[],
  gapFrames: number
): Cluster[] {
  if (frames.length === 0) return [];

  const clusters: Cluster[] = [];
  let current: FrameDetection[] = [frames[0]];

  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i].frameIdx - frames[i - 1].frameIdx;
    if (gap > gapFrames) {
      clusters.push(buildCluster(current));
      current = [];
    }
    current.push(frames[i]);
  }
  if (current.length > 0) clusters.push(buildCluster(current));

  return clusters;
}

function buildCluster(frames: FrameDetection[]): Cluster {
  let sumX = 0;
  let sumY = 0;
  let sumW = 0;
  for (const f of frames) {
    sumX += f.xPx * f.weight;
    sumY += f.yPx * f.weight;
    sumW += f.weight;
  }
  return {
    frames,
    centroidX: sumX / sumW,
    centroidY: sumY / sumW,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface VideoAnalysisResult {
  /** One detected pixel position per matched sequence hole */
  detections: DetectedHitPx[];
  /** Number of sequence holes with a matching cluster */
  matchedCount: number;
  /** How many clusters were found in the video (may exceed sequence length) */
  totalClusters: number;
  /** Confidence 0–1 based on matched fraction and cluster quality */
  confidence: number;
}

/**
 * Analyse a video recording of the red-light grid sequence.
 *
 * @param file - The video file uploaded by the user
 * @param expectedHoleCount - How many holes are in the calibration sequence
 * @param options - Tuning options
 */
export async function analyseCalibrationVideo(
  file: File,
  expectedHoleCount: number,
  options: RedDotAnalysisOptions = {}
): Promise<VideoAnalysisResult> {
  const { clusterGapFrames = 6 } = options;

  const frameDetections = await extractFramesFromVideo(file, options);
  const clusters = clusterFrameDetections(frameDetections, clusterGapFrames);

  // Assign sequence indices in temporal order (one cluster = one hole visit)
  const matched = Math.min(clusters.length, expectedHoleCount);
  const detections: DetectedHitPx[] = clusters.slice(0, matched).map(
    (cluster, seqIndex) => ({
      seqIndex,
      xPx: cluster.centroidX,
      yPx: cluster.centroidY,
      confidence: Math.min(1, cluster.frames.length / 4),
    })
  );

  const confidence = matched > 0 ? (matched / expectedHoleCount) * 0.8 +
    (detections.reduce((s, d) => s + d.confidence, 0) / matched) * 0.2 : 0;

  return {
    detections,
    matchedCount: matched,
    totalClusters: clusters.length,
    confidence,
  };
}
