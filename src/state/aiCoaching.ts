/**
 * Session-scoped state for AI-generated scene-aware coaching (Phase E).
 *
 * Not persisted to MMKV — coaching is timely-only. A tip generated for a
 * particular frame is useless after the user has already moved.
 *
 * Cache key is the perceptual hash of the camera frame, scoped to the active
 * pose (resetSession on pose change clears it). pHash collisions within a pose
 * mean "same view of the same setup" which is exactly when we want the cached
 * tip to apply.
 *
 * Score-range timers power auto-triggering: when the user has been stuck at a
 * low score or close-but-not-matching long enough that a hint is more useful
 * than noise, the orchestrator hook reads these timestamps + the hard caps
 * below to decide whether to fire.
 */

import { create } from 'zustand';

/** Hard limit per pose session — keeps cost predictable. Resets on pose change. */
export const MAX_AI_CALLS_PER_POSE_SESSION = 3;
/** Score must stay below FAR_THRESHOLD for this long before stuck-trigger fires. */
export const STUCK_DURATION_MS = 15_000;
/** Score must stay in close-but-not-matched range for this long before close-trigger fires. */
export const CLOSE_DURATION_MS = 10_000;
/** Minimum gap between two AUTO triggers. Manual "Ask AI" bypasses this. */
export const AUTO_TRIGGER_COOLDOWN_MS = 5_000;

/** Stuck range: fitScore below this is "user is far from the pose." */
export const STUCK_SCORE_BELOW = 0.5;
/** Close-but-not-matched range: [CLOSE_SCORE_MIN, CLOSE_SCORE_MAX). */
export const CLOSE_SCORE_MIN = 0.65;
export const CLOSE_SCORE_MAX = 0.85;

interface AiCoachingState {
  /** Most recent AI coaching tip for the active pose. Null when not yet generated or after session reset. */
  currentTip: string | null;
  /** Number of AI calls fired during the current pose session. Resets on pose change. */
  callsThisSession: number;
  /** frameHash → coaching text. Scoped to the active pose; cleared on resetSession. */
  cache: Map<string, string>;
  /** When fitScore first dropped below STUCK_SCORE_BELOW. Null while above. */
  scoreEnteredStuckRangeAt: number | null;
  /** When fitScore first entered [CLOSE_SCORE_MIN, CLOSE_SCORE_MAX). Null while outside. */
  scoreEnteredCloseRangeAt: number | null;
  /** Unix ms of the most recent auto-trigger. Used for the cooldown window. */
  lastAutoTriggerAt: number;

  setTip: (tip: string | null) => void;
  /** Increment the per-session call counter and stamp lastAutoTriggerAt to `now`. */
  recordAutoCall: (now: number) => void;
  /** Increment the per-session call counter WITHOUT touching the cooldown timer. For manual triggers. */
  recordManualCall: () => void;
  addToCache: (frameHash: string, tip: string) => void;
  getCached: (frameHash: string) => string | undefined;
  resetSession: () => void;
  /** Update both stuck-range and close-range timers based on the current score and the current time. */
  updateScoreTimers: (fitScore: number, now: number) => void;
}

const INITIAL_STATE = {
  currentTip: null as string | null,
  callsThisSession: 0,
  cache: new Map<string, string>(),
  scoreEnteredStuckRangeAt: null as number | null,
  scoreEnteredCloseRangeAt: null as number | null,
  lastAutoTriggerAt: 0,
};

export const useAiCoaching = create<AiCoachingState>((set, get) => ({
  ...INITIAL_STATE,
  // Fresh Map per store — never share INITIAL_STATE.cache between sessions.
  cache: new Map<string, string>(),

  setTip: (tip) => set({ currentTip: tip }),

  recordAutoCall: (now) =>
    set((s) => ({
      callsThisSession: s.callsThisSession + 1,
      lastAutoTriggerAt: now,
    })),

  recordManualCall: () =>
    set((s) => ({
      callsThisSession: s.callsThisSession + 1,
    })),

  addToCache: (frameHash, tip) => {
    // Mutating in place: zustand triggers a re-render only when the reference
    // identity of the state slot changes. Cache is consumed only via getCached
    // (a method call), never via direct subscription, so no observers need to
    // see a new Map reference. Avoids allocating a fresh Map on every API hit.
    get().cache.set(frameHash, tip);
  },

  getCached: (frameHash) => get().cache.get(frameHash),

  resetSession: () =>
    set({
      currentTip: null,
      callsThisSession: 0,
      cache: new Map<string, string>(),
      scoreEnteredStuckRangeAt: null,
      scoreEnteredCloseRangeAt: null,
      lastAutoTriggerAt: 0,
    }),

  updateScoreTimers: (fitScore, now) =>
    set((s) => {
      const inStuckRange = fitScore < STUCK_SCORE_BELOW;
      const inCloseRange = fitScore >= CLOSE_SCORE_MIN && fitScore < CLOSE_SCORE_MAX;

      let stuckAt = s.scoreEnteredStuckRangeAt;
      if (inStuckRange && stuckAt === null) stuckAt = now;
      else if (!inStuckRange && stuckAt !== null) stuckAt = null;

      let closeAt = s.scoreEnteredCloseRangeAt;
      if (inCloseRange && closeAt === null) closeAt = now;
      else if (!inCloseRange && closeAt !== null) closeAt = null;

      if (stuckAt === s.scoreEnteredStuckRangeAt && closeAt === s.scoreEnteredCloseRangeAt) {
        return s;
      }
      return { ...s, scoreEnteredStuckRangeAt: stuckAt, scoreEnteredCloseRangeAt: closeAt };
    }),
}));

/**
 * Pure-function condition check for the auto-trigger. Lives outside the store
 * so the orchestrator can call it without subscribing to every field.
 */
export function shouldAutoTrigger(
  state: Pick<
    AiCoachingState,
    | 'callsThisSession'
    | 'lastAutoTriggerAt'
    | 'scoreEnteredStuckRangeAt'
    | 'scoreEnteredCloseRangeAt'
  >,
  now: number,
): boolean {
  if (state.callsThisSession >= MAX_AI_CALLS_PER_POSE_SESSION) return false;
  if (now - state.lastAutoTriggerAt < AUTO_TRIGGER_COOLDOWN_MS) return false;

  const stuckLongEnough =
    state.scoreEnteredStuckRangeAt !== null &&
    now - state.scoreEnteredStuckRangeAt > STUCK_DURATION_MS;

  const closeLongEnough =
    state.scoreEnteredCloseRangeAt !== null &&
    now - state.scoreEnteredCloseRangeAt > CLOSE_DURATION_MS;

  return stuckLongEnough || closeLongEnough;
}
