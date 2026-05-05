import { normalizePose } from '../ml/normalize.ts';
import type { PoseLandmark } from '../types/landmarks';
import type { PoseCategory, PoseTarget } from '../types/pose';
import type { RichPose, RichPoseCategory } from '../types/poseMetadata';

import generatedPosesJson from './data/poses.generated.json' with { type: 'json' };

/**
 * Hand-authored stub pose library for Phase 1 demo. Each entry's landmarks
 * are written in image-space (0–1 normalized) and run through normalizePose
 * at module load so consumers receive canonical-space (post-normalize)
 * landmarks ready to feed into matchPose().
 *
 * Image-space convention follows existing src/state/__mock__/mockPose.ts:
 *   x = 0 left edge, x = 1 right edge
 *   y = 0 top,       y = 1 bottom
 * Landmark indices follow MediaPipe Pose (33 points, see types/landmarks.ts).
 *
 * These are approximations meant to be matched by a person physically
 * attempting the pose in front of the camera. Visibility values reflect a
 * confident detection; presence mirrors visibility for stub data.
 */

interface PoseSpec {
  // Major joints in image space. Helper fills in face/hand/foot details.
  nose: [number, number];
  leftShoulder: [number, number];
  rightShoulder: [number, number];
  leftElbow: [number, number];
  rightElbow: [number, number];
  leftWrist: [number, number];
  rightWrist: [number, number];
  leftHip: [number, number];
  rightHip: [number, number];
  leftKnee: [number, number];
  rightKnee: [number, number];
  leftAnkle: [number, number];
  rightAnkle: [number, number];
}

const HIGH = { visibility: 0.99, presence: 0.99 };
const MED = { visibility: 0.85, presence: 0.85 };

function lm(
  x: number,
  y: number,
  z: number,
  q: { visibility: number; presence: number },
): PoseLandmark {
  return { x, y, z, visibility: q.visibility, presence: q.presence };
}

function buildLandmarks(spec: PoseSpec): PoseLandmark[] {
  const [nx, ny] = spec.nose;
  const eyeY = ny - 0.02;
  const earY = ny;
  const mouthY = ny + 0.04;

  const [lsx, lsy] = spec.leftShoulder;
  const [rsx, rsy] = spec.rightShoulder;
  const [lex, ley] = spec.leftElbow;
  const [rex, rey] = spec.rightElbow;
  const [lwx, lwy] = spec.leftWrist;
  const [rwx, rwy] = spec.rightWrist;
  const [lhx, lhy] = spec.leftHip;
  const [rhx, rhy] = spec.rightHip;
  const [lkx, lky] = spec.leftKnee;
  const [rkx, rky] = spec.rightKnee;
  const [lax, lay] = spec.leftAnkle;
  const [rax, ray] = spec.rightAnkle;

  return [
    lm(nx, ny, 0, HIGH), // 0 nose
    lm(nx - 0.02, eyeY, 0, MED), // 1 right eye inner (image-left of nose)
    lm(nx - 0.04, eyeY, 0, MED), // 2 right eye
    lm(nx - 0.06, eyeY, 0, MED), // 3 right eye outer
    lm(nx + 0.02, eyeY, 0, MED), // 4 left eye inner
    lm(nx + 0.04, eyeY, 0, MED), // 5 left eye
    lm(nx + 0.06, eyeY, 0, MED), // 6 left eye outer
    lm(nx - 0.08, earY, 0, MED), // 7 right ear
    lm(nx + 0.08, earY, 0, MED), // 8 left ear
    lm(nx - 0.01, mouthY, 0, MED), // 9 mouth right
    lm(nx + 0.01, mouthY, 0, MED), // 10 mouth left
    lm(lsx, lsy, 0, HIGH), // 11 left shoulder
    lm(rsx, rsy, 0, HIGH), // 12 right shoulder
    lm(lex, ley, 0, HIGH), // 13 left elbow
    lm(rex, rey, 0, HIGH), // 14 right elbow
    lm(lwx, lwy, 0, HIGH), // 15 left wrist
    lm(rwx, rwy, 0, HIGH), // 16 right wrist
    lm(lwx - 0.02, lwy + 0.01, 0, MED), // 17 left pinky
    lm(rwx + 0.02, rwy + 0.01, 0, MED), // 18 right pinky
    lm(lwx - 0.03, lwy, 0, MED), // 19 left index
    lm(rwx + 0.03, rwy, 0, MED), // 20 right index
    lm(lwx - 0.01, lwy - 0.01, 0, MED), // 21 left thumb
    lm(rwx + 0.01, rwy - 0.01, 0, MED), // 22 right thumb
    lm(lhx, lhy, 0, HIGH), // 23 left hip
    lm(rhx, rhy, 0, HIGH), // 24 right hip
    lm(lkx, lky, 0, HIGH), // 25 left knee
    lm(rkx, rky, 0, HIGH), // 26 right knee
    lm(lax, lay, 0, HIGH), // 27 left ankle
    lm(rax, ray, 0, HIGH), // 28 right ankle
    lm(lax - 0.02, lay + 0.02, 0, MED), // 29 left heel
    lm(rax + 0.02, ray + 0.02, 0, MED), // 30 right heel
    lm(lax + 0.02, lay + 0.02, 0, MED), // 31 left foot index
    lm(rax - 0.02, ray + 0.02, 0, MED), // 32 right foot index
  ];
}

