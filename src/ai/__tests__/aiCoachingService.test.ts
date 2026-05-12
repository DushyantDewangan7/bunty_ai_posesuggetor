import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildCoachingPrompt,
  extractCoachingText,
  generateCoaching,
  type CoachingRequest,
} from '../aiCoachingService.ts';

const baseRequest: CoachingRequest = {
  frameJpegBase64: 'AAAA',
  frameGrayscale: new Uint8Array(32 * 32), // satisfies computePHash's length check
  poseName: 'Casual standing',
  poseId: 'casual-standing',
  fitScore: 0.42,
  topDeltas: [
    { joint: 'left knee', deviation: 0.6 },
    { joint: 'right ankle', deviation: 0.3 },
  ],
};

describe('buildCoachingPrompt', () => {
  it('includes the pose name', () => {
    const out = buildCoachingPrompt(baseRequest);
    assert.match(out, /Casual standing/);
  });

  it('includes the score as a percentage (rounded)', () => {
    const out = buildCoachingPrompt(baseRequest);
    assert.match(out, /42%/);
  });

  it('rounds 0.426 to 43% (banker-agnostic rounding via Math.round)', () => {
    const out = buildCoachingPrompt({ ...baseRequest, fitScore: 0.426 });
    assert.match(out, /43%/);
  });

  it('lists each topDelta joint with its deviation %', () => {
    const out = buildCoachingPrompt(baseRequest);
    assert.match(out, /left knee \(60% off\)/);
    assert.match(out, /right ankle \(30% off\)/);
  });

  it('handles empty topDeltas with "none significant"', () => {
    const out = buildCoachingPrompt({ ...baseRequest, topDeltas: [] });
    assert.match(out, /none significant/);
  });

  it('contains the second-person instruction (style guard)', () => {
    const out = buildCoachingPrompt(baseRequest);
    // "Move your right hand up" is the example — checks the style block is intact.
    assert.match(out, /second-person/);
    assert.match(out, /25 words/);
  });
});

describe('extractCoachingText', () => {
  it('returns the trimmed text from a well-formed Gemini response', () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '  Lift your chin slightly.  ' }] } }],
    });
    assert.equal(extractCoachingText(body), 'Lift your chin slightly.');
  });

  it('returns null on invalid JSON', () => {
    assert.equal(extractCoachingText('not json'), null);
  });

  it('returns null when candidates is missing', () => {
    assert.equal(extractCoachingText(JSON.stringify({ promptFeedback: {} })), null);
  });

  it('returns null when candidates is empty', () => {
    assert.equal(extractCoachingText(JSON.stringify({ candidates: [] })), null);
  });

  it('returns null when text is empty after trim', () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '   ' }] } }],
    });
    assert.equal(extractCoachingText(body), null);
  });

  it('returns null when text is not a string', () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 123 }] } }],
    });
    assert.equal(extractCoachingText(body), null);
  });
});

describe('generateCoaching', () => {
  it('returns null when apiKey is missing', async () => {
    const result = await generateCoaching(baseRequest, { apiKey: '' });
    assert.equal(result, null);
  });

  it('returns null on non-200 response', async () => {
    const fakeFetch = (async () =>
      ({ status: 429, text: async () => '' }) as unknown as Response) as typeof fetch;
    const result = await generateCoaching(baseRequest, {
      apiKey: 'key',
      fetch: fakeFetch,
      computeHash: () => 'deadbeef',
    });
    assert.equal(result, null);
  });

  it('returns null when fetch throws (network error)', async () => {
    const fakeFetch = (async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;
    const result = await generateCoaching(baseRequest, {
      apiKey: 'key',
      fetch: fakeFetch,
      computeHash: () => 'deadbeef',
    });
    assert.equal(result, null);
  });

  it('returns the parsed text + hash + timestamp on success', async () => {
    const fakeFetch = (async () =>
      ({
        status: 200,
        text: async () =>
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: 'Step back two feet for better light.' }] } },
            ],
          }),
      }) as unknown as Response) as typeof fetch;

    const result = await generateCoaching(baseRequest, {
      apiKey: 'key',
      fetch: fakeFetch,
      computeHash: () => 'cafebabe1234567890abcdef00112233',
      now: () => 1_700_000_000_000,
    });
    assert.notEqual(result, null);
    assert.equal(result?.text, 'Step back two feet for better light.');
    assert.equal(result?.frameHash, 'cafebabe1234567890abcdef00112233');
    assert.equal(result?.generatedAt, 1_700_000_000_000);
  });

  it('returns null when the Gemini body is malformed JSON', async () => {
    const fakeFetch = (async () =>
      ({ status: 200, text: async () => 'not json' }) as unknown as Response) as typeof fetch;

    const result = await generateCoaching(baseRequest, {
      apiKey: 'key',
      fetch: fakeFetch,
      computeHash: () => 'deadbeef',
    });
    assert.equal(result, null);
  });

  it('sends an image inline_data part with the request frame', async () => {
    let capturedBody: string | undefined;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return {
        status: 200,
        text: async () =>
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      } as unknown as Response;
    }) as typeof fetch;

    await generateCoaching(baseRequest, {
      apiKey: 'key',
      fetch: fakeFetch,
      computeHash: () => 'd',
    });

    assert.ok(capturedBody, 'fetch should have been called with a body');
    const body = JSON.parse(capturedBody!);
    const parts = body.contents[0].parts;
    assert.equal(parts[1].inline_data.mime_type, 'image/jpeg');
    assert.equal(parts[1].inline_data.data, baseRequest.frameJpegBase64);
  });
});
