import type { PoseCategory, PoseTarget } from '../types/pose';
import type { RichPose, RichPoseCategory } from '../types/poseMetadata';

import generatedPosesJson from './data/poses.generated.json' with { type: 'json' };

// 'group' isn't a legacy PoseCategory; collapse it to 'lifestyle' so the
// existing PoseSelector glyph map and category filter keep working until the
// 3C stripes UI takes over.
function richCategoryToLegacy(c: RichPoseCategory): PoseCategory {
  return c === 'group' ? 'lifestyle' : c;
}

function richToPoseTarget(rich: RichPose): PoseTarget {
  const target: PoseTarget = {
    id: rich.id,
    name: rich.name,
    category: richCategoryToLegacy(rich.category),
    description: rich.description,
    referenceLandmarks: rich.referenceLandmarks,
    difficulty: rich.difficulty,
  };
  if (rich.outlineSvg) target.outlineSvg = rich.outlineSvg;
  return target;
}

export const RICH_POSE_LIBRARY: RichPose[] = generatedPosesJson as RichPose[];

export const POSE_LIBRARY: PoseTarget[] = RICH_POSE_LIBRARY.map(richToPoseTarget);

export function getPoseById(id: string): PoseTarget | undefined {
  return POSE_LIBRARY.find((p) => p.id === id);
}

export function getRichPoseById(id: string): RichPose | undefined {
  return RICH_POSE_LIBRARY.find((p) => p.id === id);
}