function normalizeOrThrow(id: string, raw: PoseLandmark[]): PoseLandmark[] {
  const norm = normalizePose(raw);
  if (!norm) {
    throw new Error(
      `poseLibrary: failed to normalize stub pose '${id}' — anchor landmarks invalid`,
    );
  }
  return norm;
}

const TPOSE_RAW = buildLandmarks({
  nose: [0.5, 0.2],
  leftShoulder: [0.4, 0.35],
  rightShoulder: [0.6, 0.35],
  leftElbow: [0.25, 0.35],
  rightElbow: [0.75, 0.35],
  leftWrist: [0.1, 0.35],
  rightWrist: [0.9, 0.35],
  leftHip: [0.43, 0.55],
  rightHip: [0.57, 0.55],
  leftKnee: [0.43, 0.72],
  rightKnee: [0.57, 0.72],
  leftAnkle: [0.43, 0.9],
  rightAnkle: [0.57, 0.9],
});

const HANDS_HIPS_RAW = buildLandmarks({
  nose: [0.5, 0.2],
  leftShoulder: [0.4, 0.35],
  rightShoulder: [0.6, 0.35],
  // elbows out to the sides at ~mid-torso level
  leftElbow: [0.32, 0.5],
  rightElbow: [0.68, 0.5],
  // wrists resting on the hips
  leftWrist: [0.43, 0.55],
  rightWrist: [0.57, 0.55],
  leftHip: [0.43, 0.55],
  rightHip: [0.57, 0.55],
  leftKnee: [0.43, 0.72],
  rightKnee: [0.57, 0.72],
  leftAnkle: [0.43, 0.9],
  rightAnkle: [0.57, 0.9],
});

const ARM_UP_RIGHT_RAW = buildLandmarks({
  nose: [0.5, 0.2],
  leftShoulder: [0.4, 0.35],
  rightShoulder: [0.6, 0.35],
  // left arm down at side
  leftElbow: [0.4, 0.5],
  // right arm raised straight up
  rightElbow: [0.6, 0.22],
  leftWrist: [0.4, 0.62],
  rightWrist: [0.6, 0.08],
  leftHip: [0.43, 0.55],
  rightHip: [0.57, 0.55],
  leftKnee: [0.43, 0.72],
  rightKnee: [0.57, 0.72],
  leftAnkle: [0.43, 0.9],
  rightAnkle: [0.57, 0.9],
});

const POWER_STANCE_RAW = buildLandmarks({
  nose: [0.5, 0.2],
  // wider shoulders, hands on hips
  leftShoulder: [0.38, 0.35],
  rightShoulder: [0.62, 0.35],
  leftElbow: [0.3, 0.5],
  rightElbow: [0.7, 0.5],
  leftWrist: [0.41, 0.55],
  rightWrist: [0.59, 0.55],
  leftHip: [0.41, 0.55],
  rightHip: [0.59, 0.55],
  // wider stance
  leftKnee: [0.35, 0.72],
  rightKnee: [0.65, 0.72],
  leftAnkle: [0.33, 0.9],
  rightAnkle: [0.67, 0.9],
});

const CASUAL_LEAN_RAW = buildLandmarks({
  // body tilted slightly to image-right
  nose: [0.53, 0.2],
  leftShoulder: [0.43, 0.36],
  rightShoulder: [0.63, 0.34],
  leftElbow: [0.42, 0.5],
  rightElbow: [0.65, 0.5],
  leftWrist: [0.41, 0.62],
  rightWrist: [0.66, 0.6],
  leftHip: [0.45, 0.56],
  rightHip: [0.59, 0.55],
  leftKnee: [0.45, 0.73],
  rightKnee: [0.59, 0.72],
  leftAnkle: [0.45, 0.9],
  rightAnkle: [0.59, 0.9],
});

