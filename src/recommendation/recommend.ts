import { RICH_POSE_LIBRARY } from '../library/poseLibrary';
import type { RecommendationContext, RecommendationResult } from '../types/recommendation';
import { recommendFrom } from './recommendCore';

export {
  computeGenderMatch,
  computeMoodMatch,
  computeUseCaseMatch,
  computeDifficultyPreference,
  recommendFrom,
} from './recommendCore';

export function recommend(context: RecommendationContext): RecommendationResult {
  return recommendFrom(RICH_POSE_LIBRARY, context);
}
