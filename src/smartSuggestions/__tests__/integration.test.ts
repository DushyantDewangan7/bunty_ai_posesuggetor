import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type {
  PoseMetadataForAgent,
  SmartSuggestionError,
  SmartSuggestionRequest,
  SmartSuggestionResult,
} from '../../types/smartSuggestions';
import type { UserProfile } from '../../types/userProfile';
import { SmartSuggestionsCache } from '../cache.ts';
import {
  type SmartSuggestionsFlowDeps,
  type SmartSuggestionsFlowInput,
  runSmartSuggestionsFlow,
} from '../orchestrate.ts';
import { parseGeminiResponse } from '../parseResponse.ts';
import { type RateLimiterStorage, SmartSuggestionsRateLimiter } from '../rateLimiter.ts';

// Fixed inputs the integration tests share. Uses a small library so each test
// can exercise the hallucination filter without dragging the full pose
// library (and React Native deps) into the Node test graph.
const LIBRARY: PoseMetadataForAgent[] = [
  {
    id: 'tpose',
    name: 'T-Pose',
    category: 'standing',
    tags: ['neutral'],
    difficulty: 1,
    genderOrientation: 'neutral',
    moodTags: ['confident'],
    useCase: ['casual'],
    lightingRecommendation: 'any',
    locationType: 'any',
  },
  {
    id: 'hands-hips',
    name: 'Hands on Hips',
    category: 'standing',
    tags: ['classic'],
    difficulty: 1,
    genderOrientation: 'neutral',
    moodTags: ['confident'],
    useCase: ['casual'],
    lightingRecommendation: 'any',
    locationType: 'any',
  },
  {
    id: 'casual-lean',
    name: 'Casual Lean',
    category: 'standing',
    tags: ['relaxed'],
    difficulty: 2,
    genderOrientation: 'neutral',
    moodTags: ['playful'],
    useCase: ['casual'],
    lightingRecommendation: 'soft',
    locationType: 'indoor',
  },
];

const LIBRARY_IDS = new Set(LIBRARY.map((p) => p.id));

const PROFILE: UserProfile = {
  version: 1,
  onboardingComplete: true,
  onboardedAt: '2026-05-01T00:00:00.000Z',
  gender: 'female',
  heightBucket: 'medium',
  faceShape: 'oval',
  bodyType: 'unspecified',
};

function makeInput(hashSeed = 'a'): SmartSuggestionsFlowInput {
  // The bytes themselves don't matter — tests override computeHash to return a
  // known string keyed off the seed.
  return {
    frameBase64: `frame-${hashSeed}`,
    grayscale: new Uint8Array(32 * 32),
    profile: PROFILE,
    libraryMetadata: LIBRARY,
    libraryIds: LIBRARY_IDS,
    shownPoseIds: [],
  };
}

function envelope(innerObj: unknown): string {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(innerObj) }] } }],
  });
}

function validResponse(): string {
  return envelope({
    sceneDescription: 'Indoor scene near a window.',
    recommendations: [
      { poseId: 'tpose', reasoning: 'Good neutral starter', rank: 1 },
      { poseId: 'hands-hips', reasoning: 'Confident classic', rank: 2 },
      { poseId: 'casual-lean', reasoning: 'Soft natural lighting fits this lean', rank: 3 },
    ],
  });
}

