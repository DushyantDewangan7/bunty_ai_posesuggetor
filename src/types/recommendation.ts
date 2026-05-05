import type { UserProfile } from './userProfile';
import type { PoseTarget } from './pose';

export interface RecommendationContext {
  profile: UserProfile;
  /** Pose IDs already shown in this session — excluded from results */
  shownPoseIds: ReadonlySet<string>;
  /** How many poses to return; library may have fewer matches */
  limit: number;
}

export interface ScoredPose {
  pose: PoseTarget;
  score: number;
  /** Score breakdown for debugging / future tuning */
  components: {
    genderMatch: number;
    moodMatch: number;
    useCaseMatch: number;
    difficultyPreference: number;
  };
}

export interface RecommendationResult {
  /** Ranked poses, highest score first */
  recommendations: ScoredPose[];
  /** Total poses considered (library size minus already-shown) */
  poolSize: number;
  /** Reason if results are empty or short */
  notes: string[];
}