const WARRIOR_1_RAW = buildLandmarks({
  nose: [0.5, 0.22],
  leftShoulder: [0.42, 0.36],
  rightShoulder: [0.58, 0.36],
  // arms reaching up
  leftElbow: [0.38, 0.22],
  rightElbow: [0.62, 0.22],
  leftWrist: [0.4, 0.08],
  rightWrist: [0.6, 0.08],
  leftHip: [0.44, 0.55],
  rightHip: [0.56, 0.55],
  // front leg bent (left), back leg straight (right)
  leftKnee: [0.36, 0.7],
  rightKnee: [0.62, 0.78],
  leftAnkle: [0.32, 0.9],
  rightAnkle: [0.68, 0.92],
});

const SQUAT_RAW = buildLandmarks({
  nose: [0.5, 0.3],
  leftShoulder: [0.4, 0.45],
  rightShoulder: [0.6, 0.45],
  // arms forward for balance
  leftElbow: [0.36, 0.55],
  rightElbow: [0.64, 0.55],
  leftWrist: [0.38, 0.62],
  rightWrist: [0.62, 0.62],
  // hips lower (squatting)
  leftHip: [0.42, 0.65],
  rightHip: [0.58, 0.65],
  // knees bent forward and out
  leftKnee: [0.36, 0.78],
  rightKnee: [0.64, 0.78],
  leftAnkle: [0.4, 0.92],
  rightAnkle: [0.6, 0.92],
});

const CROSSLEGGED_RAW = buildLandmarks({
  // sitting: head higher, hips low, knees out wide near the floor
  nose: [0.5, 0.25],
  leftShoulder: [0.42, 0.4],
  rightShoulder: [0.58, 0.4],
  // hands resting on knees
  leftElbow: [0.4, 0.55],
  rightElbow: [0.6, 0.55],
  leftWrist: [0.38, 0.7],
  rightWrist: [0.62, 0.7],
  leftHip: [0.45, 0.7],
  rightHip: [0.55, 0.7],
  // knees far out (cross-legged)
  leftKnee: [0.32, 0.78],
  rightKnee: [0.68, 0.78],
  // ankles tucked back near hips
  leftAnkle: [0.5, 0.78],
  rightAnkle: [0.5, 0.78],
});

const PROFILE_LEFT_RAW = buildLandmarks({
  // 3/4 turn: shoulders compressed horizontally, body shifted to image-left
  nose: [0.45, 0.2],
  leftShoulder: [0.38, 0.36],
  rightShoulder: [0.5, 0.34],
  leftElbow: [0.36, 0.5],
  rightElbow: [0.5, 0.5],
  leftWrist: [0.34, 0.62],
  rightWrist: [0.5, 0.62],
  leftHip: [0.42, 0.56],
  rightHip: [0.5, 0.55],
  leftKnee: [0.42, 0.73],
  rightKnee: [0.5, 0.72],
  leftAnkle: [0.42, 0.9],
  rightAnkle: [0.5, 0.9],
});

const THINKER_RAW = buildLandmarks({
  nose: [0.5, 0.2],
  leftShoulder: [0.4, 0.36],
  rightShoulder: [0.6, 0.36],
  // right arm bent up so wrist near chin
  leftElbow: [0.4, 0.5],
  rightElbow: [0.55, 0.4],
  leftWrist: [0.4, 0.62],
  rightWrist: [0.5, 0.24],
  leftHip: [0.43, 0.55],
  rightHip: [0.57, 0.55],
  leftKnee: [0.43, 0.72],
  rightKnee: [0.57, 0.72],
  leftAnkle: [0.43, 0.9],
  rightAnkle: [0.57, 0.9],
});

// 'group' isn't a legacy PoseCategory; collapse it to 'lifestyle' so the
// existing PoseSelector glyph map and category filter keep working until the
// 3C stripes UI takes over.
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

