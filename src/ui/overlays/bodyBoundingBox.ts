import type { PoseLandmark } from '../../types/landmarks';

export interface BodyBBox {
  /** Body bbox center x in normalized [0..1] frame coords */
  centerX: number;
  /** Body bbox center y in normalized [0..1] frame coords */
  centerY: number;
  /** Padded body height in normalized [0..1] frame units (visible body extent ×1.15) */
  height: number;
  /** True when bbox is reliable enough to drive the overlay */
  isValid: boolean;
}

// Body landmarks the bbox stretches across when visible.
const BODY_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const VISIBILITY_THRESHOLD = 0.5;
// Anchors required so the bbox can't latch onto a partial body and drift.
// Nose anchors the top, shoulders anchor the upper torso, hips anchor the
// lower torso. Knees/ankles join when visible (extending bbox to feet) but
// gracefully drop out when occluded — bbox tightens to upper body, which is
// still better than the torso-centroid drift it replaces.
const MIN_VISIBLE_BODY_POINTS = 5;
const MIN_PADDED_HEIGHT = 0.1;
const HEIGHT_PADDING = 1.15;

const FALLBACK: BodyBBox = { centerX: 0.5, centerY: 0.5, height: 0, isValid: false };

function isVisible(lm: PoseLandmark | undefined): lm is PoseLandmark {
  return !!lm && (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD;
}

export function computeBodyBBox(landmarks: PoseLandmark[] | null | undefined): BodyBBox {
  if (!landmarks || landmarks.length < 33) return { ...FALLBACK };

  const visiblePoints = BODY_INDICES.map((i) => landmarks[i]).filter(isVisible);

  const hasNose = isVisible(landmarks[0]);
  const hasShoulder = isVisible(landmarks[11]) || isVisible(landmarks[12]);
  const hasHip = isVisible(landmarks[23]) || isVisible(landmarks[24]);
  if (!hasNose || !hasShoulder || !hasHip || visiblePoints.length < MIN_VISIBLE_BODY_POINTS) {
    return { ...FALLBACK };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of visiblePoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const rawHeight = maxY - minY;
  const paddedHeight = rawHeight * HEIGHT_PADDING;

  return {
    centerX,
    centerY,
    height: paddedHeight,
    isValid: paddedHeight > MIN_PADDED_HEIGHT,
  };
}
