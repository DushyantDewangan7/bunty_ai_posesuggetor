import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoseLandmark } from '../types/landmarks';
import { normalizePose } from './normalize.ts';

function lm(x: number, y: number, z: number, visibility: number, presence: number): PoseLandmark {
  return { x, y, z, visibility, presence };
}

/**
 * Build a 33-landmark array. Index 11=L shoulder, 12=R shoulder, 23=L hip, 24=R hip.
 * Other indices are filled with sensible defaults at varying positions so the
 * transform actually moves them and tests can detect mistakes.
 */
function buildPose(overrides: Partial<Record<number, PoseLandmark>>): PoseLandmark[] {
  const arr: PoseLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    arr.push(lm(i * 0.01, i * 0.01, 0, 0.95, 0.95));
  }
  for (const [idxStr, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      arr[Number(idxStr)] = value;
    }
  }
  return arr;
}

test('standing pose: hip midpoint becomes origin and shoulder-hip distance becomes 1', () => {
  // Image-space coordinates (0..1). Person standing roughly in the middle of frame.
  // Hips around y=0.6, shoulders around y=0.4 → vertical distance 0.2.
  const raw = buildPose({
    11: lm(0.45, 0.4, 0, 0.99, 0.99), // left shoulder
    12: lm(0.55, 0.4, 0, 0.99, 0.99), // right shoulder
    23: lm(0.46, 0.6, 0, 0.99, 0.99), // left hip
    24: lm(0.54, 0.6, 0, 0.99, 0.99), // right hip
  });

  const norm = normalizePose(raw);
  assert.notStrictEqual(norm, null, 'expected non-null result');
  if (norm === null) return;

  const hipMidNorm = {
    x: (norm[23]!.x + norm[24]!.x) / 2,
    y: (norm[23]!.y + norm[24]!.y) / 2,
    z: (norm[23]!.z + norm[24]!.z) / 2,
  };
  const shoulderMidNorm = {
    x: (norm[11]!.x + norm[12]!.x) / 2,
    y: (norm[11]!.y + norm[12]!.y) / 2,
    z: (norm[11]!.z + norm[12]!.z) / 2,
  };

  const eps = 1e-9;
  assert.ok(Math.abs(hipMidNorm.x) < eps, `hip mid x ≠ 0: ${hipMidNorm.x}`);
  assert.ok(Math.abs(hipMidNorm.y) < eps, `hip mid y ≠ 0: ${hipMidNorm.y}`);
  assert.ok(Math.abs(hipMidNorm.z) < eps, `hip mid z ≠ 0: ${hipMidNorm.z}`);

  const dx = shoulderMidNorm.x - hipMidNorm.x;
  const dy = shoulderMidNorm.y - hipMidNorm.y;
  const dz = shoulderMidNorm.z - hipMidNorm.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  assert.ok(Math.abs(dist - 1.0) < 1e-9, `shoulder-hip distance ≠ 1: ${dist}`);

  // Visibility and presence pass through unchanged.
  assert.strictEqual(norm[11]!.visibility, 0.99);
  assert.strictEqual(norm[23]!.presence, 0.99);
});

test('occluded hips: returns null', () => {
  const raw = buildPose({
    11: lm(0.45, 0.4, 0, 0.99, 0.99),
    12: lm(0.55, 0.4, 0, 0.99, 0.99),
    23: lm(0.46, 0.6, 0, 0.2, 0.2), // left hip occluded
    24: lm(0.54, 0.6, 0, 0.99, 0.99),
  });

  assert.strictEqual(normalizePose(raw), null);
});

test('occluded shoulders: returns null', () => {
  const raw = buildPose({
    11: lm(0.45, 0.4, 0, 0.45, 0.45), // left shoulder just under threshold
    12: lm(0.55, 0.4, 0, 0.99, 0.99),
    23: lm(0.46, 0.6, 0, 0.99, 0.99),
    24: lm(0.54, 0.6, 0, 0.99, 0.99),
  });

  assert.strictEqual(normalizePose(raw), null);
});
