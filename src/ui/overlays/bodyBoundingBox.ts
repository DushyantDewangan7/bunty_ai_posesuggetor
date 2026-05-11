import type { PoseLandmark } from '../../types/landmarks';

export interface BodyBBox {
  /** Body bbox center x in normalized [0..1] frame coords */
  centerX: number;
  /** Body bbox center y in normalized [0..1] frame coords */
  centerY: number;
  /** Padded body height in normalized [0..1] frame units (visible body extent ×1.10) */
  height: number;
  /** True when bbox is reliable enough to drive the overlay */
  isValid: boolean;
}

// Nose, shoulders/elbows/wrists, hips/knees/ankles. Foot landmarks (29–32)
// are handled separately via effectiveFootPoint — they need a lower
// visibility threshold (MediaPipe routinely emits feet at 0.2–0.4) AND, when
// missing entirely, a synthetic foot-bottom point derived from ankle + an
// anatomical foot extension. Folding them into BODY_INDICES would force a
// single threshold and skip the extension fallback.
const BODY_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;
const LEFT_HEEL = 29;
const RIGHT_HEEL = 30;
const LEFT_FOOT_INDEX = 31;
const RIGHT_FOOT_INDEX = 32;

const VISIBILITY_THRESHOLD = 0.5;
// Feet sit at the noisy end of MediaPipe's confidence curve even when fully
// in frame — lowering the threshold for foot landmarks specifically lets
// real feet contribute to the bbox without compromising the rest of the
// body's noise floor.
const FOOT_VISIBILITY_THRESHOLD = 0.3;
// Anchors required so the bbox can't latch onto a partial body and drift.
// Nose anchors the top, shoulders anchor the upper torso, hips anchor the
// lower torso. Knees/ankles/feet join when visible (extending bbox to feet)
// but gracefully drop out when occluded — bbox tightens to upper body, which
// is still better than the torso-centroid drift it replaces.
const MIN_VISIBLE_BODY_POINTS = 5;
const MIN_PADDED_HEIGHT = 0.1;
const HEIGHT_PADDING = 1.1;
// Foot length is roughly 25% of thigh length (foot ≈ 6% of body, thigh ≈
// 25%). When we can't see the foot directly we extend below the ankle by
// this fraction of the visible thigh — per-user adaptive, no global tuning.
const FOOT_EXTENSION_RATIO = 0.25;
// Conservative fallback when thigh length isn't measurable (hip or knee
// occluded). ~3% of frame height — covers a typical shoe extent without
// over-extending dramatically.
const FOOT_EXTENSION_FALLBACK = 0.03;

const FALLBACK: BodyBBox = { centerX: 0.5, centerY: 0.5, height: 0, isValid: false };

function isVisible(lm: PoseLandmark | undefined): lm is PoseLandmark {
  return !!lm && (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD;
}

function isVisibleAtFootThreshold(lm: PoseLandmark | undefined): lm is PoseLandmark {
  return !!lm && (lm.visibility ?? 1) >= FOOT_VISIBILITY_THRESHOLD;
}

interface FootPoint {
  x: number;
  y: number;
}

function footExtensionFromThigh(
  hip: PoseLandmark | undefined,
  knee: PoseLandmark | undefined,
): number {
  if (isVisible(hip) && isVisible(knee)) {
    const thigh = Math.abs(knee.y - hip.y);
    if (thigh > 0) return thigh * FOOT_EXTENSION_RATIO;
  }
  return FOOT_EXTENSION_FALLBACK;
}

// Returns the lowest reliable foot-bottom y for one leg. Tries, in order:
// (1) real foot landmarks at the relaxed foot threshold,
// (2) extending the ankle position downward by foot_extension when ankle is
//     reliably visible,
// (3) extrapolating the ankle from hip + knee then extending by
//     foot_extension when both feet AND ankle are unreliable.
// Returns null only when we can't produce any defensible foot position.
function effectiveFootPoint(
  hip: PoseLandmark | undefined,
  knee: PoseLandmark | undefined,
  ankle: PoseLandmark | undefined,
  heel: PoseLandmark | undefined,
  toe: PoseLandmark | undefined,
): FootPoint | null {
  const visibleFeet: PoseLandmark[] = [];
  if (isVisibleAtFootThreshold(heel)) visibleFeet.push(heel);
  if (isVisibleAtFootThreshold(toe)) visibleFeet.push(toe);
  if (visibleFeet.length > 0) {
    const lowest = visibleFeet.reduce((a, b) => (a.y > b.y ? a : b));
    return { x: lowest.x, y: lowest.y };
  }

  if (isVisible(ankle)) {
    return { x: ankle.x, y: ankle.y + footExtensionFromThigh(hip, knee) };
  }

  if (isVisible(hip) && isVisible(knee)) {
    const extrapolatedAnkleY = knee.y + (knee.y - hip.y);
    // Sanity: a real ankle on an upright body sits below the knee. Reject
    // degenerate poses (hip == knee, inverted body) rather than producing a
    // synthetic point that lands above the knee.
    if (extrapolatedAnkleY > knee.y) {
      return { x: knee.x, y: extrapolatedAnkleY + footExtensionFromThigh(hip, knee) };
    }
  }

  return null;
}

export function computeBodyBBox(landmarks: PoseLandmark[] | null | undefined): BodyBBox {
  if (!landmarks || landmarks.length < 33) return { ...FALLBACK };

  const visiblePoints: { x: number; y: number }[] = BODY_INDICES.map((i) => landmarks[i]).filter(
    isVisible,
  );

  const leftFoot = effectiveFootPoint(
    landmarks[LEFT_HIP],
    landmarks[LEFT_KNEE],
    landmarks[LEFT_ANKLE],
    landmarks[LEFT_HEEL],
    landmarks[LEFT_FOOT_INDEX],
  );
  const rightFoot = effectiveFootPoint(
    landmarks[RIGHT_HIP],
    landmarks[RIGHT_KNEE],
    landmarks[RIGHT_ANKLE],
    landmarks[RIGHT_HEEL],
    landmarks[RIGHT_FOOT_INDEX],
  );
  if (leftFoot) visiblePoints.push(leftFoot);
  if (rightFoot) visiblePoints.push(rightFoot);

  const hasNose = isVisible(landmarks[0]);
  const hasShoulder = isVisible(landmarks[11]) || isVisible(landmarks[12]);
  const hasHip = isVisible(landmarks[LEFT_HIP]) || isVisible(landmarks[RIGHT_HIP]);
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
