import type { PoseLandmark } from './landmarks';

export type PoseCategory = 'standing' | 'sitting' | 'fitness' | 'lifestyle';

export type MatchState = 'far' | 'close' | 'matched';

export interface PoseTarget {
  id: string;
  name: string;
  category: PoseCategory;
  description: string;
  /** Reference landmarks in canonical pose space (post-normalize). 33 landmarks. */
  referenceLandmarks: PoseLandmark[];
  /** Difficulty 1-5 */
  difficulty: number;
}

export interface MatchResult {
  /** 0-1 overall fit score */
  fitScore: number;
  /** Per-landmark Euclidean distances in canonical pose space (visibility-weighted) */
  landmarkDistances: number[];
  /** Joint indices with the largest weighted distances (top 3) */
  worstJoints: number[];
  /** UI bucket derived from fitScore */
  state: MatchState;
}
