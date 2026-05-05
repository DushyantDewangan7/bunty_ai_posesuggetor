import type { PoseTarget, PoseCategory } from '../types/pose';
import type { RichPose, RichPoseCategory } from '../types/poseMetadata';
import type { UserProfile } from '../types/userProfile';
import type {
  RecommendationContext,
  RecommendationResult,
  ScoredPose,
} from '../types/recommendation';

const WEIGHT_GENDER = 0.4;
const WEIGHT_MOOD = 0.2;
const WEIGHT_USE_CASE = 0.2;
const WEIGHT_DIFFICULTY = 0.2;

function richCategoryToLegacy(c: RichPoseCategory): PoseCategory {
  return c === 'group' ? 'lifestyle' : c;
}

function richToPoseTarget(rich: RichPose): PoseTarget {
  return {
    id: rich.id,
    name: rich.name,
    category: richCategoryToLegacy(rich.category),
    description: rich.description,
    referenceLandmarks: rich.referenceLandmarks,
    difficulty: rich.difficulty,
  };
}

function isOpposite(a: 'male' | 'female', b: 'male' | 'female'): boolean {
  return a !== b;
}

export function computeGenderMatch(pose: RichPose, userGender: UserProfile['gender']): number {
  if (pose.genderOrientation === 'neutral') return 0.8;
  if (userGender === null || userGender === 'prefer_not_to_say' || userGender === 'non_binary') {
    return 0.7;
  }
  if (userGender === 'male' || userGender === 'female') {
    if (pose.genderOrientation === userGender) return 1.0;
    if (isOpposite(pose.genderOrientation, userGender)) return 0.2;
  }
  return 0.7;
}

export function computeMoodMatch(_pose: RichPose, _profile: UserProfile): number {
  // No implicit mood preference yet — comes from interaction history later.
  return 0.5;
}

export function computeUseCaseMatch(_pose: RichPose, _profile: UserProfile): number {
  // No use-case signal yet — derive from explicit user setting or interaction
  // patterns when available.
  return 0.5;
}

export function computeDifficultyPreference(pose: RichPose, _profile: UserProfile): number {
  switch (pose.difficulty) {
    case 1:
      return 1.0;
    case 2:
      return 0.7;
    case 3:
      return 0.4;
    case 4:
      return 0.2;
    case 5:
      return 0.1;
    default:
      return 0.4;
  }
}

function scorePose(pose: RichPose, profile: UserProfile): ScoredPose {
  const genderMatch = computeGenderMatch(pose, profile.gender);
  const moodMatch = computeMoodMatch(pose, profile);
  const useCaseMatch = computeUseCaseMatch(pose, profile);
  const difficultyPreference = computeDifficultyPreference(pose, profile);

  const score =
    WEIGHT_GENDER * genderMatch +
    WEIGHT_MOOD * moodMatch +
    WEIGHT_USE_CASE * useCaseMatch +
    WEIGHT_DIFFICULTY * difficultyPreference;

  return {
    pose: richToPoseTarget(pose),
    score,
    components: { genderMatch, moodMatch, useCaseMatch, difficultyPreference },
  };
}

/**
 * Score and rank poses against a caller-supplied library. Pure (no module-level
 * library import) so tests can pass fixtures without dragging in the runtime
 * pose library and its JSON dependency.
 */
export function recommendFrom(
  library: RichPose[],
  context: RecommendationContext,
): RecommendationResult {
  const notes: string[] = [];
  const pool = library.filter((p) => !context.shownPoseIds.has(p.id));
  const poolSize = pool.length;

  if (poolSize === 0) {
    notes.push('No poses available — all entries already shown this session.');
    return { recommendations: [], poolSize, notes };
  }

  const scored = pool.map((p) => scorePose(p, context.profile));
  scored.sort((a, b) => b.score - a.score);

  if (context.limit > poolSize) {
    notes.push(
      `Requested ${context.limit} poses but only ${poolSize} available after filtering shown.`,
    );
  }

  return {
    recommendations: scored.slice(0, context.limit),
    poolSize,
    notes,
  };
}
