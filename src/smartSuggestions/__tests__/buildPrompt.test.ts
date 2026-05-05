import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { UserProfile } from '../../types/userProfile';
import type { RichPose } from '../../types/poseMetadata';
import type { SmartSuggestionRequest } from '../../types/smartSuggestions';

import {
  buildSystemPrompt,
  buildUserMessage,
  projectPoseForAgent,
} from '../buildPrompt.ts';

const sampleRichPose: RichPose = {
  id: 'sample-stand',
  name: 'Sample stand',
  description: 'A test pose.',
  category: 'standing',
  tags: ['t1', 't2'],
  difficulty: 2,
  genderOrientation: 'neutral',
  bodyTypeHints: [],
  moodTags: ['confident'],
  useCase: ['casual'],
  lightingRecommendation: 'any',
  recommendedClothing: 'any',
  groupSize: 1,
  locationType: 'any',
  referenceLandmarks: [],
  imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
};

const maleProfile: UserProfile = {
  version: 1,
  onboardingComplete: true,
  onboardedAt: '2026-05-05T00:00:00.000Z',
  gender: 'male',
  heightBucket: 'medium',
  faceShape: 'oval',
  bodyType: 'unspecified',
};

function buildRequest(overrides: Partial<SmartSuggestionRequest> = {}): SmartSuggestionRequest {
  return {
    frameBase64: 'AAAA',
    profile: maleProfile,
    libraryMetadata: [projectPoseForAgent(sampleRichPose)],
    shownPoseIds: [],
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('produces a non-empty multi-line string with no broken JSON', () => {
    const sp = buildSystemPrompt();
    assert.ok(sp.length > 200, 'system prompt should be substantial');
    assert.ok(sp.includes('"poseId"'), 'should mention poseId field');
    assert.ok(sp.includes('"recommendations"'), 'should mention recommendations field');
    // Sanity: balanced braces in the example schema.
    const opens = (sp.match(/\{/g) ?? []).length;
    const closes = (sp.match(/\}/g) ?? []).length;
    assert.equal(opens, closes, 'braces should balance in the example schema');
  });
});

describe('projectPoseForAgent', () => {
  it('keeps only the agent-relevant fields', () => {
    const projected = projectPoseForAgent(sampleRichPose);
    const expectedKeys = [
      'id',
      'name',
      'description',
      'category',
      'tags',
      'difficulty',
      'genderOrientation',
      'moodTags',
      'useCase',
      'lightingRecommendation',
      'locationType',
    ].sort();
    assert.deepEqual(Object.keys(projected).sort(), expectedKeys);
    // Spot-check that the dropped fields are gone.
    assert.equal('referenceLandmarks' in projected, false);
    assert.equal('bodyTypeHints' in projected, false);
    assert.equal('groupSize' in projected, false);
    assert.equal('recommendedClothing' in projected, false);
    assert.equal('imageAttribution' in projected, false);
  });
});

describe('buildUserMessage', () => {
  it('embeds the male gender hint in the text payload', () => {
    const { text } = buildUserMessage(buildRequest());
    assert.ok(text.includes('"gender": "male"'), 'expected gender to appear in JSON payload');
  });

  it('embeds shownPoseIds in the text payload', () => {
    const { text } = buildUserMessage(
      buildRequest({ shownPoseIds: ['sample-stand', 'another-id'] }),
    );
    assert.ok(text.includes('"sample-stand"'), 'shown id missing from payload');
    assert.ok(text.includes('"another-id"'), 'second shown id missing from payload');
  });

  it('returns the image as a base64 string passed through unchanged', () => {
    const { image } = buildUserMessage(buildRequest({ frameBase64: 'XYZ123' }));
    assert.equal(image, 'XYZ123');
  });

  it('produces a JSON-parseable payload block', () => {
    const { text } = buildUserMessage(buildRequest());
    // Extract the JSON between the first '{' and the last '}' to verify it's valid.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    assert.ok(start !== -1 && end !== -1, 'expected JSON block in user message');
    const jsonText = text.slice(start, end + 1);
    const parsed = JSON.parse(jsonText) as {
      profile: { gender: string };
      library: unknown[];
      shownPoseIds: string[];
    };
    assert.equal(parsed.profile.gender, 'male');
    assert.equal(parsed.library.length, 1);
    assert.deepEqual(parsed.shownPoseIds, []);
  });
});
