import { create } from 'zustand';
import type { PoseFrame, NormalizedPoseFrame } from '../types/landmarks';

interface PoseStreamState {
  /** Latest raw pose detection from the camera */
  latestFrame: PoseFrame | null;
  /** Latest pose normalized for comparison */
  latestNormalized: NormalizedPoseFrame | null;
  /** Frames-per-second over the last second, for debug overlays */
  fps: number;
  /** True when a person is currently being detected */
  isDetecting: boolean;

  setFrame: (frame: PoseFrame, normalized: NormalizedPoseFrame) => void;
  setFps: (fps: number) => void;
  reset: () => void;
}

export const usePoseStream = create<PoseStreamState>((set) => ({
  latestFrame: null,
  latestNormalized: null,
  fps: 0,
  isDetecting: false,

  setFrame: (frame, normalized) =>
    set({
      latestFrame: frame,
      latestNormalized: normalized,
      isDetecting: frame.landmarks !== null,
    }),

  setFps: (fps) => set({ fps }),

  reset: () =>
    set({
      latestFrame: null,
      latestNormalized: null,
      fps: 0,
      isDetecting: false,
    }),
}));
