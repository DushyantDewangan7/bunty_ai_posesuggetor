// Static require() map. Metro requires literal strings inside require(), so
// every shipped pose outline must have a hand-written entry here. Add one
// entry per pose as new SVGs land in assets/poseOutlines/. Prompt B will
// populate the rest of the library; for now only casual-standing-01 is wired.
//
// The value is the Metro asset module ID returned by require() of an .svg
// file (.svg is in Metro's default assetExts, so no transformer is needed).
// Image.resolveAssetSource(...) on this ID returns { uri, width, height },
// which the renderer uses to fetch the SVG XML at runtime.

export const poseOutlineAssets: Record<string, number> = {
  'casual-standing-01_outline.svg': require('../../../assets/poseOutlines/casual-standing-01_outline.svg'),
};
