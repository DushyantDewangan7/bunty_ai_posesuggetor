import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { SmartSuggestionError } from '../../types/smartSuggestions';

import { parseGeminiResponse } from '../parseResponse.ts';

const LIBRARY_IDS = new Set<string>([
  'tpose',
  'hands-hips',
  'arm-up-right',
  'power-stance',
  'casual-lean',
]);

/** Wrap an inner JSON string into a Gemini envelope. */
function envelope(innerText: string): string {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text: innerText }] } }],
  });
}

function getErrorPayload(err: unknown): SmartSuggestionError {
  if (
    typeof err === 'object' &&
    err !== null &&
    'errorPayload' in err
  ) {
    return (err as { errorPayload: SmartSuggestionError }).errorPayload;
  }
  throw new Error('error did not have errorPayload property');
}

describe('parseGeminiResponse', () => {
  it('parses a valid response with 3 picks', () => {
    const inner = JSON.stringify({
      sceneDescription: 'A man indoors near a window.',
      recommendations: [
        { poseId: 'tpose', reasoning: 'Reset stance', rank: 1 },
        { poseId: 'hands-hips', reasoning: 'Confident classic', rank: 2 },
        { poseId: 'casual-lean', reasoning: 'Relaxed for casual scene', rank: 3 },
      ],
    });
    const result = parseGeminiResponse(envelope(inner), LIBRARY_IDS);
    assert.equal(result.recommendations.length, 3);
    assert.equal(result.recommendations[0]!.poseId, 'tpose');
    assert.equal(result.recommendations[2]!.rank, 3);
    assert.equal(result.sceneDescription, 'A man indoors near a window.');
    assert.equal(result.fromCache, false);
    assert.ok(result.timestamp.length > 0);
  });

  it('drops one hallucinated id but keeps the rest', () => {
    const inner = JSON.stringify({
      recommendations: [
        { poseId: 'tpose', reasoning: 'A', rank: 1 },
        { poseId: 'NOT-IN-LIB', reasoning: 'B', rank: 2 },
        { poseId: 'casual-lean', reasoning: 'C', rank: 3 },
      ],
    });
    const result = parseGeminiResponse(envelope(inner), LIBRARY_IDS);
    assert.equal(result.recommendations.length, 2);
    assert.deepEqual(
      result.recommendations.map((p) => p.poseId),
      ['tpose', 'casual-lean'],
    );
    // Re-ranked contiguously after the drop.
    assert.deepEqual(
      result.recommendations.map((p) => p.rank),
      [1, 2],
    );
  });

  it('throws no-valid-picks when all ids are hallucinated', () => {
    const inner = JSON.stringify({
      recommendations: [
        { poseId: 'fake1', reasoning: 'A', rank: 1 },
        { poseId: 'fake2', reasoning: 'B', rank: 2 },
      ],
    });
    let thrown: unknown;
    try {
      parseGeminiResponse(envelope(inner), LIBRARY_IDS);
    } catch (err) {
      thrown = err;
    }
    assert.equal(getErrorPayload(thrown).type, 'no-valid-picks');
  });

  it('throws parse-error on malformed inner JSON', () => {
    const env = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{not json' }] } }],
    });
    let thrown: unknown;
    try {
      parseGeminiResponse(env, LIBRARY_IDS);
    } catch (err) {
      thrown = err;
    }
    const payload = getErrorPayload(thrown);
    assert.equal(payload.type, 'parse-error');
    if (payload.type === 'parse-error') {
      assert.equal(payload.message, 'invalid_json');
    }
  });

  it('throws parse-error when recommendations field is missing', () => {
    const inner = JSON.stringify({ sceneDescription: 'x' });
    let thrown: unknown;
    try {
      parseGeminiResponse(envelope(inner), LIBRARY_IDS);
    } catch (err) {
      thrown = err;
    }
    const payload = getErrorPayload(thrown);
    assert.equal(payload.type, 'parse-error');
    if (payload.type === 'parse-error') {
      assert.equal(payload.message, 'missing_recommendations');
    }
  });

  it('trims reasoning longer than 200 chars', () => {
    const longReason = 'x'.repeat(500);
    const inner = JSON.stringify({
      recommendations: [
        { poseId: 'tpose', reasoning: longReason, rank: 1 },
      ],
    });
    const result = parseGeminiResponse(envelope(inner), LIBRARY_IDS);
    assert.equal(result.recommendations[0]!.reasoning.length, 200);
  });

  it('re-ranks non-contiguous ranks in array order', () => {
    const inner = JSON.stringify({
      recommendations: [
        { poseId: 'tpose', reasoning: 'A', rank: 5 },
        { poseId: 'hands-hips', reasoning: 'B', rank: 2 },
        { poseId: 'casual-lean', reasoning: 'C', rank: 7 },
      ],
    });
    const result = parseGeminiResponse(envelope(inner), LIBRARY_IDS);
    assert.deepEqual(
      result.recommendations.map((p) => p.rank),
      [1, 2, 3],
    );
    assert.deepEqual(
      result.recommendations.map((p) => p.poseId),
      ['tpose', 'hands-hips', 'casual-lean'],
    );
  });

  it('throws no-valid-picks on empty recommendations array', () => {
    const inner = JSON.stringify({ recommendations: [] });
    let thrown: unknown;
    try {
      parseGeminiResponse(envelope(inner), LIBRARY_IDS);
    } catch (err) {
      thrown = err;
    }
    assert.equal(getErrorPayload(thrown).type, 'no-valid-picks');
  });

  it('throws parse-error on a malformed envelope (no candidates)', () => {
    const env = JSON.stringify({ usage: {} });
    let thrown: unknown;
    try {
      parseGeminiResponse(env, LIBRARY_IDS);
    } catch (err) {
      thrown = err;
    }
    assert.equal(getErrorPayload(thrown).type, 'parse-error');
  });
});
