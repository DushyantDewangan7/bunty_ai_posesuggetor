import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import {
  AUTO_TRIGGER_COOLDOWN_MS,
  CLOSE_DURATION_MS,
  MAX_AI_CALLS_PER_POSE_SESSION,
  STUCK_DURATION_MS,
  shouldAutoTrigger,
  useAiCoaching,
} from '../aiCoaching.ts';

// Tests use the real zustand store. Reset before each describe block to keep
// tests independent.
afterEach(() => {
  useAiCoaching.getState().resetSession();
});

describe('aiCoaching: setTip', () => {
  it('sets and reads currentTip', () => {
    useAiCoaching.getState().setTip('Lift your chin');
    assert.equal(useAiCoaching.getState().currentTip, 'Lift your chin');
  });

  it('accepts null to clear', () => {
    useAiCoaching.getState().setTip('Foo');
    useAiCoaching.getState().setTip(null);
    assert.equal(useAiCoaching.getState().currentTip, null);
  });
});

describe('aiCoaching: cache', () => {
  it('addToCache then getCached returns the tip', () => {
    useAiCoaching.getState().addToCache('hashA', 'tipA');
    assert.equal(useAiCoaching.getState().getCached('hashA'), 'tipA');
  });

  it('getCached returns undefined for unknown hash', () => {
    assert.equal(useAiCoaching.getState().getCached('missing'), undefined);
  });

  it('resetSession clears the cache', () => {
    useAiCoaching.getState().addToCache('hashA', 'tipA');
    useAiCoaching.getState().resetSession();
    assert.equal(useAiCoaching.getState().getCached('hashA'), undefined);
  });
});

describe('aiCoaching: call counter', () => {
  it('recordAutoCall increments and stamps cooldown', () => {
    useAiCoaching.getState().recordAutoCall(12345);
    assert.equal(useAiCoaching.getState().callsThisSession, 1);
    assert.equal(useAiCoaching.getState().lastAutoTriggerAt, 12345);
  });

  it('recordManualCall increments WITHOUT stamping cooldown', () => {
    useAiCoaching.getState().recordManualCall();
    assert.equal(useAiCoaching.getState().callsThisSession, 1);
    assert.equal(useAiCoaching.getState().lastAutoTriggerAt, 0);
  });

  it('resetSession zeroes the counter and clears the cooldown', () => {
    useAiCoaching.getState().recordAutoCall(999);
    useAiCoaching.getState().recordManualCall();
    useAiCoaching.getState().resetSession();
    assert.equal(useAiCoaching.getState().callsThisSession, 0);
    assert.equal(useAiCoaching.getState().lastAutoTriggerAt, 0);
  });
});

describe('aiCoaching: updateScoreTimers', () => {
  it('starts stuck timer when score drops below 0.5', () => {
    useAiCoaching.getState().updateScoreTimers(0.4, 1000);
    assert.equal(useAiCoaching.getState().scoreEnteredStuckRangeAt, 1000);
    assert.equal(useAiCoaching.getState().scoreEnteredCloseRangeAt, null);
  });

  it('keeps stuck timer stable across subsequent ticks in range', () => {
    useAiCoaching.getState().updateScoreTimers(0.4, 1000);
    useAiCoaching.getState().updateScoreTimers(0.3, 2000);
    useAiCoaching.getState().updateScoreTimers(0.45, 3000);
    // Same range, no transition — original timestamp preserved.
    assert.equal(useAiCoaching.getState().scoreEnteredStuckRangeAt, 1000);
  });

  it('clears stuck timer when score climbs back above 0.5', () => {
    useAiCoaching.getState().updateScoreTimers(0.4, 1000);
    useAiCoaching.getState().updateScoreTimers(0.6, 2000);
    assert.equal(useAiCoaching.getState().scoreEnteredStuckRangeAt, null);
  });

  it('starts close timer when score enters [0.65, 0.85)', () => {
    useAiCoaching.getState().updateScoreTimers(0.7, 1000);
    assert.equal(useAiCoaching.getState().scoreEnteredCloseRangeAt, 1000);
    assert.equal(useAiCoaching.getState().scoreEnteredStuckRangeAt, null);
  });

  it('clears close timer when score crosses into matched range (>=0.85)', () => {
    useAiCoaching.getState().updateScoreTimers(0.7, 1000);
    useAiCoaching.getState().updateScoreTimers(0.9, 2000);
    assert.equal(useAiCoaching.getState().scoreEnteredCloseRangeAt, null);
  });

  it('clears close timer when score drops below 0.65 (between stuck and close)', () => {
    useAiCoaching.getState().updateScoreTimers(0.7, 1000);
    useAiCoaching.getState().updateScoreTimers(0.6, 2000);
    // 0.6 is below CLOSE_SCORE_MIN (0.65) AND above STUCK_SCORE_BELOW (0.5).
    // Both timers null — no-op middle range.
    assert.equal(useAiCoaching.getState().scoreEnteredCloseRangeAt, null);
    assert.equal(useAiCoaching.getState().scoreEnteredStuckRangeAt, null);
  });
});

describe('shouldAutoTrigger', () => {
  const baseState = {
    callsThisSession: 0,
    lastAutoTriggerAt: 0,
    scoreEnteredStuckRangeAt: null as number | null,
    scoreEnteredCloseRangeAt: null as number | null,
  };

  it('returns false when no timers are active', () => {
    assert.equal(shouldAutoTrigger(baseState, 100_000), false);
  });

  it('returns true when stuck duration exceeded', () => {
    const state = { ...baseState, scoreEnteredStuckRangeAt: 0 };
    assert.equal(shouldAutoTrigger(state, STUCK_DURATION_MS + 1), true);
  });

  it('returns false when stuck duration not yet exceeded', () => {
    const state = { ...baseState, scoreEnteredStuckRangeAt: 0 };
    assert.equal(shouldAutoTrigger(state, STUCK_DURATION_MS - 1), false);
  });

  it('returns true when close duration exceeded', () => {
    const state = { ...baseState, scoreEnteredCloseRangeAt: 0 };
    assert.equal(shouldAutoTrigger(state, CLOSE_DURATION_MS + 1), true);
  });

  it('returns false when call cap is reached, even if a timer is expired', () => {
    const state = {
      ...baseState,
      callsThisSession: MAX_AI_CALLS_PER_POSE_SESSION,
      scoreEnteredStuckRangeAt: 0,
    };
    assert.equal(shouldAutoTrigger(state, STUCK_DURATION_MS + 10_000), false);
  });

  it('returns false during cooldown window after a recent auto-trigger', () => {
    const state = {
      ...baseState,
      lastAutoTriggerAt: 100,
      scoreEnteredStuckRangeAt: 0,
    };
    // Stuck timer expired, but cooldown still active.
    assert.equal(shouldAutoTrigger(state, 100 + AUTO_TRIGGER_COOLDOWN_MS - 1), false);
  });

  it('returns true after cooldown has elapsed and timer expired', () => {
    const state = {
      ...baseState,
      lastAutoTriggerAt: 100,
      scoreEnteredStuckRangeAt: 0,
    };
    // Pick `now` such that BOTH cooldown (relative to lastAutoTriggerAt=100)
    // AND stuck duration (relative to anchor=0) are exceeded.
    const now = STUCK_DURATION_MS + 1; // 15001 — well past both 5s cooldown and 15s stuck window.
    assert.ok(now - state.lastAutoTriggerAt > AUTO_TRIGGER_COOLDOWN_MS);
    assert.ok(now > STUCK_DURATION_MS);
    assert.equal(shouldAutoTrigger(state, now), true);
  });
});
