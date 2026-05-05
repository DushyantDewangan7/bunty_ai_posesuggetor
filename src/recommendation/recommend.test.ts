import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoseLandmark } from '../types/landmarks';
import type { RichPose, GenderOrientation } from '../types/poseMetadata';
import type { UserProfile, Gender } from '../types/userProfile';
import { recommendFrom } from './recommendCore.ts';

function emptyLandmarks(): PoseLandmark[] {
  const arr: PoseLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    arr.push({ x: 0, y: 0, z: 0, visibility: 0.9, presence: 0.9 });
  }
  return arr;
}

function makePose(
  id: string,
  difficulty: 1 | 2 | 3 | 4 | 5,
  genderOrientation: GenderOrientation,
): RichPose {
  return {
    id,
    name: id,
    description: '',
    category: 'standing',
    tags: [],
    difficulty,
    genderOrientation,
    bodyTypeHints: [],
    moodTags: [],
    useCase: [],
    lightingRecommendation: 'any',
    recommendedClothing: 'any',
    groupSize: 1,
    locationType: 'any',
    referenceLandmarks: emptyLandmarks(),
    imageAttribution: { source: 'manual', url: '', author: 'fixture', license: 'test' },
  };
}

function makeProfile(gender: Gender | null): UserProfile {
  return {
    version: 1,
    onboardingComplete: true,
    onboardedAt: '2026-05-05T00:00:00.000Z',
    gender,
    heightBucket: null,
    faceShape: 'unknown',
    bodyType: 'unspecified',
  };
}

const FIXTURE_LIBRARY: RichPose[] = [
  makePose('m-easy', 1, 'male'),
  makePose('m-hard', 4, 'male'),
  makePose('f-easy', 1, 'female'),
  makePose('f-hard', 4, 'female'),
  makePose('n-easy', 1, 'neutral'),
  makePose('n-mid', 3, 'neutral'),
];

test('empty profile (no gender) → all poses returned, easier ranks higher', () => {
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile(null),
    shownPoseIds: new Set(),
    limit: 100,
  });
  assert.strictEqual(result.recommendations.length, FIXTURE_LIBRARY.length);
  assert.strictEqual(result.poolSize, FIXTURE_LIBRARY.length);
  // Difficulty-1 poses should outrank difficulty-3/4 poses.
  const top3Ids = result.recommendations.slice(0, 3).map((r) => r.pose.id);
  assert.ok(top3Ids.includes('m-easy'));
  assert.ok(top3Ids.includes('f-easy'));
  assert.ok(top3Ids.includes('n-easy'));
  // Last entry should be one of the difficulty-4 poses.
  const lastId = result.recommendations[result.recommendations.length - 1]!.pose.id;
  assert.ok(lastId === 'm-hard' || lastId === 'f-hard');
});

test('male profile → male and neutral rank above female of same difficulty', () => {
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile('male'),
    shownPoseIds: new Set(),
    limit: 100,
  });
  const order = result.recommendations.map((r) => r.pose.id);
  // Among difficulty-1 poses, expect order: m-easy (gender 1.0) > n-easy (0.8) > f-easy (0.2)
  const mIdx = order.indexOf('m-easy');
  const nIdx = order.indexOf('n-easy');
  const fIdx = order.indexOf('f-easy');
  assert.ok(mIdx < nIdx, `expected m-easy before n-easy, got ${order.join(',')}`);
  assert.ok(nIdx < fIdx, `expected n-easy before f-easy, got ${order.join(',')}`);
});

test('male profile → top component genderMatch is 1.0 for male pose, 0.8 for neutral, 0.2 for female', () => {
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile('male'),
    shownPoseIds: new Set(),
    limit: 100,
  });
  const byId = new Map(result.recommendations.map((r) => [r.pose.id, r]));
  assert.strictEqual(byId.get('m-easy')!.components.genderMatch, 1.0);
  assert.strictEqual(byId.get('n-easy')!.components.genderMatch, 0.8);
  assert.strictEqual(byId.get('f-easy')!.components.genderMatch, 0.2);
});

test('shown poses are excluded from results', () => {
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile('male'),
    shownPoseIds: new Set(['m-easy', 'n-easy']),
    limit: 100,
  });
  const ids = result.recommendations.map((r) => r.pose.id);
  assert.ok(!ids.includes('m-easy'));
  assert.ok(!ids.includes('n-easy'));
  assert.strictEqual(result.poolSize, FIXTURE_LIBRARY.length - 2);
});

test('limit=3 → returns exactly 3 results', () => {
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile(null),
    shownPoseIds: new Set(),
    limit: 3,
  });
  assert.strictEqual(result.recommendations.length, 3);
  assert.strictEqual(result.poolSize, FIXTURE_LIBRARY.length);
});

test('limit > pool size → returns whatever is available, notes mentions reduction', () => {
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile(null),
    shownPoseIds: new Set(),
    limit: 100,
  });
  assert.strictEqual(result.recommendations.length, FIXTURE_LIBRARY.length);
  assert.ok(
    result.notes.some((n) => n.includes('Requested 100')),
    `expected notes to mention requested>available, got: ${JSON.stringify(result.notes)}`,
  );
});

test('all poses shown → empty result with explanatory note', () => {
  const allIds = new Set(FIXTURE_LIBRARY.map((p) => p.id));
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile('male'),
    shownPoseIds: allIds,
    limit: 3,
  });
  assert.strictEqual(result.recommendations.length, 0);
  assert.strictEqual(result.poolSize, 0);
  assert.ok(result.notes.length >= 1);
});

test('non_binary profile → uses 0.7 neutral default for opposite gender, 0.8 for neutral', () => {
  const result = recommendFrom(FIXTURE_LIBRARY, {
    profile: makeProfile('non_binary'),
    shownPoseIds: new Set(),
    limit: 100,
  });
  const byId = new Map(result.recommendations.map((r) => [r.pose.id, r]));
  assert.strictEqual(byId.get('m-easy')!.components.genderMatch, 0.7);
  assert.strictEqual(byId.get('f-easy')!.components.genderMatch, 0.7);
  assert.strictEqual(byId.get('n-easy')!.components.genderMatch, 0.8);
});
