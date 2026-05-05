import type { RichPose } from '../types/poseMetadata';
import type {
  PoseMetadataForAgent,
  SmartSuggestionRequest,
} from '../types/smartSuggestions';

/**
 * Project a RichPose down to the slim PoseMetadataForAgent shape.
 *
 * Drops fields the model has no use for: referenceLandmarks (33 × {x,y,z,vis}
 * adds ~2 KB per pose with no scene-reasoning value), bodyTypeHints
 * (placeholder until classifier exists), groupSize, recommendedClothing,
 * imageAttribution.
 */
export function projectPoseForAgent(pose: RichPose): PoseMetadataForAgent {
  return {
    id: pose.id,
    name: pose.name,
    description: pose.description,
    category: pose.category,
    tags: pose.tags,
    difficulty: pose.difficulty,
    genderOrientation: pose.genderOrientation,
    moodTags: pose.moodTags,
    useCase: pose.useCase,
    lightingRecommendation: pose.lightingRecommendation,
    locationType: pose.locationType,
  };
}

/**
 * System prompt — static instructions sent on every call. Defines role, output
 * shape, and the hard constraints (library-only IDs, gender soft preference,
 * deprioritise shown).
 */
export function buildSystemPrompt(): string {
  return `You are a pose-suggestion agent for a mobile photography app. The user is about to take a photo of themselves and wants 3 to 5 pose suggestions tailored to their scene and personal profile.

You will receive:
  1. A photo of the user's current scene (front-camera frame).
  2. A user profile (gender, height bucket, face shape).
  3. A library of available poses with metadata (id, name, description, category, tags, difficulty, genderOrientation, moodTags, useCase, lightingRecommendation, locationType).
  4. A list of pose IDs already shown this session.

Your task: pick 3 to 5 poses from the library that best fit the scene and user.

Output: a single JSON object with this exact shape (no surrounding markdown, no commentary):

{
  "sceneDescription": "<one short sentence describing what you see in the photo>",
  "recommendations": [
    { "poseId": "<id from library>", "reasoning": "<one sentence, max 200 chars, why this pose>", "rank": 1 },
    { "poseId": "<id from library>", "reasoning": "<...>", "rank": 2 },
    { "poseId": "<id from library>", "reasoning": "<...>", "rank": 3 }
  ]
}

Hard constraints:
  - poseId MUST be an exact id from the supplied library. Do not invent IDs.
  - Pick 3 to 5 recommendations, ranked 1 (best) through N (last) with no gaps.
  - reasoning is one sentence, 200 characters or fewer.
  - Avoid recommending poses listed in shownPoseIds unless no better fit exists.

Soft preferences:
  - Prefer poses whose genderOrientation matches the user's gender. "neutral" is always acceptable. Opposite-gender poses are acceptable only if scene-fit is strongly better.
  - Prefer poses whose lightingRecommendation matches what you see in the photo.
  - Prefer poses whose locationType matches the scene (indoor / outdoor_natural / outdoor_urban / studio / any).
  - Prefer simpler poses (lower difficulty) when the scene gives no strong cue toward a difficult one.

Return ONLY the JSON object. No prose before or after.`;
}

/**
 * Build the per-call user message: text payload (profile + library + shown
 * list serialized as JSON) plus the raw base64 image. Caller assembles these
 * into the Gemini API's `contents.parts` array.
 */
export function buildUserMessage(request: SmartSuggestionRequest): {
  text: string;
  image: string;
} {
  const payload = {
    profile: {
      gender: request.profile.gender,
      heightBucket: request.profile.heightBucket,
      faceShape: request.profile.faceShape,
    },
    library: request.libraryMetadata,
    shownPoseIds: request.shownPoseIds,
  };

  const text = `Here is the user profile, the available pose library, and the IDs already shown this session:\n\n${JSON.stringify(
    payload,
    null,
    2,
  )}\n\nAnalyze the attached photo and produce the JSON object as specified.`;

  return { text, image: request.frameBase64 };
}