const STUB_RICH_POSES: RichPose[] = [
  {
    id: 'tpose',
    name: 'T-pose',
    category: 'standing',
    description: 'Stand facing the camera with arms straight out to the sides.',
    referenceLandmarks: normalizeOrThrow('tpose', TPOSE_RAW),
    difficulty: 1,
    tags: ['calibration', 'reference'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['serious'],
    useCase: ['casual'],
    lightingRecommendation: 'any',
    recommendedClothing: 'any',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'hands-hips',
    name: 'Hands on hips',
    category: 'standing',
    description: 'Stand confidently with both hands resting on your hips.',
    referenceLandmarks: normalizeOrThrow('hands-hips', HANDS_HIPS_RAW),
    difficulty: 1,
    tags: ['confident', 'classic'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['confident'],
    useCase: ['casual', 'fashion'],
    lightingRecommendation: 'any',
    recommendedClothing: 'any',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'arm-up-right',
    name: 'Arm raised',
    category: 'standing',
    description: 'Raise your right arm straight up, left arm relaxed at your side.',
    referenceLandmarks: normalizeOrThrow('arm-up-right', ARM_UP_RIGHT_RAW),
    difficulty: 2,
    tags: ['playful', 'dynamic'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['playful', 'confident'],
    useCase: ['travel', 'casual'],
    lightingRecommendation: 'bright',
    recommendedClothing: 'casual',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'power-stance',
    name: 'Power stance',
    category: 'standing',
    description: 'Feet shoulder-width apart, hands on hips, chest open.',
    referenceLandmarks: normalizeOrThrow('power-stance', POWER_STANCE_RAW),
    difficulty: 2,
    tags: ['confident', 'strong'],
    genderOrientation: 'male',
    bodyTypeHints: [],
    moodTags: ['confident', 'serious'],
    useCase: ['fashion', 'fitness'],
    lightingRecommendation: 'dramatic',
    recommendedClothing: 'fitted',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'casual-lean',
    name: 'Casual lean',
    category: 'lifestyle',
    description: 'Tilt your weight to one side for a relaxed, candid look.',
    referenceLandmarks: normalizeOrThrow('casual-lean', CASUAL_LEAN_RAW),
    difficulty: 2,
    tags: ['relaxed', 'candid'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['relaxed'],
    useCase: ['casual', 'fashion'],
    lightingRecommendation: 'soft',
    recommendedClothing: 'casual',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'warrior-1',
    name: 'Warrior I',
    category: 'fitness',
    description: 'Front leg bent, back leg straight, arms reaching overhead.',
    referenceLandmarks: normalizeOrThrow('warrior-1', WARRIOR_1_RAW),
    difficulty: 4,
    tags: ['yoga', 'strong'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['serious', 'confident'],
    useCase: ['fitness'],
    lightingRecommendation: 'bright',
    recommendedClothing: 'fitted',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'squat',
    name: 'Squat',
    category: 'fitness',
    description: 'Bend knees, hips low, arms forward for balance.',
    referenceLandmarks: normalizeOrThrow('squat', SQUAT_RAW),
    difficulty: 3,
    tags: ['fitness', 'strength'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['serious'],
    useCase: ['fitness'],
    lightingRecommendation: 'bright',
    recommendedClothing: 'fitted',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'crosslegged',
    name: 'Cross-legged',
    category: 'sitting',
    description: 'Seated with legs crossed, hands resting on the knees.',
    referenceLandmarks: normalizeOrThrow('crosslegged', CROSSLEGGED_RAW),
    difficulty: 2,
    tags: ['relaxed', 'meditative'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['relaxed'],
    useCase: ['casual'],
    lightingRecommendation: 'soft',
    recommendedClothing: 'casual',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'profile-left',
    name: 'Profile turn',
    category: 'standing',
    description: 'Rotate three-quarters away from the camera for a profile shot.',
    referenceLandmarks: normalizeOrThrow('profile-left', PROFILE_LEFT_RAW),
    difficulty: 3,
    tags: ['fashion', 'angle'],
    genderOrientation: 'female',
    bodyTypeHints: [],
    moodTags: ['professional', 'confident'],
    useCase: ['fashion', 'wedding'],
    lightingRecommendation: 'soft',
    recommendedClothing: 'formal',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
  {
    id: 'thinker',
    name: 'The thinker',
    category: 'lifestyle',
    description: 'Bring your right hand up near your chin, contemplative look.',
    referenceLandmarks: normalizeOrThrow('thinker', THINKER_RAW),
    difficulty: 2,
    tags: ['thoughtful', 'lifestyle'],
    genderOrientation: 'neutral',
    bodyTypeHints: [],
    moodTags: ['serious', 'professional'],
    useCase: ['fashion', 'casual'],
    lightingRecommendation: 'soft',
    recommendedClothing: 'any',
    groupSize: 1,
    locationType: 'any',
    imageAttribution: { source: 'manual', url: '', author: 'stub', license: 'internal' },
  },
];

// Pipeline output: scripts/process-poses.mjs writes RichPose[] here. Empty
// until the user populates images/manifest.json and runs `npm run process-poses`.
const GENERATED_RICH_POSES: RichPose[] = generatedPosesJson as RichPose[];

/** Rich library used by the recommendation engine — same order as POSE_LIBRARY. */
export const RICH_POSE_LIBRARY: RichPose[] = [...STUB_RICH_POSES, ...GENERATED_RICH_POSES];

export const POSE_LIBRARY: PoseTarget[] = RICH_POSE_LIBRARY.map(richToPoseTarget);

export function getPoseById(id: string): PoseTarget | undefined {
  return POSE_LIBRARY.find((p) => p.id === id);
}

export function getRichPoseById(id: string): RichPose | undefined {
  return RICH_POSE_LIBRARY.find((p) => p.id === id);
}
