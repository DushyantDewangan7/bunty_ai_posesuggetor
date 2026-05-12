import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { extractTopDeltas } from '../topDeltas.ts';

describe('extractTopDeltas', () => {
  it('maps named indices to friendly joint labels', () => {
    // 26 = right knee, 28 = right ankle.
    const result = extractTopDeltas(
      [26, 28],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0.3],
    );
    assert.equal(result.length, 2);
    assert.equal(result[0]?.joint, 'right knee');
    assert.equal(result[1]?.joint, 'right ankle');
  });

  it('normalizes deviation by MAX_ACCEPTABLE_DISTANCE (1.5) and clamps to 1', () => {
    const distances = new Array<number>(33).fill(0);
    distances[26] = 0.75; // half of 1.5 → 0.5 deviation
    distances[28] = 3.0; // more than 1.5 → clamped to 1.0
    const result = extractTopDeltas([26, 28], distances);
    assert.equal(result[0]?.deviation, 0.5);
    assert.equal(result[1]?.deviation, 1.0);
  });

  it('skips unnamed indices (face/finger detail not coachable)', () => {
    // Index 1 (left eye inner) has no friendly name.
    const distances = new Array<number>(33).fill(0);
    distances[1] = 0.4;
    distances[26] = 0.6;
    const result = extractTopDeltas([1, 26], distances);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.joint, 'right knee');
  });

  it('respects the limit parameter', () => {
    const distances = new Array<number>(33).fill(0.5);
    // 11 named joints in worstJoints, limit=2.
    const result = extractTopDeltas([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27], distances, 2);
    assert.equal(result.length, 2);
  });

  it('returns an empty array when worstJoints is empty', () => {
    assert.deepEqual(extractTopDeltas([], []), []);
  });
});
