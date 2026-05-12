/**
 * Map matchResult.worstJoints + landmarkDistances into the friendly-labelled
 * topDeltas shape the coaching prompt expects.
 *
 * Extracted from useAiCoachingOrchestrator.ts so it can be unit-tested in node
 * (the orchestrator pulls in vision-camera + Skia which break node imports).
 *
 * Skips unnamed landmark indices — MediaPipe emits 33 landmarks including
 * face details and finger/foot tips that wouldn't make sense in a coaching
 * tip ("Adjust your left eye outer corner" is useless).
 */

/** Denominator matching MAX_ACCEPTABLE_DISTANCE in poseMatch.ts. Normalizes raw distance to 0-1 deviation. */
export const MAX_ACCEPTABLE_DISTANCE = 1.5;

/**
 * Friendly labels for the 13 coachable MediaPipe landmark indices.
 * Same labels MatchFeedback's rule-based hint uses.
 */
export const LANDMARK_NAMES: Record<number, string> = {
  0: 'head',
  11: 'left shoulder',
  12: 'right shoulder',
  13: 'left elbow',
  14: 'right elbow',
  15: 'left wrist',
  16: 'right wrist',
  23: 'left hip',
  24: 'right hip',
  25: 'left knee',
  26: 'right knee',
  27: 'left ankle',
  28: 'right ankle',
};

export function extractTopDeltas(
  worstJoints: number[],
  landmarkDistances: number[],
  limit: number = 3,
): { joint: string; deviation: number }[] {
  const out: { joint: string; deviation: number }[] = [];
  for (const idx of worstJoints) {
    const name = LANDMARK_NAMES[idx];
    if (!name) continue;
    const raw = landmarkDistances[idx] ?? 0;
    const deviation = Math.max(0, Math.min(1, raw / MAX_ACCEPTABLE_DISTANCE));
    out.push({ joint: name, deviation });
    if (out.length >= limit) break;
  }
  return out;
}
