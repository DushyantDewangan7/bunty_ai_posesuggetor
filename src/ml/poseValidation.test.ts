import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoseFrame, PoseLandmark } from '../types/landmarks';
import { validateForCapture } from './poseValidation.ts';

function lm(visibility: number): PoseLandmark {
  return { x: 0.5, y: 0.5, z: 0, visibility, presence: visibility };
}

function buildFrame(visibilities: number[]): PoseFrame {
  return {
    landmarks: visibilities.map(lm),
    timestamp: 0,
    inferenceMs: 0,
  };
}

function allVisible(): number[] {
  return Array(33).fill(0.99);
}

test('null frame is invalid', () => {
  const result = validateForCapture(null);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.visibleCount, 0);
  assert.strictEqual(result.reason, 'No pose detected');
});

test('frame with null landmarks is invalid', () => {
  const frame: PoseFrame = { landmarks: null, timestamp: 0, inferenceMs: 0 };
  const result = validateForCapture(frame);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.visibleCount, 0);
  assert.strictEqual(result.reason, 'No pose detected');
});

test('all 33 landmarks at visibility 0.99 is valid', () => {
  const frame = buildFrame(allVisible());
  const result = validateForCapture(frame);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.visibleCount, 33);
  assert.strictEqual(result.reason, undefined);
});

test('25 of 33 visible is invalid with correct count', () => {
  const visibilities = allVisible();
  // Drop visibility on 8 landmarks (indices 25-32, none of which are anchors)
  for (let i = 25; i < 33; i++) {
    visibilities[i] = 0.1;
  }
  const frame = buildFrame(visibilities);
  const result = validateForCapture(frame);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.visibleCount, 25);
  assert.match(result.reason ?? '', /25\/33/);
});

test('31 visible but hip 23 occluded fails on anchor check', () => {
  const visibilities = allVisible();
  // Knock out 2 non-anchor landmarks to keep visibleCount at 31
  visibilities[27] = 0.1;
  visibilities[28] = 0.1;
  // Now occlude hip 23 — visibleCount drops to 30 (>= 30 threshold passes),
  // but anchor check must fail.
  visibilities[23] = 0.2;
  const frame = buildFrame(visibilities);
  const result = validateForCapture(frame);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.visibleCount, 30);
  assert.strictEqual(result.reason, 'Hip or shoulder anchors not visible');
});
