import type { FaceLandmark, FaceLandmarkResult } from '../native/FaceLandmarkerOutput.nitro';
import type { FaceShape } from '../types/userProfile';

/**
 * MediaPipe Face Mesh 468-point topology — landmark indices used for
 * face-shape derivation. References:
 *  - 10  → forehead center (top of face)
 *  - 152 → chin (bottom of face)
 *  - 21  → left forehead (temple)
 *  - 251 → right forehead (temple)
 *  - 234 → left cheekbone (widest part of mid-face)
 *  - 454 → right cheekbone
 *  - 172 → left jawline
 *  - 397 → right jawline
 *
 * See https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
 * for the full topology diagram.
 */
const IDX = {
  foreheadCenter: 10,
  chin: 152,
  leftForehead: 21,
  rightForehead: 251,
  leftCheek: 234,
  rightCheek: 454,
  leftJaw: 172,
  rightJaw: 397,
} as const;

/**
 * Required input length. MediaPipe's full Face Landmarker emits 478 landmarks
 * (468 mesh + 10 iris); the native Output slices to the first 468 before
 * crossing the JSI boundary. Callers should never see anything else.
 */
export const FACE_MESH_LANDMARK_COUNT = 468;

function dist2D(a: FaceLandmark, b: FaceLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export interface FaceShapeMetrics {
  faceLength: number;
  foreheadWidth: number;
  cheekboneWidth: number;
  jawWidth: number;
  lengthToWidth: number;
  foreheadToJaw: number;
  cheekboneToJaw: number;
}

/**
 * Compute the geometric ratios that drive face-shape classification. Exposed
 * for diagnostics and onboarding-time logging — the classifier wraps these
 * with rule application.
 */
export function computeFaceShapeMetrics(landmarks: FaceLandmark[]): FaceShapeMetrics | null {
  if (landmarks.length < FACE_MESH_LANDMARK_COUNT) return null;

  const fc = landmarks[IDX.foreheadCenter];
  const ch = landmarks[IDX.chin];
  const lf = landmarks[IDX.leftForehead];
  const rf = landmarks[IDX.rightForehead];
  const lc = landmarks[IDX.leftCheek];
  const rc = landmarks[IDX.rightCheek];
  const lj = landmarks[IDX.leftJaw];
  const rj = landmarks[IDX.rightJaw];
  if (!fc || !ch || !lf || !rf || !lc || !rc || !lj || !rj) return null;

  const faceLength = dist2D(fc, ch);
  const foreheadWidth = dist2D(lf, rf);
  const cheekboneWidth = dist2D(lc, rc);
  const jawWidth = dist2D(lj, rj);

  // Degenerate input — would yield Inf/NaN ratios. Guard so downstream
  // classification can return 'unknown' cleanly instead of propagating NaN.
  if (cheekboneWidth === 0 || jawWidth === 0) return null;

  return {
    faceLength,
    foreheadWidth,
    cheekboneWidth,
    jawWidth,
    lengthToWidth: faceLength / cheekboneWidth,
    foreheadToJaw: foreheadWidth / jawWidth,
    cheekboneToJaw: cheekboneWidth / jawWidth,
  };
}

/**
 * Classify face shape from MediaPipe Face Mesh landmarks using a rule-based
 * geometric approach. Rules applied in priority order — the most-distinctive
 * shapes (heart, diamond) are checked first because their conditions are
 * tighter and less likely to over-match.
 *
 * Returns 'unknown' if landmarks are missing/degenerate or if no rule fires.
 */
export function deriveFaceShape(landmarks: FaceLandmark[]): FaceShape {
  const m = computeFaceShapeMetrics(landmarks);
  if (m === null) return 'unknown';

  const { lengthToWidth, foreheadToJaw, cheekboneToJaw } = m;

  // Diamond — cheekbones noticeably wider than both forehead and jaw.
  if (cheekboneToJaw > 1.15 && foreheadToJaw < 1.0) {
    return 'diamond';
  }

  // Heart — forehead notably wider than jaw, cheeks ≥ jaw.
  if (foreheadToJaw > 1.2 && cheekboneToJaw > 1.0) {
    return 'heart';
  }

  // Oval — face notably longer than wide, cheeks slightly wider than jaw.
  if (lengthToWidth > 1.3 && cheekboneToJaw >= 1.0 && cheekboneToJaw <= 1.1) {
    return 'oval';
  }

  // Round vs Square — both have ~equal length and width. Disambiguate by
  // cheekbone-to-jaw ratio: round faces have cheekbones slightly wider than
  // the jaw; square faces have a strong jawline so cheek ≈ jaw.
  if (lengthToWidth >= 0.9 && lengthToWidth <= 1.1) {
    if (cheekboneToJaw > 1.05) return 'round';
    if (cheekboneToJaw <= 1.05 && cheekboneToJaw >= 0.95) return 'square';
  }

  // Threshold gaps between the rules above leave many real faces
  // unclassified. As a safety net, return whichever shape's thresholds the
  // metrics violate the least. Returning 'unknown' here would force the UI
  // to show "Not detected" even when 468 valid landmarks are present.
  return closestShape(m);
}

/**
 * Fallback used by {@link deriveFaceShape} when the strict geometric rules
 * leave the metrics in a gap. Picks the shape whose threshold violations sum
 * to the smallest total. Tiebreaker is 'oval' (most common shape in the
 * general population).
 *
 * Temporary safety net — Phase 4+ will recalibrate thresholds against a
 * labeled dataset to remove the dependency on this fallback.
 */
function closestShape(m: FaceShapeMetrics): FaceShape {
  const { lengthToWidth: lw, foreheadToJaw: fj, cheekboneToJaw: cj } = m;
  const gt = (x: number, t: number): number => Math.max(0, t - x);
  const lt = (x: number, t: number): number => Math.max(0, x - t);

  const scores: { shape: FaceShape; violation: number }[] = [
    { shape: 'diamond', violation: gt(cj, 1.15) + lt(fj, 1.0) },
    { shape: 'heart', violation: gt(fj, 1.2) + gt(cj, 1.0) },
    { shape: 'oval', violation: gt(lw, 1.3) + gt(cj, 1.0) + lt(cj, 1.1) },
    { shape: 'round', violation: gt(lw, 0.9) + lt(lw, 1.1) + gt(cj, 1.05) },
    {
      shape: 'square',
      violation: gt(lw, 0.9) + lt(lw, 1.1) + lt(cj, 1.05) + gt(cj, 0.95),
    },
  ];

  scores.sort((a, b) => {
    if (a.violation !== b.violation) return a.violation - b.violation;
    if (a.shape === 'oval') return -1;
    if (b.shape === 'oval') return 1;
    return 0;
  });

  return scores[0]!.shape;
}

/**
 * Convenience wrapper for the common path: take a {@linkcode FaceLandmarkResult}
 * straight off the native Output and produce a classified shape.
 */
export function deriveFaceShapeFromResult(result: FaceLandmarkResult): FaceShape {
  return deriveFaceShape(result.landmarks);
}