function makeFakeStorage(): RateLimiterStorage {
  const map = new Map<string, string | number>();
  return {
    getString: (k) => {
      const v = map.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (k) => {
      const v = map.get(k);
      return typeof v === 'number' ? v : undefined;
    },
    set: (k, v) => {
      map.set(k, v);
    },
  };
}

interface CountingApi {
  callGemini: (request: SmartSuggestionRequest) => Promise<string>;
  callCount: () => number;
}

function makeCountingApi(rawResponse: string | (() => string)): CountingApi {
  let count = 0;
  return {
    callGemini: async () => {
      count += 1;
      return typeof rawResponse === 'function' ? rawResponse() : rawResponse;
    },
    callCount: () => count,
  };
}

function getErrorPayload(err: unknown): SmartSuggestionError {
  if (typeof err === 'object' && err !== null && 'errorPayload' in err) {
    return (err as { errorPayload: SmartSuggestionError }).errorPayload;
  }
  throw new Error('error did not have errorPayload property');
}

function makeDeps(
  cache: SmartSuggestionsCache,
  limiter: SmartSuggestionsRateLimiter,
  api: CountingApi,
  hash = 'aaaaaaaaaaaaaaaa',
): SmartSuggestionsFlowDeps {
  return {
    cache,
    rateLimiter: limiter,
    callGemini: api.callGemini,
    parseResponse: parseGeminiResponse,
    computeHash: () => hash,
  };
}

describe('smartSuggestions integration', () => {
  it('full happy path: build → call → parse → cache store → cache lookup', async () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    const api = makeCountingApi(validResponse());
    const hash = '0123456789abcdef';
    const deps = makeDeps(cache, limiter, api, hash);

    const first = await runSmartSuggestionsFlow(makeInput(), deps);
    assert.equal(first.fromCache, false);
    assert.equal(first.recommendations.length, 3);
    assert.equal(first.recommendations[0]!.poseId, 'tpose');
    assert.equal(api.callCount(), 1);

    // Second call same hash → cache hit, no further API call, fromCache flips.
    const second = await runSmartSuggestionsFlow(makeInput(), deps);
    assert.equal(second.fromCache, true);
    assert.equal(api.callCount(), 1);
    assert.deepEqual(
      second.recommendations.map((r) => r.poseId),
      first.recommendations.map((r) => r.poseId),
    );
  });

  it('cache hit avoids API call', async () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    const api = makeCountingApi(validResponse());
    const hash = 'cafebabecafebabe';
    const seeded: SmartSuggestionResult = {
      recommendations: [{ poseId: 'tpose', reasoning: 'seeded', rank: 1 }],
      sceneDescription: 'seeded',
      fromCache: false,
      timestamp: '2026-05-06T09:59:00.000Z',
    };
    cache.store(hash, seeded);

    const result = await runSmartSuggestionsFlow(makeInput(), makeDeps(cache, limiter, api, hash));
    assert.equal(api.callCount(), 0);
    assert.equal(result.fromCache, true);
    assert.equal(result.recommendations[0]!.reasoning, 'seeded');
  });

  it('cache miss + rate limit allowed → API path increments quota', async () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    const api = makeCountingApi(validResponse());
    assert.equal(limiter.status().currentCount, 0);

    await runSmartSuggestionsFlow(makeInput(), makeDeps(cache, limiter, api));

    assert.equal(api.callCount(), 1);
    assert.equal(limiter.status().currentCount, 1);
  });

  it('cache hit does NOT consume rate limit quota', async () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    const api = makeCountingApi(validResponse());
    const hash = 'feedfacefeedface';
    cache.store(hash, {
      recommendations: [{ poseId: 'tpose', reasoning: 'cached', rank: 1 }],
      fromCache: false,
      timestamp: '2026-05-06T09:00:00.000Z',
    });

    const result = await runSmartSuggestionsFlow(makeInput(), makeDeps(cache, limiter, api, hash));

    assert.equal(result.fromCache, true);
    assert.equal(limiter.status().currentCount, 0);
    assert.equal(api.callCount(), 0);
  });

  it('rate limit cap blocks API call and returns rate-limit error', async () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      dailyCap: 50,
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    for (let i = 0; i < 50; i++) limiter.consume();
    assert.equal(limiter.status().allowed, false);

    const api = makeCountingApi(validResponse());

    await assert.rejects(
      () => runSmartSuggestionsFlow(makeInput(), makeDeps(cache, limiter, api)),
      (err) => {
        const payload = getErrorPayload(err);
        assert.equal(payload.type, 'rate-limit');
        return true;
      },
    );
    assert.equal(api.callCount(), 0);
    assert.equal(limiter.status().currentCount, 50);
  });

  it('hallucinated pose IDs are filtered before cache store', async () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    const mixedResponse = envelope({
      recommendations: [
        { poseId: 'tpose', reasoning: 'real', rank: 1 },
        { poseId: 'NOT-IN-LIB', reasoning: 'fake', rank: 2 },
        { poseId: 'casual-lean', reasoning: 'also real', rank: 3 },
      ],
    });
    const api = makeCountingApi(mixedResponse);
    const hash = 'abcdef0123456789';

    const result = await runSmartSuggestionsFlow(makeInput(), makeDeps(cache, limiter, api, hash));

    assert.equal(result.recommendations.length, 2);
    assert.deepEqual(
      result.recommendations.map((r) => r.poseId),
      ['tpose', 'casual-lean'],
    );

    // Hit the cache with the same hash — must return the filtered set, not
    // the original 3-item list.
    const reHit = cache.lookup(hash);
    assert.ok(reHit);
    assert.equal(reHit.recommendations.length, 2);
    assert.equal(
      reHit.recommendations.find((r) => r.poseId === 'NOT-IN-LIB'),
      undefined,
    );
  });

  it('fromCache is false on miss path and true on hit path', async () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    const api = makeCountingApi(validResponse());
    const hash = 'deadbeefdeadbeef';
    const deps = makeDeps(cache, limiter, api, hash);

    const miss = await runSmartSuggestionsFlow(makeInput(), deps);
    assert.equal(miss.fromCache, false);

    const hit = await runSmartSuggestionsFlow(makeInput(), deps);
    assert.equal(hit.fromCache, true);
  });

  it('cache eviction happens while rate limiter still tracks every API call', async () => {
    const cache = new SmartSuggestionsCache({ maxEntries: 3, matchDistance: 0 });
    const limiter = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date('2026-05-06T10:00:00'),
    });
    const api = makeCountingApi(validResponse());

    const hashes = ['1111111111111111', '2222222222222222', '3333333333333333', '4444444444444444'];
    for (const h of hashes) {
      const deps: SmartSuggestionsFlowDeps = {
        cache,
        rateLimiter: limiter,
        callGemini: api.callGemini,
        parseResponse: parseGeminiResponse,
        computeHash: () => h,
      };
      const r = await runSmartSuggestionsFlow(makeInput(h), deps);
      assert.equal(r.fromCache, false);
    }

    assert.equal(cache.size(), 3);
    assert.equal(cache.lookup(hashes[0]!), null, 'oldest entry should be evicted');
    assert.ok(cache.lookup(hashes[3]!), 'newest entry should be present');
    assert.equal(api.callCount(), 4);
    assert.equal(limiter.status().currentCount, 4);
  });
});
