/**
 * Orchestrator hook for scene-aware AI coaching (Phase E).
 *
 * Wires together:
 *   - usePoseTarget (active pose + match result) — triggers session resets and timer updates
 *   - useAiMode (gate) — silences the orchestrator when off
 *   - useAiCoaching (state slice) — session state + cache + timers
 *   - captureCurrentFrame + generateCoaching — the actual capture + Gemini call
 *
 * Mount once in CameraScreen. The hook owns:
 *   - Session reset effect (active pose change)
 *   - Score-timer update effect (every matchResult update)
 *   - 1-Hz interval that checks auto-trigger conditions
 *   - The `triggerManual` callback returned for the AskAI button
 *
 * Hook strategy notes:
 *   - photoOutput comes in as a parameter so the orchestrator and the rest of
 *     CameraScreen share one declarative output (vision-camera 5.x outputs[]).
 *   - We hold the latest photoOutput in a ref so the interval callback (which
 *     captures it on mount) always sees the current value without re-mounting
 *     every render.
 *   - The auto-call counter increments only on actual API calls. Cache hits
 *     and quota-blocked passes do not burn session budget.
 *   - lastAutoTriggerAt stamps on every API attempt (success or null return)
 *     so a failing call still enforces the 5s cooldown — keeps us from
 *     hammering the API while it's down.
 */

import { useEffect, useRef } from 'react';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

import { useAiMode } from '../state/aiMode';
import {
  MAX_AI_CALLS_PER_POSE_SESSION,
  shouldAutoTrigger,
  useAiCoaching,
} from '../state/aiCoaching';
import { usePoseTarget } from '../state/poseTarget';
import { captureCurrentFrame } from '../smartSuggestions/captureFrame.ts';
import { computePHash } from '../smartSuggestions/pHash.ts';
import { generateCoaching } from './aiCoachingService.ts';
import type { CoachingRequest } from './aiCoachingService.ts';
import { extractTopDeltas } from './topDeltas.ts';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

const POLL_INTERVAL_MS = 1_000;

export interface UseAiCoachingOrchestratorResult {
  /** Manually trigger an AI coaching call. Bypasses cooldown; still enforces session cap. */
  triggerManual: () => Promise<void>;
}

export function useAiCoachingOrchestrator(
  photoOutput: CameraPhotoOutput | null,
): UseAiCoachingOrchestratorResult {
  const aiMode = useAiMode();
  const photoOutputRef = useRef(photoOutput);
  photoOutputRef.current = photoOutput;
  const selectedId = usePoseTarget((s) => s.selected?.id);

  // Reset session whenever the active pose changes (or is cleared).
  useEffect(() => {
    useAiCoaching.getState().resetSession();
  }, [selectedId]);

  // Update score-range timers each time a new match result arrives.
  useEffect(() => {
    const unsub = usePoseTarget.subscribe((state, prev) => {
      if (state.matchResult === prev.matchResult) return;
      if (!state.matchResult) return;
      useAiCoaching.getState().updateScoreTimers(state.matchResult.fitScore, Date.now());
    });
    return unsub;
  }, []);

  // Reset timers on aiMode flip-off so they don't carry stale ranges across toggles.
  // Reset on flip-on too — we want a clean session when the user enables AI.
  useEffect(() => {
    if (!aiMode) {
      useAiCoaching.getState().resetSession();
    }
  }, [aiMode]);

  // Auto-trigger watcher: 1 Hz tick that checks conditions and fires.
  useEffect(() => {
    if (!aiMode) return;
    const tick = (): void => {
      const out = photoOutputRef.current;
      if (!out) return;
      const state = useAiCoaching.getState();
      const now = Date.now();
      if (!shouldAutoTrigger(state, now)) return;
      void trigger('auto', out);
    };
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [aiMode]);

  const triggerManual = async (): Promise<void> => {
    const out = photoOutputRef.current;
    if (!out) return;
    await trigger('manual', out);
  };

  return { triggerManual };
}

/**
 * Capture a frame, hash it, check cache, fire Gemini if needed. Updates the
 * aiCoaching store with the result. Source distinguishes auto vs manual for
 * counter / cooldown accounting:
 *   - auto: stamps lastAutoTriggerAt before the call so a failure still
 *     enforces cooldown; increments counter only on API attempt (cache hits
 *     don't burn budget).
 *   - manual: ignores cooldown; still subject to the per-session cap. Manual
 *     trigger also doesn't stamp lastAutoTriggerAt so it doesn't shift the
 *     auto-trigger schedule.
 */
export async function trigger(
  source: 'auto' | 'manual',
  photoOutput: CameraPhotoOutput,
): Promise<void> {
  const store = useAiCoaching.getState();

  // Enforce per-session cap for both auto and manual.
  if (store.callsThisSession >= MAX_AI_CALLS_PER_POSE_SESSION) {
    // When capped, leave currentTip unchanged (a previous tip stays visible)
    // and return — fallback to rule-based via useCoachingText still works.
    return;
  }

  const selected = usePoseTarget.getState().selected;
  const matchResult = usePoseTarget.getState().matchResult;
  if (!selected || !matchResult) return;

  let captured;
  try {
    captured = await captureCurrentFrame(photoOutput);
  } catch {
    return;
  }

  let frameHash: string;
  try {
    frameHash = computePHash(captured.grayscale);
  } catch {
    return;
  }

  // Cache lookup before the API call. Cache hits do not burn session budget
  // or stamp the cooldown — same scene, same tip, no cost.
  const cached = store.getCached(frameHash);
  if (cached) {
    store.setTip(cached);
    return;
  }

  // Stamp cooldown BEFORE the API call so a slow/failed Gemini response still
  // enforces the 5s gap (prevents thrashing while the API is down).
  if (source === 'auto') {
    store.recordAutoCall(Date.now());
  } else {
    store.recordManualCall();
  }

  const req: CoachingRequest = {
    frameJpegBase64: captured.base64,
    frameGrayscale: captured.grayscale,
    poseName: selected.name,
    poseId: selected.id,
    fitScore: matchResult.fitScore,
    topDeltas: extractTopDeltas(matchResult.worstJoints, matchResult.landmarkDistances, 3),
  };

  const result = await generateCoaching(req, { apiKey: API_KEY });
  if (!result) {
    // On failure: currentTip is left as-is; consumer falls back to rule-based
    // via useCoachingText. The counter/cooldown were already stamped above so
    // we don't immediately retry.
    return;
  }

  store.addToCache(result.frameHash, result.text);
  store.setTip(result.text);

  // If the user already matched the pose during the API roundtrip, suppress
  // the now-stale tip — they've moved past the gap it was meant to fix.
  const fresh = usePoseTarget.getState().matchResult;
  if (fresh && fresh.state === 'matched') {
    store.setTip(null);
  }
}
