import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { computeBodyBBox } from '../bodyBoundingBox.ts';
import type { PoseLandmark } from '../../../types/landmarks.ts';

const VIS = 0.9;
const HIDDEN = 0.1;

function makeLandmarks(
  overrides: Partial<Record<number, Partial<PoseLandmark>>> = {},
): PoseLandmark[] {
  // Default upright body in normalized [0..1] frame coords.
  // Anatomically consistent: hip-to-knee distance equals knee-to-ankle (0.175),
  // so the extrapolation knee_y + (knee_y - hip_y) lands exactly on the real
  // ankle when ankles are visible.
  // Foot landmarks (29–32) sit at y=0.95 — 5% below the ankle joint at 0.90,
  // matching the anatomy that motivated bringing them into the bbox compute.
  const base: Record<number, Partial<PoseLandmark>> = {
    0: { x: 0.5, y: 0.2 }, // nose
    11: { x: 0.4, y: 0.35 }, // left shoulder
    12: { x: 0.6, y: 0.35 }, // right shoulder
    13: { x: 0.35, y: 0.5 }, // left elbow
    14: { x: 0.65, y: 0.5 }, // right elbow
    15: { x: 0.32, y: 0.6 }, // left wrist
    16: { x: 0.68, y: 0.6 }, // right wrist
    23: { x: 0.45, y: 0.55 }, // left hip
    24: { x: 0.55, y: 0.55 }, // right hip
    25: { x: 0.45, y: 0.725 }, // left knee
    26: { x: 0.55, y: 0.725 }, // right knee
    27: { x: 0.45, y: 0.9 }, // left ankle
    28: { x: 0.55, y: 0.9 }, // right ankle
    29: { x: 0.45, y: 0.95 }, // left heel
    30: { x: 0.55, y: 0.95 }, // right heel
    31: { x: 0.45, y: 0.95 }, // left foot index (toe tip)
    32: { x: 0.55, y: 0.95 }, // right foot index (toe tip)
  };
  const out: PoseLandmark[] = Array.from({ length: 33 }, (_, i) => {
    const b = base[i] ?? {};
    const o = overrides[i] ?? {};
    return {
      x: o.x ?? b.x ?? 0.5,
      y: o.y ?? b.y ?? 0.5,
      z: o.z ?? 0,
      visibility: o.visibility ?? VIS,
      presence: o.presence ?? VIS,
    };
  });
  return out;
}

// Convenience: hide all four foot landmarks so a test focused on
// ankle/knee/hip behavior isn't dominated by feet at y=0.95.
const HIDE_FEET = {
  29: { visibility: HIDDEN },
  30: { visibility: HIDDEN },
  31: { visibility: HIDDEN },
  32: { visibility: HIDDEN },
};

