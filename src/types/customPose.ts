import type { PoseLandmark } from './landmarks';
import type { PoseCategory } from './pose';

export interface CapturedPose {
  /** Unique ID, generated as 'capture-' + timestamp + '-' + random suffix */
  id: string;
  /** User-provided name */
  name: string;
  /** User-selected category */
  category: PoseCategory;
  /** User-selected difficulty 1-5 */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Raw image-space landmarks (33 points) — for ghost target rendering */
  imageLandmarks: PoseLandmark[];
  /** Normalized landmarks (33 points) — for matching */
  referenceLandmarks: PoseLandmark[];
  /** ISO timestamp of capture */
  capturedAt: string;
  /** Schema version for forward compat */
  version: 1;
}
