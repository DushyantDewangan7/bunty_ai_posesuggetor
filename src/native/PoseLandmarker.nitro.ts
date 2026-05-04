import type { HybridObject } from 'react-native-nitro-modules';

/**
 * One landmark in MediaPipe's pose-landmark space, normalized to [0,1] within
 * the input frame's coordinate system. `visibility` and `presence` are MediaPipe's
 * confidence scores.
 */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence: number;
}

/**
 * Result of a single MediaPipe inference. `landmarks` always has exactly 33
 * entries when present (full body) — the MediaPipe pose model fixed schema.
 * `inferenceMs` is the wall-clock time spent in `detectForVideo`.
 */
export interface PoseLandmarkResult {
  landmarks: PoseLandmark[];
  inferenceMs: number;
}

/**
 * Native pose-landmarker control hybrid (ping + warmup only).
 *
 * Per-frame inference does NOT live here — see `PoseLandmarkerOutput.nitro.ts`
 * for the Output-attached analyzer pattern (ADR-001 G14, 2026-05-03).
 */
export interface PoseLandmarker extends HybridObject<{ android: 'kotlin'; ios: 'swift' }> {
  /**
   * Smoke-test method retained for diagnostics.
   */
  ping(): string;

  /**
   * Eagerly initialize the MediaPipe PoseLandmarker. Call once on mount
   * from regular JS (not a worklet). Idempotent: subsequent calls return
   * immediately if init already succeeded.
   *
   * Tries GPU delegate first, falls back to CPU on any GPU init failure.
   * Returns true if either delegate succeeded, false if both failed.
   */
  warmup(): boolean;
}
