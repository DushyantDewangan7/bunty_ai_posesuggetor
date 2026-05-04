import type { PoseLandmark } from '../types/landmarks';

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const VISIBILITY_THRESHOLD = 0.5;

/**
 * Normalize 33 raw MediaPipe pose landmarks (image-space, 0–1) to a
 * canonical, body-shape-invariant frame:
 *
 *   - Hip midpoint (between landmarks 23 and 24) → origin (0, 0, 0)
 *   - Distance from hip midpoint to shoulder midpoint (between landmarks 11
 *     and 12) → 1.0
 *   - All other landmarks are translated and scaled by the same transform
 *   - visibility and presence are passed through unchanged
 *
 * Returns null if any of the four anchor landmarks (11, 12, 23, 24) has
 * visibility below 0.5 — without trustworthy hips and shoulders, the
 * canonical frame cannot be defined.
 */
export function normalizePose(raw: PoseLandmark[]): PoseLandmark[] | null {
  const ls = raw[LEFT_SHOULDER];
  const rs = raw[RIGHT_SHOULDER];
  const lh = raw[LEFT_HIP];
  const rh = raw[RIGHT_HIP];

  if (ls === undefined || rs === undefined || lh === undefined || rh === undefined) {
    return null;
  }
  if (
    ls.visibility < VISIBILITY_THRESHOLD ||
    rs.visibility < VISIBILITY_THRESHOLD ||
    lh.visibility < VISIBILITY_THRESHOLD ||
    rh.visibility < VISIBILITY_THRESHOLD
  ) {
    return null;
  }

  const hipMidX = (lh.x + rh.x) / 2;
  const hipMidY = (lh.y + rh.y) / 2;
  const hipMidZ = (lh.z + rh.z) / 2;

  const shoulderMidX = (ls.x + rs.x) / 2;
  const shoulderMidY = (ls.y + rs.y) / 2;
  const shoulderMidZ = (ls.z + rs.z) / 2;

  const dx = shoulderMidX - hipMidX;
  const dy = shoulderMidY - hipMidY;
  const dz = shoulderMidZ - hipMidZ;
  const scale = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (scale === 0) {
    return null;
  }

  const out: PoseLandmark[] = new Array<PoseLandmark>(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const lm = raw[i];
    if (lm === undefined) {
      return null;
    }
    out[i] = {
      x: (lm.x - hipMidX) / scale,
      y: (lm.y - hipMidY) / scale,
      z: (lm.z - hipMidZ) / scale,
      visibility: lm.visibility,
      presence: lm.presence,
    };
  }
  return out;
}
