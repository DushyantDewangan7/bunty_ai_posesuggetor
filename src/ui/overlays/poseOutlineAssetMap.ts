// Static require() map. Metro requires literal strings inside require(), so
// every shipped pose outline must have a hand-written entry here. Add one
// entry per pose as new SVGs land in assets/poseOutlines/.
//
// The value is the Metro asset module ID returned by require() of an .svg
// file (.svg is in Metro's default assetExts, so no transformer is needed).
// Image.resolveAssetSource(...) on this ID returns { uri, width, height },
// which the renderer uses to fetch the SVG XML at runtime.

export const poseOutlineAssets: Record<string, number> = {
  'casual-standing-01_outline.svg': require('../../../assets/poseOutlines/casual-standing-01_outline.svg'),
  'tpose_outline.svg': require('../../../assets/poseOutlines/tpose_outline.svg'),
  'hands-hips_outline.svg': require('../../../assets/poseOutlines/hands-hips_outline.svg'),
  'arm-up-right_outline.svg': require('../../../assets/poseOutlines/arm-up-right_outline.svg'),
  'power-stance_outline.svg': require('../../../assets/poseOutlines/power-stance_outline.svg'),
  'casual-lean_outline.svg': require('../../../assets/poseOutlines/casual-lean_outline.svg'),
  'warrior-1_outline.svg': require('../../../assets/poseOutlines/warrior-1_outline.svg'),
  'squat_outline.svg': require('../../../assets/poseOutlines/squat_outline.svg'),
  'crosslegged_outline.svg': require('../../../assets/poseOutlines/crosslegged_outline.svg'),
  'thinker_outline.svg': require('../../../assets/poseOutlines/thinker_outline.svg'),
};
