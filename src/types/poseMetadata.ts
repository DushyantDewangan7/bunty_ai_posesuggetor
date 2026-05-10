import type { PoseLandmark } from './landmarks';
import type { BodyType } from './userProfile';

/**
 * Rich pose metadata schema used by the offline pose-data pipeline
 * (scripts/process-poses.mjs) and the recommendation engine (Phase 3B).
 *
 * `referenceLandmarks` are produced by the offline pipeline and live in the
 * SAME canonical pose space that the on-device runtime emits (see
 * src/ml/normalize.ts). Both sides MUST go through identical normalization or
 * matchPose() comparisons silently fail.
 */

export type RichPoseCategory = 'standing' | 'sitting' | 'fitness' | 'lifestyle' | 'group';

export type GenderOrientation = 'male' | 'female' | 'neutral';

export type MoodTag = 'confident' | 'relaxed' | 'playful' | 'serious' | 'professional';

export type UseCase = 'travel' | 'wedding' | 'fashion' | 'fitness' | 'casual';

export type LightingRecommendation = 'bright' | 'soft' | 'dramatic' | 'any';

export type RecommendedClothing = 'fitted' | 'flowing' | 'formal' | 'casual' | 'any';

export type GroupSize = 1 | 2 | 'group';

export type LocationType = 'indoor' | 'outdoor_natural' | 'outdoor_urban' | 'studio' | 'any';

export interface ImageAttribution {
  source: 'pexels' | 'unsplash' | 'manual' | 'ai-generated';
  url: string;
  author: string;
  license: string;
  /** Present only for source === 'ai-generated' — the prompt used to generate the image. */
  aiPrompt?: string;
}

export interface RichPose {
  id: string;
  name: string;
  description: string;
  category: RichPoseCategory;
  tags: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  genderOrientation: GenderOrientation;
  bodyTypeHints: BodyType[];
  moodTags: MoodTag[];
  useCase: UseCase[];
  lightingRecommendation: LightingRecommendation;
  recommendedClothing: RecommendedClothing;
  groupSize: GroupSize;
  locationType: LocationType;

  /** 33 landmarks in canonical pose space (post-normalize). */
  referenceLandmarks: PoseLandmark[];
  imageAttribution: ImageAttribution;

  /**
   * Filename of the SVG outline asset under `assets/poseOutlines/`. REQUIRED
   * in production — `getOutlineAssetForPose()` throws if missing on a release
   * build. In dev/internal builds a missing value falls back to the geometric
   * silhouette (G27) with a console.warn. See ADR-001 G28.
   */
  outlineSvg?: string;
}
