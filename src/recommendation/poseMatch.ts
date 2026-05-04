import type { NormalizedPoseFrame, PoseLandmark } from '../types/landmarks';
import type { MatchResult, MatchState } from '../types/pose';

/**
 * Maximum acceptable mean weighted distance, in canonical pose units.
 * The canonical frame has shoulder-to-hip distance = 1.0, so a person with
 * a totally different pose typically has per-landmark distances on the order
 * of 1–2 canonical units. 1.5 maps "fully wrong" to fitScore ~0.
 */
const MAX_ACCEPTABLE_DISTANCE = 1.5;

const FAR_THRESHOLD = 0.5;
const MATCHED_THRESHOLD = 0.85;

const EMPTY_RESULT: MatchResult = {
  fitScore: 0,
  landmarkDistances: [],
  worstJoints: [],
  state: 'far',
};

/**
 * Compare a current pose frame against a target pose. Both are expected in
 * canonical pose space (post-normalize): hip midpoint at origin, shoulder-to-
 * hip distance = 1.0.
 *
 * Algorithm:
 *   1. For each of the 33 landmarks, compute Euclidean (x,y,z) distance.
 *   2. Weight each distance by the current frame's visibility — occluded
 *      landmarks contribute proportionally less.
 *   3. Aggregate as a visibility-weighted mean.
 *   4. fitScore = 1 - meanDistance / MAX_ACCEPTABLE_DISTANCE, clamped to [0,1].
 *   5. Bucket into far / close / matched for UI feedback.
 *   6. Return the three landmark indices with the largest weighted distances.
 */
export function matchPose(target: PoseLandmark[], current: NormalizedPoseFrame): MatchResult {
  const cur = current.landmarks;
  if (!cur) return EMPTY_RESULT;

  const n = Math.min(target.length, cur.length);
  if (n === 0) return EMPTY_RESULT;

  const distances: number[] = new Array<number>(n);
  const weighted: number[] = new Array<number>(n);
  let totalWeight = 0;
  let weightedSum = 0;

  for (let i = 0; i < n; i++) {
    const t = target[i];
    const c = cur[i];
    if (t === undefined || c === undefined) {
      distances[i] = 0;
      weighted[i] = 0;
      continue;
    }
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const dz = t.z - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const w = c.visibility;
    distances[i] = d;
    weighted[i] = d * w;
    weightedSum += d * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return EMPTY_RESULT;

  const meanDistance = weightedSum / totalWeight;
  const fitScore = Math.max(0, Math.min(1, 1 - meanDistance / MAX_ACCEPTABLE_DISTANCE));
  const state = bucketState(fitScore);

  // Top 3 worst joints by weighted distance, descending.
  const indices = weighted.map((_, i) => i);
  indices.sort((a, b) => (weighted[b] ?? 0) - (weighted[a] ?? 0));
  const worstJoints = indices.slice(0, 3);

  return {
    fitScore,
    landmarkDistances: distances,
    worstJoints,
    state,
  };
}

function bucketState(fitScore: number): MatchState {
  if (fitScore < FAR_THRESHOLD) return 'far';
  if (fitScore < MATCHED_THRESHOLD) return 'close';
  return 'matched';
}
