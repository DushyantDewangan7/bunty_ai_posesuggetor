import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedPoseFrame, PoseLandmark } from '../types/landmarks';
import { matchPose } from './poseMatch.ts';

function lm(x: number, y: number, z: number, v = 0.95, p = 0.95): PoseLandmark {
  return { x, y, z, visibility: v, presence: p };
}

function buildPose(seed: number): PoseLandmark[] {
  const arr: PoseLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    arr.push(lm(i * 0.03 + seed, i * 0.02 + seed, 0));
  }
  return arr;
}

function frame(landmarks: PoseLandmark[] | null): NormalizedPoseFrame {
  return { landmarks, timestamp: 0, inferenceMs: 0 };
}

test('identical landmarks → fitScore ~1, matched', () => {
  const target = buildPose(0);
  const result = matchPose(target, frame(target));
  assert.ok(result.fitScore > 0.999, `expected fitScore≈1, got ${result.fitScore}`);
  assert.strictEqual(result.state, 'matched');
});

test('all landmarks shifted by 0.1 in x → high fitScore, matched or close', () => {
  const target = buildPose(0);
  const shifted = target.map((p) => ({ ...p, x: p.x + 0.1 }));
  const result = matchPose(target, frame(shifted));
  // Mean distance == 0.1, fitScore == 1 - 0.1/1.5 ≈ 0.933
  assert.ok(result.fitScore > 0.9 && result.fitScore < 1.0);
  assert.ok(result.state === 'matched' || result.state === 'close');
});

test('completely different pose → low fitScore, far', () => {
  const target = buildPose(0);
  // Large random-ish offset of ~2 canonical units per landmark.
  const wrong = target.map((p, i) => ({
    ...p,
    x: p.x + (i % 2 === 0 ? 1.5 : -1.5),
    y: p.y + 1.2,
  }));
  const result = matchPose(target, frame(wrong));
  assert.ok(result.fitScore < FAR_THRESHOLD, `expected fitScore<0.5, got ${result.fitScore}`);
  assert.strictEqual(result.state, 'far');
});

test('null current frame → fitScore 0, far', () => {
  const target = buildPose(0);
  const result = matchPose(target, frame(null));
  assert.strictEqual(result.fitScore, 0);
  assert.strictEqual(result.state, 'far');
});

test('worstJoints: returns 3 indices, sorted by weighted distance descending', () => {
  const target = buildPose(0);
  const current = target.map((p) => ({ ...p }));
  // Inject large displacement on three known joints with different magnitudes.
  current[14] = { ...current[14]!, x: current[14]!.x + 2.0 }; // largest
  current[16] = { ...current[16]!, x: current[16]!.x + 1.5 };
  current[15] = { ...current[15]!, x: current[15]!.x + 1.0 };

  const result = matchPose(target, frame(current));
  assert.strictEqual(result.worstJoints.length, 3);
  assert.strictEqual(result.worstJoints[0], 14);
  assert.strictEqual(result.worstJoints[1], 16);
  assert.strictEqual(result.worstJoints[2], 15);
});

test('low-visibility landmark contributes less to mean distance', () => {
  const target = buildPose(0);
  const a = target.map((p) => ({ ...p }));
  const b = target.map((p) => ({ ...p }));
  // Same offset on landmark 14 in both frames, but b marks it occluded.
  a[14] = { ...a[14]!, x: a[14]!.x + 1.0, visibility: 0.9 };
  b[14] = { ...b[14]!, x: b[14]!.x + 1.0, visibility: 0.05 };

  const ra = matchPose(target, frame(a));
  const rb = matchPose(target, frame(b));
  // Occluded variant should score higher (distance discounted by low weight).
  assert.ok(rb.fitScore > ra.fitScore, `occluded fit ${rb.fitScore} <= visible fit ${ra.fitScore}`);
});

const FAR_THRESHOLD = 0.5;
