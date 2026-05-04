import type { PoseLandmark } from '../../types/landmarks';

/**
 * Connections between MediaPipe Pose landmarks (33-landmark model).
 * Each pair is [fromIndex, toIndex] referencing landmark indices.
 * See https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 */
export const POSE_CONNECTIONS: readonly (readonly [number, number])[] = [
  // Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  // Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Right arm (from camera POV; landmark 11 is left_shoulder in person POV)
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  // Left arm
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  // Right leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Left leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];

export interface ScreenLandmark {
  x: number;
  y: number;
  visibility: number;
}

/**
 * Map image-normalized landmarks (0-1) to screen pixels.
 * Set mirrored=true for front-facing camera; back camera uses false.
 */
export function imageToScreen(
  landmarks: readonly PoseLandmark[],
  screenWidth: number,
  screenHeight: number,
  mirrored: boolean,
): ScreenLandmark[] {
  return landmarks.map((lm) => ({
    x: mirrored ? (1 - lm.x) * screenWidth : lm.x * screenWidth,
    y: lm.y * screenHeight,
    visibility: lm.visibility,
  }));
}
