import type { NormalizedPoseFrame, PoseFrame, PoseLandmark } from '../../types/landmarks';
import { usePoseStream } from '../poseStream';

/**
 * A T-pose: standing facing camera, arms straight out.
 * Image-normalized coordinates (0-1) for a person centered in frame.
 * Approximated by hand from MediaPipe landmark conventions (33 landmarks, indices 0-32).
 */
const T_POSE_LANDMARKS: PoseLandmark[] = [
  // 0=nose
  { x: 0.5, y: 0.2, z: 0, visibility: 0.99, presence: 0.99 },
  // 1-3: right eye area (inner, center, outer)
  { x: 0.48, y: 0.18, z: 0, visibility: 0.95, presence: 0.95 },
  { x: 0.46, y: 0.18, z: 0, visibility: 0.95, presence: 0.95 },
  { x: 0.44, y: 0.18, z: 0, visibility: 0.95, presence: 0.95 },
  // 4-6: left eye area (inner, center, outer)
  { x: 0.52, y: 0.18, z: 0, visibility: 0.95, presence: 0.95 },
  { x: 0.54, y: 0.18, z: 0, visibility: 0.95, presence: 0.95 },
  { x: 0.56, y: 0.18, z: 0, visibility: 0.95, presence: 0.95 },
  // 7-8: right ear, left ear
  { x: 0.42, y: 0.2, z: 0, visibility: 0.85, presence: 0.85 },
  { x: 0.58, y: 0.2, z: 0, visibility: 0.85, presence: 0.85 },
  // 9-10: mouth (left, right)
  { x: 0.49, y: 0.24, z: 0, visibility: 0.95, presence: 0.95 },
  { x: 0.51, y: 0.24, z: 0, visibility: 0.95, presence: 0.95 },
  // 11-12: shoulders (left, right)
  { x: 0.4, y: 0.35, z: 0, visibility: 0.99, presence: 0.99 },
  { x: 0.6, y: 0.35, z: 0, visibility: 0.99, presence: 0.99 },
  // 13-14: elbows (T-pose: arms straight out)
  { x: 0.25, y: 0.35, z: 0, visibility: 0.99, presence: 0.99 },
  { x: 0.75, y: 0.35, z: 0, visibility: 0.99, presence: 0.99 },
  // 15-16: wrists
  { x: 0.1, y: 0.35, z: 0, visibility: 0.99, presence: 0.99 },
  { x: 0.9, y: 0.35, z: 0, visibility: 0.99, presence: 0.99 },
  // 17-18: pinky (left, right)
  { x: 0.08, y: 0.36, z: 0, visibility: 0.85, presence: 0.85 },
  { x: 0.92, y: 0.36, z: 0, visibility: 0.85, presence: 0.85 },
  // 19-20: index (left, right)
  { x: 0.07, y: 0.35, z: 0, visibility: 0.85, presence: 0.85 },
  { x: 0.93, y: 0.35, z: 0, visibility: 0.85, presence: 0.85 },
  // 21-22: thumb (left, right)
  { x: 0.09, y: 0.34, z: 0, visibility: 0.85, presence: 0.85 },
  { x: 0.91, y: 0.34, z: 0, visibility: 0.85, presence: 0.85 },
  // 23-24: hips (left, right)
  { x: 0.43, y: 0.55, z: 0, visibility: 0.99, presence: 0.99 },
  { x: 0.57, y: 0.55, z: 0, visibility: 0.99, presence: 0.99 },
  // 25-26: knees
  { x: 0.43, y: 0.72, z: 0, visibility: 0.99, presence: 0.99 },
  { x: 0.57, y: 0.72, z: 0, visibility: 0.99, presence: 0.99 },
  // 27-28: ankles
  { x: 0.43, y: 0.9, z: 0, visibility: 0.99, presence: 0.99 },
  { x: 0.57, y: 0.9, z: 0, visibility: 0.99, presence: 0.99 },
  // 29-30: heels
  { x: 0.41, y: 0.92, z: 0, visibility: 0.85, presence: 0.85 },
  { x: 0.59, y: 0.92, z: 0, visibility: 0.85, presence: 0.85 },
  // 31-32: foot indices
  { x: 0.45, y: 0.92, z: 0, visibility: 0.85, presence: 0.85 },
  { x: 0.55, y: 0.92, z: 0, visibility: 0.85, presence: 0.85 },
];

export function injectMockPose(): void {
  const now = performance.now();
  const frame: PoseFrame = {
    landmarks: T_POSE_LANDMARKS,
    timestamp: now,
    inferenceMs: 0,
  };
  // Mock keeps the same shape; PoseSkeleton draws from raw, so this is sufficient.
  const normalized: NormalizedPoseFrame = {
    landmarks: T_POSE_LANDMARKS,
    timestamp: now,
    inferenceMs: 0,
  };
  usePoseStream.getState().setFrame(frame, normalized);
}

export function clearMockPose(): void {
  usePoseStream.getState().reset();
}
