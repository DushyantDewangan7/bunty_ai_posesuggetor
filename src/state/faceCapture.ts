import { create } from 'zustand';
import type { FaceLandmarkResult } from '../native/FaceLandmarkerOutput.nitro';

/**
 * Transient state for the onboarding face-capture step. Not persisted —
 * once the user advances past the capture screen, the face shape lives in
 * the persisted UserProfile and this store is reset.
 */
interface FaceCaptureState {
  /** Latest result from the Face Landmarker Output, or null if nothing detected */
  latest: FaceLandmarkResult | null;
  /** True when a face is currently detected and centered in the frame */
  isCentered: boolean;
  setLatest: (result: FaceLandmarkResult | null, isCentered: boolean) => void;
  reset: () => void;
}

export const useFaceCapture = create<FaceCaptureState>((set) => ({
  latest: null,
  isCentered: false,
  setLatest: (result, isCentered) => set({ latest: result, isCentered }),
  reset: () => set({ latest: null, isCentered: false }),
}));

/**
 * Heuristic — face is "centered" when the nose landmark (index 1) is within
 * the central 60% of the frame in both axes. MediaPipe normalizes landmarks
 * to [0,1] in the frame's coordinate system, so 0.2 ≤ x ≤ 0.8 etc.
 */
const NOSE_INDEX = 1;
const CENTER_TOLERANCE = 0.3;

export function isFaceCentered(result: FaceLandmarkResult): boolean {
  const nose = result.landmarks[NOSE_INDEX];
  if (!nose) return false;
  return (
    nose.x >= 0.5 - CENTER_TOLERANCE &&
    nose.x <= 0.5 + CENTER_TOLERANCE &&
    nose.y >= 0.5 - CENTER_TOLERANCE &&
    nose.y <= 0.5 + CENTER_TOLERANCE
  );
}
