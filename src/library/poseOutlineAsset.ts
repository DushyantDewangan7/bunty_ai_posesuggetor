import type { PoseTarget } from '../types/pose';

declare const __DEV__: boolean | undefined;

/**
 * Resolves the SVG outline asset filename for a pose. Per ADR-001 G28:
 *  - If `outlineSvg` is set, return it.
 *  - In dev (`__DEV__`), missing assets fall back to the geometric silhouette
 *    (G27) with a console.warn so the gap is visible during development.
 *  - In production, missing assets throw — every shipped pose MUST have one.
 */
export function getOutlineAssetForPose(pose: PoseTarget): string | null {
  if (pose.outlineSvg) return pose.outlineSvg;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(
      `[PoseOutline] Missing outlineSvg for pose "${pose.id}". ` +
        `Falling back to geometric silhouette (G27, dev only).`,
    );
    return null;
  }
  throw new Error(
    `[PoseOutline] Production build is missing outlineSvg for pose "${pose.id}". ` +
      `All shipped poses MUST have an SVG asset. See ADR-001 G28.`,
  );
}
