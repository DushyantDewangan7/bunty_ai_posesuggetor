// Static require() map for pose reference photos used by the carousel tiles.
// Metro requires literal strings inside require(), so every shipped pose
// image must have a hand-written entry here. Source files live in
// assets/poseImages/ and are copies of the pipeline source JPGs renamed to
// pose id (one entry per pose id present in POSE_LIBRARY).

const POSE_IMAGE_MAP: Record<string, number> = {
  'casual-standing-01': require('../../../assets/poseImages/casual-standing-01.jpg'),
  tpose: require('../../../assets/poseImages/tpose.jpg'),
  'hands-hips': require('../../../assets/poseImages/hands-hips.jpg'),
  'arm-up-right': require('../../../assets/poseImages/arm-up-right.jpg'),
  'power-stance': require('../../../assets/poseImages/power-stance.jpg'),
  'casual-lean': require('../../../assets/poseImages/casual-lean.jpg'),
  'warrior-1': require('../../../assets/poseImages/warrior-1.jpg'),
  squat: require('../../../assets/poseImages/squat.jpg'),
  crosslegged: require('../../../assets/poseImages/crosslegged.jpg'),
  thinker: require('../../../assets/poseImages/thinker.jpg'),
};

export function getPoseImage(poseId: string): number | undefined {
  return POSE_IMAGE_MAP[poseId];
}
