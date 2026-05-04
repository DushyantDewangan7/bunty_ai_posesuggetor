/**
 * 33 MediaPipe Pose landmarks. Index follows MediaPipe's convention:
 * 0=nose, 11=left_shoulder, 12=right_shoulder, 23=left_hip, 24=right_hip, etc.
 * See: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 */
export interface PoseLandmark {
  /** Normalized x in image space, 0=left edge, 1=right edge */
  x: number;
  /** Normalized y in image space, 0=top edge, 1=bottom edge */
  y: number;
  /** Depth relative to hips. Experimental, may be 0 if model doesn't provide. */
  z: number;
  /** 0-1 confidence the landmark is visible (not occluded) */
  visibility: number;
  /** 0-1 confidence the landmark is in the frame */
  presence: number;
}

/**
 * A pose detection result for a single frame.
 * landmarks is null when no person is detected.
 */
export interface PoseFrame {
  /** 33 landmarks in MediaPipe order, or null if no person detected */
  landmarks: PoseLandmark[] | null;
  /** Frame timestamp in ms (performance.now() from the worklet thread) */
  timestamp: number;
  /** Inference latency in ms for this frame */
  inferenceMs: number;
}

/**
 * Same as PoseFrame but landmarks are normalized to a canonical frame:
 * - Hip midpoint at origin (0, 0, 0)
 * - Shoulder-to-hip distance = 1.0
 * - Used for body-shape-invariant pose comparison
 */
export interface NormalizedPoseFrame {
  landmarks: PoseLandmark[] | null;
  timestamp: number;
  inferenceMs: number;
}
