import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  applyMissingUpdate,
  applyValidUpdate,
  createInitialTransform,
  lerp,
} from '../outlineSmoothing.ts';

describe('createInitialTransform', () => {
  it('starts at center, scale 1, opacity 0, no last-update timestamp', () => {
    const t = createInitialTransform();
    assert.equal(t.centerX, 0.5);
    assert.equal(t.centerY, 0.5);
    assert.equal(t.scale, 1.0);
    assert.equal(t.opacity, 0);
    assert.equal(t.lastUpdateTimestamp, 0);
  });
});

describe('lerp', () => {
  it('lerp(0,100,0.3) = 30', () => {
    assert.ok(Math.abs(lerp(0, 100, 0.3) - 30) < 1e-9);
  });
  it('lerp(50,100,0.5) = 75', () => {
    assert.ok(Math.abs(lerp(50, 100, 0.5) - 75) < 1e-9);
  });
  it('lerp(a,b,0) = a', () => {
    assert.equal(lerp(7, 11, 0), 7);
  });
  it('lerp(a,b,1) = b', () => {
    assert.equal(lerp(7, 11, 1), 11);
  });
});

describe('applyValidUpdate', () => {
  it('moves each value toward the target by ALPHA (0.3)', () => {
    let t = createInitialTransform();
    t = applyValidUpdate(t, { centerX: 1.0, centerY: 1.0, scale: 2.0 }, 1000);
    // After one step: cx = lerp(0.5, 1.0, 0.3) = 0.65, scale = lerp(1, 2, 0.3) = 1.3, opacity = lerp(0,1,0.3)=0.3
    assert.ok(Math.abs(t.centerX - 0.65) < 1e-9);
    assert.ok(Math.abs(t.centerY - 0.65) < 1e-9);
    assert.ok(Math.abs(t.scale - 1.3) < 1e-9);
    assert.ok(Math.abs(t.opacity - 0.3) < 1e-9);
    assert.equal(t.lastUpdateTimestamp, 1000);
  });

  it('converges toward the target after 10 updates (error ratio ≈ 0.7^10 ≈ 0.028)', () => {
    let t = createInitialTransform();
    const target = { centerX: 1.0, centerY: 1.0, scale: 2.0 };
    for (let i = 0; i < 10; i++) {
      t = applyValidUpdate(t, target, 1000 + i * 33);
    }
    // Initial centerX = 0.5; target = 1.0; remaining error = 0.5 * 0.7^10 ≈ 0.0141
    const expectedRemaining = 0.5 * Math.pow(0.7, 10);
    assert.ok(Math.abs(t.centerX - (1.0 - expectedRemaining)) < 1e-9);
    // Opacity: starts 0, target 1, remaining = 1.0 * 0.7^10 ≈ 0.028
    const expectedOpacityRemaining = 1.0 * Math.pow(0.7, 10);
    assert.ok(Math.abs(t.opacity - (1.0 - expectedOpacityRemaining)) < 1e-9);
  });
});

describe('applyMissingUpdate', () => {
  it('is a no-op when there has never been a valid update (lastUpdateTimestamp=0)', () => {
    const t0 = createInitialTransform();
    const t1 = applyMissingUpdate(t0, 5000);
    assert.equal(t1, t0);
    assert.equal(t1.opacity, 0);
  });

  it('holds opacity steady when within HOLD_MS (800ms) of last valid update', () => {
    let t = createInitialTransform();
    t = applyValidUpdate(t, { centerX: 1.0, centerY: 1.0, scale: 1.5 }, 1000);
    const opacityAfterValid = t.opacity;
    // Five missing updates within HOLD_MS
    for (let i = 0; i < 5; i++) {
      t = applyMissingUpdate(t, 1000 + (i + 1) * 100); // up to t=1500ms (elapsed=500ms < 800ms)
    }
    assert.equal(t.opacity, opacityAfterValid);
    assert.equal(t.centerX, 0.65); // unchanged
  });

  it('linearly fades opacity during the FADE_MS window', () => {
    let t = createInitialTransform();
    t = applyValidUpdate(t, { centerX: 1.0, centerY: 1.0, scale: 1.5 }, 1000);
    // Bring opacity up to 1 by repeated valid updates so we have a known baseline.
    for (let i = 0; i < 20; i++) {
      t = applyValidUpdate(t, { centerX: 1.0, centerY: 1.0, scale: 1.5 }, 1000 + i);
    }
    assert.ok(t.opacity > 0.999);
    const lastValid = t.lastUpdateTimestamp;

    // Halfway through FADE: elapsed = HOLD_MS + 150 = 950ms → fadeProgress=0.5 → opacity=0.5
    const tHalfway = applyMissingUpdate(t, lastValid + 800 + 150);
    assert.ok(Math.abs(tHalfway.opacity - 0.5) < 1e-3);
    // 1/3 of the way: fadeProgress=100/300, opacity=1-0.333=0.667
    const tThird = applyMissingUpdate(t, lastValid + 800 + 100);
    assert.ok(Math.abs(tThird.opacity - (1 - 100 / 300)) < 1e-3);
  });

  it('returns opacity=0 once past HOLD_MS + FADE_MS', () => {
    let t = createInitialTransform();
    t = applyValidUpdate(t, { centerX: 1.0, centerY: 1.0, scale: 1.5 }, 1000);
    const lastValid = t.lastUpdateTimestamp;
    const tFar = applyMissingUpdate(t, lastValid + 5000);
    assert.equal(tFar.opacity, 0);
  });

  it('preserves centerX/centerY/scale during hold and fade', () => {
    let t = createInitialTransform();
    t = applyValidUpdate(t, { centerX: 1.0, centerY: 1.0, scale: 1.5 }, 1000);
    const cx = t.centerX;
    const cy = t.centerY;
    const s = t.scale;
    const tHold = applyMissingUpdate(t, 1300); // within hold
    const tFade = applyMissingUpdate(t, 1900); // within fade
    const tDone = applyMissingUpdate(t, 5000); // past
    assert.equal(tHold.centerX, cx);
    assert.equal(tFade.centerX, cx);
    assert.equal(tDone.centerX, cx);
    assert.equal(tHold.centerY, cy);
    assert.equal(tFade.scale, s);
    assert.equal(tDone.scale, s);
  });
});
