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
  // Top (nose) at y=0.20, feet (ankles) at y=0.90, full extent = 0.70.
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
    25: { x: 0.45, y: 0.75 }, // left knee
    26: { x: 0.55, y: 0.75 }, // right knee
    27: { x: 0.45, y: 0.9 }, // left ankle
    28: { x: 0.55, y: 0.9 }, // right ankle
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

  it('full upright body: centerY = midpoint of topmost and bottommost visible body landmark', () => {
    const r = computeBodyBBox(makeLandmarks());
    assert.equal(r.isValid, true);
    // Visible body extent: minY = nose (0.20), maxY = ankles (0.90).
    // centerY = (0.20 + 0.90) / 2 = 0.55.
    assert.ok(Math.abs(r.centerY - 0.55) < 1e-9);
    // Visible body extent: minX = wrist (0.32), maxX = wrist (0.68).
    // centerX = (0.32 + 0.68) / 2 = 0.50.
    assert.ok(Math.abs(r.centerX - 0.5) < 1e-9);
    // raw = 0.70, padded = 0.70 * 1.15 = 0.805.
    assert.ok(Math.abs(r.height - 0.7 * 1.15) < 1e-9);
  });

  it('partial body (knees/ankles + arms occluded): bbox tightens to upper body but stays valid', () => {
    const lms = makeLandmarks({
      13: { visibility: HIDDEN },
      14: { visibility: HIDDEN },
      15: { visibility: HIDDEN },
      16: { visibility: HIDDEN },
      25: { visibility: HIDDEN },
      26: { visibility: HIDDEN },
      27: { visibility: HIDDEN },
      28: { visibility: HIDDEN },
    });
    const r = computeBodyBBox(lms);
    assert.equal(r.isValid, true);
    // Now bottommost visible is hips (y=0.55), topmost is nose (y=0.20).
    // centerY = (0.20 + 0.55) / 2 = 0.375.
    assert.ok(Math.abs(r.centerY - 0.375) < 1e-9);
    // Padded height = 0.35 * 1.15 = 0.4025.
    assert.ok(Math.abs(r.height - 0.35 * 1.15) < 1e-9);
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
    // Hide left shoulder, left hip, all elbows, all wrists, all knees, all ankles.
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
    });
    const r = computeBodyBBox(lms);
    // raw = 0.07, padded = 0.0805 < 0.1 → invalid
    assert.equal(r.isValid, false);
  });

  it('uses the visible ankle when the other ankle is hidden', () => {
    // Hide left ankle entirely, keep right ankle at y=0.90 (default).
    const r = computeBodyBBox(makeLandmarks({ 27: { visibility: HIDDEN } }));
    assert.equal(r.isValid, true);
    // bottommost visible y is right ankle (0.90). topmost is nose (0.20).
    assert.ok(Math.abs(r.centerY - 0.55) < 1e-9);
    assert.ok(Math.abs(r.height - 0.7 * 1.15) < 1e-9);
  });

  it('extends to whichever ankle is lower (max y) when both visible', () => {
    const r = computeBodyBBox(
      makeLandmarks({
        27: { y: 0.85 },
        28: { y: 0.95 },
      }),
    );
    assert.equal(r.isValid, true);
    // bottommost visible y = 0.95, topmost = nose 0.20.
    // centerY = (0.20 + 0.95)/2 = 0.575
    assert.ok(Math.abs(r.centerY - 0.575) < 1e-9);
    // padded = 0.75 * 1.15 = 0.8625
    assert.ok(Math.abs(r.height - 0.75 * 1.15) < 1e-9);
  });
});