describe('computeBodyBBox', () => {
  it('returns isValid=false with default center for null/undefined input', () => {
    const a = computeBodyBBox(null);
    const b = computeBodyBBox(undefined);
    assert.equal(a.isValid, false);
    assert.equal(a.centerX, 0.5);
    assert.equal(a.centerY, 0.5);
    assert.equal(a.height, 0);
    assert.equal(b.isValid, false);
  });

  it('returns isValid=false for short landmark arrays', () => {
    const r = computeBodyBBox(makeLandmarks().slice(0, 20));
    assert.equal(r.isValid, false);
    assert.equal(r.centerX, 0.5);
    assert.equal(r.centerY, 0.5);
  });

  it('full upright body: bbox extends to foot landmarks, not just ankle joints', () => {
    const r = computeBodyBBox(makeLandmarks());
    assert.equal(r.isValid, true);
    // Visible body extent: minY = nose (0.20), maxY = foot landmarks (0.95).
    // centerY = (0.20 + 0.95) / 2 = 0.575.
    assert.ok(Math.abs(r.centerY - 0.575) < 1e-9);
    // Visible body extent on X: minX = wrist (0.32), maxX = wrist (0.68).
    // centerX = (0.32 + 0.68) / 2 = 0.50.
    assert.ok(Math.abs(r.centerX - 0.5) < 1e-9);
    // raw = 0.75, padded = 0.75 * 1.10 = 0.825.
    assert.ok(Math.abs(r.height - 0.75 * 1.1) < 1e-9);
  });

  it('partial body (lower body fully occluded): bbox tightens to upper body but stays valid', () => {
    const lms = makeLandmarks({
      13: { visibility: HIDDEN },
      14: { visibility: HIDDEN },
      15: { visibility: HIDDEN },
      16: { visibility: HIDDEN },
      25: { visibility: HIDDEN },
      26: { visibility: HIDDEN },
      27: { visibility: HIDDEN },
      28: { visibility: HIDDEN },
      ...HIDE_FEET,
    });
    const r = computeBodyBBox(lms);
    assert.equal(r.isValid, true);
    // Now bottommost visible is hips (y=0.55), topmost is nose (y=0.20).
    // centerY = (0.20 + 0.55) / 2 = 0.375.
    assert.ok(Math.abs(r.centerY - 0.375) < 1e-9);
    // Padded height = 0.35 * 1.10 = 0.385.
    assert.ok(Math.abs(r.height - 0.35 * 1.1) < 1e-9);
  });

  it('isValid=false when nose is missing (anchor requirement)', () => {
    const r = computeBodyBBox(makeLandmarks({ 0: { visibility: HIDDEN } }));
    assert.equal(r.isValid, false);
    assert.equal(r.centerX, 0.5);
  });

  it('isValid=false when both shoulders are missing (anchor requirement)', () => {
    const r = computeBodyBBox(
      makeLandmarks({
        11: { visibility: HIDDEN },
        12: { visibility: HIDDEN },
      }),
    );
    assert.equal(r.isValid, false);
  });

  it('isValid=false when both hips are missing (anchor requirement)', () => {
    const r = computeBodyBBox(
      makeLandmarks({
        23: { visibility: HIDDEN },
        24: { visibility: HIDDEN },
      }),
    );
    assert.equal(r.isValid, false);
  });

  it('isValid=true with minimum anchors (nose + one shoulder + one hip + 2 more)', () => {
    // Hide left shoulder, left hip, all elbows, all wrists, all knees, all ankles, all feet.
    // Visible: nose (0), right shoulder (12), right hip (24) — only 3 — still need 2 more.
    // Keep one knee and one ankle visible to reach 5 total.
    const lms = makeLandmarks({
      11: { visibility: HIDDEN },
      13: { visibility: HIDDEN },
      14: { visibility: HIDDEN },
      15: { visibility: HIDDEN },
      16: { visibility: HIDDEN },
      23: { visibility: HIDDEN },
      25: { visibility: HIDDEN },
      27: { visibility: HIDDEN },
      ...HIDE_FEET,
    });
    const r = computeBodyBBox(lms);
    assert.equal(r.isValid, true);
  });

  it('isValid=false when fewer than 5 body points are visible', () => {
    // Only nose + one shoulder + one hip visible (3 points).
    const lms = makeLandmarks({
      11: { visibility: HIDDEN },
      13: { visibility: HIDDEN },
      14: { visibility: HIDDEN },
      15: { visibility: HIDDEN },
      16: { visibility: HIDDEN },
      23: { visibility: HIDDEN },
      25: { visibility: HIDDEN },
      26: { visibility: HIDDEN },
      27: { visibility: HIDDEN },
      28: { visibility: HIDDEN },
      ...HIDE_FEET,
    });
    const r = computeBodyBBox(lms);
    assert.equal(r.isValid, false);
  });

  it('isValid=false when padded body height is below 10% of frame', () => {
    // Tiny body — every landmark crammed into y=[0.48..0.55]. Anchors visible.
    const lms = makeLandmarks({
      0: { y: 0.48 },
      11: { y: 0.5 },
      12: { y: 0.5 },
      13: { y: 0.51 },
      14: { y: 0.51 },
      15: { y: 0.52 },
      16: { y: 0.52 },
      23: { y: 0.53 },
      24: { y: 0.53 },
      25: { y: 0.54 },
      26: { y: 0.54 },
      27: { y: 0.55 },
      28: { y: 0.55 },
      29: { y: 0.55 },
      30: { y: 0.55 },
      31: { y: 0.55 },
      32: { y: 0.55 },
    });
    const r = computeBodyBBox(lms);
    // raw = 0.07, padded = 0.077 < 0.1 → invalid
    assert.equal(r.isValid, false);
  });

  it('uses the visible foot landmarks when one ankle is hidden', () => {
    // Hide left ankle entirely; right ankle + all feet remain default visible.
    // Feet at y=0.95 dominate the bbox bottom either way.
    const r = computeBodyBBox(makeLandmarks({ 27: { visibility: HIDDEN } }));
    assert.equal(r.isValid, true);
    assert.ok(Math.abs(r.centerY - 0.575) < 1e-9);
    assert.ok(Math.abs(r.height - 0.75 * 1.1) < 1e-9);
  });

  it('extends to whichever foot/ankle is lower (max y) when all visible', () => {
    // Push right foot/toe to y=0.98 to verify the bbox tracks the lowest point.
    const r = computeBodyBBox(
      makeLandmarks({
        30: { y: 0.98 },
        32: { y: 0.98 },
      }),
    );
    assert.equal(r.isValid, true);
    // maxY = 0.98, minY = nose 0.20.
    // centerY = (0.20 + 0.98)/2 = 0.59.
    assert.ok(Math.abs(r.centerY - 0.59) < 1e-9);
    // raw = 0.78, padded = 0.78 * 1.10 = 0.858.
    assert.ok(Math.abs(r.height - 0.78 * 1.1) < 1e-9);
  });

  it('feet visible at moderate confidence (0.6) and ankles also visible: bbox extends to feet', () => {
    // Realistic case: feet at 0.6 confidence pass the 0.5 threshold and
    // contribute their lower y to the bbox. Ankles are also visible.
    const r = computeBodyBBox(
      makeLandmarks({
        29: { visibility: 0.6 },
        30: { visibility: 0.6 },
        31: { visibility: 0.6 },
        32: { visibility: 0.6 },
      }),
    );
    assert.equal(r.isValid, true);
    // Feet at y=0.95 dominate the bottom; bbox same as full-body baseline.
    assert.ok(Math.abs(r.centerY - 0.575) < 1e-9);
    assert.ok(Math.abs(r.height - 0.75 * 1.1) < 1e-9);
  });

  it('ankle visible, feet missing: synthetic foot point extends bbox past ankle', () => {
    // Common case on-device: MediaPipe is confident about the ankle joint
    // (≥0.5) but the foot landmarks live below the relaxed 0.3 threshold.
    // effectiveFootPoint should fall back to ankle.y + foot_extension so the
    // bbox reaches the shoe bottom rather than terminating at the ankle.
    const r = computeBodyBBox(makeLandmarks(HIDE_FEET));
    assert.equal(r.isValid, true);
    // foot_extension = thigh (0.175) * 0.25 = 0.04375 → foot_y = 0.94375.
    assert.ok(Math.abs(r.centerY - (0.2 + 0.94375) / 2) < 1e-9);
    assert.ok(Math.abs(r.height - (0.94375 - 0.2) * 1.1) < 1e-9);
  });

  it('feet invisible, ankles low-confidence: extrapolated ankle + foot extension', () => {
    // Feet < relaxed threshold AND ankles < base threshold → BODY_INDICES
    // drops the ankles too. effectiveFootPoint extrapolates from hip + knee,
    // then adds foot extension on top so the synthetic point lands at the
    // shoe bottom, not the ankle.
    const r = computeBodyBBox(
      makeLandmarks({
        27: { visibility: 0.3 },
        28: { visibility: 0.3 },
        ...HIDE_FEET,
      }),
    );
    assert.equal(r.isValid, true);
    // extrap_ankle = 0.90, foot_extension = 0.04375 → foot_y = 0.94375.
    assert.ok(Math.abs(r.centerY - (0.2 + 0.94375) / 2) < 1e-9);
    assert.ok(Math.abs(r.height - (0.94375 - 0.2) * 1.1) < 1e-9);
  });

  it('feet AND ankles all invisible: extrapolation + foot extension still fires', () => {
    const r = computeBodyBBox(
      makeLandmarks({
        27: { visibility: HIDDEN },
        28: { visibility: HIDDEN },
        ...HIDE_FEET,
      }),
    );
    assert.equal(r.isValid, true);
    assert.ok(Math.abs(r.centerY - (0.2 + 0.94375) / 2) < 1e-9);
    assert.ok(Math.abs(r.height - (0.94375 - 0.2) * 1.1) < 1e-9);
  });

  it('feet, ankles, AND knees all invisible: bbox tightens to hips (extrapolation needs knees)', () => {
    const lms = makeLandmarks({
      25: { visibility: HIDDEN },
      26: { visibility: HIDDEN },
      27: { visibility: HIDDEN },
      28: { visibility: HIDDEN },
      ...HIDE_FEET,
    });
    const r = computeBodyBBox(lms);
    assert.equal(r.isValid, true);
    // Bottommost visible is wrists (y=0.60) — wrists are below hips (0.55).
    // centerY = (0.20 + 0.60)/2 = 0.40.
    assert.ok(Math.abs(r.centerY - 0.4) < 1e-9);
    // raw = 0.40, padded = 0.40 * 1.10 = 0.44.
    assert.ok(Math.abs(r.height - 0.4 * 1.1) < 1e-9);
  });

  it('rejects degenerate extrapolation when hip.y >= knee.y (sanity check)', () => {
    // Hip and knee at the same y → extrapolated ankle would land at knee.y
    // (no extension), which fails the "below knee" sanity check.
    const lms = makeLandmarks({
      25: { y: 0.55 }, // left knee at hip height — degenerate
      26: { y: 0.55 }, // right knee at hip height — degenerate
      27: { visibility: HIDDEN },
      28: { visibility: HIDDEN },
      ...HIDE_FEET,
    });
    const r = computeBodyBBox(lms);
    assert.equal(r.isValid, true);
    // Bottommost visible y = wrists 0.60 (knees 0.55 == hips 0.55), top = nose 0.20.
    // centerY = (0.20 + 0.60)/2 = 0.40, raw = 0.40, padded = 0.44.
    assert.ok(Math.abs(r.centerY - 0.4) < 1e-9);
    assert.ok(Math.abs(r.height - 0.4 * 1.1) < 1e-9);
  });
});
