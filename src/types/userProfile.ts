export type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
export type HeightBucket = 'short' | 'medium' | 'tall';
export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'diamond' | 'unknown';
export type BodyType =
  | 'rectangle'
  | 'hourglass'
  | 'pear'
  | 'inverted_triangle'
  | 'oval'
  | 'unspecified';

export interface UserProfile {
  /** Schema version for forward-compat migrations */
  version: 1;
  /** Whether onboarding has been completed */
  onboardingComplete: boolean;
  /** ISO timestamp of onboarding completion */
  onboardedAt: string | null;
  gender: Gender | null;
  heightBucket: HeightBucket | null;
  faceShape: FaceShape;
  /** Placeholder until body-type classifier exists; always 'unspecified' for now */
  bodyType: BodyType;
}

export const EMPTY_PROFILE: UserProfile = {
  version: 1,
  onboardingComplete: false,
  onboardedAt: null,
  gender: null,
  heightBucket: null,
  faceShape: 'unknown',
  bodyType: 'unspecified',
};
