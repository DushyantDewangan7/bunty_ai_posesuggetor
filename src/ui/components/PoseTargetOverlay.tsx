import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { getOutlineAssetForPose } from '../../library/poseOutlineAsset';
import { usePoseStream } from '../../state/poseStream';
import { usePoseTarget } from '../../state/poseTarget';
import type { PoseLandmark } from '../../types/landmarks';
import { computeBodyOutlinePaths } from '../overlays/bodyOutline';
import { PoseOutlineSvg } from '../overlays/PoseOutlineSvg';
import { imageToScreen } from '../overlays/skeletonGeometry';

interface PoseTargetOverlayProps {
  mirrored?: boolean;
  /** Where to anchor the target's hip midpoint, in image space (0–1). */
  anchorX?: number;
  anchorY?: number;
  /** Fallback canonical→image scale when no live person is detected. */
  fallbackScale?: number;
}

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

const GHOST_FILL_COLOR = '#FFFFFF';
const GHOST_FILL_OPACITY = 0.25;
const GHOST_EDGE_OPACITY = 0.7;
const GHOST_EDGE_STROKE = 2.5;

/**
 * Renders the currently-selected target pose as the user-facing pose guide.
 *
 * Per ADR-001 G28: the canonical guide is a clean white dotted SVG contour
 * produced offline by `scripts/generate-pose-outline.mjs`, rendered
 * statically centered in the camera preview. In dev/internal builds, poses
 * without a baked SVG fall back to the geometric silhouette renderer from
 * G27 (with a console.warn fired by `getOutlineAssetForPose`). In
 * production, missing SVGs throw so the gap is impossible to ship.
 *
 * Because the SVG path uses react-native-svg and the fallback uses Skia,
 * this component renders OUTSIDE the main Skia Canvas in CameraScreen and
 * wraps either branch in its own absolute-fill subtree. The fallback wraps
 * the Skia primitives in its own Canvas so that calling code doesn't have
 * to know which renderer is in use.
 *
 * Dynamic body-bbox-driven positioning is deferred (see ADR-001 G32) until
 * the camera frame rotation issue is resolved.
 */
export function PoseTargetOverlay({
  mirrored = false,
  anchorX = 0.5,
  anchorY = 0.55,
  fallbackScale = 0.2,
}: PoseTargetOverlayProps): React.JSX.Element | null {
  const { width, height } = useWindowDimensions();
  const target = usePoseTarget((s) => s.selected);
  const latestFrame = usePoseStream((s) => s.latestFrame);

  if (!target) return null;

  // In production this throws when target.outlineSvg is missing — that's the
  // ADR-001 G28 contract. We deliberately don't catch.
  const outlineAsset = getOutlineAssetForPose(target);

  if (outlineAsset) {
    return (
      <View style={styles.overlay} pointerEvents="none">
        <PoseOutlineSvg outlineAsset={outlineAsset} width={width} height={height} />
      </View>
    );
  }

  // Dev fallback: geometric silhouette (G27). Reference landmarks live in
  // canonical pose space (hip mid at origin, shoulder-to-hip distance = 1.0);
  // we project them back into image space using the live user's
  // shoulder-to-hip distance as scale so the ghost appears at the user's
  // body size.
  return (
    <FallbackGeometricGhost
      mirrored={mirrored}
      anchorX={anchorX}
      anchorY={anchorY}
      fallbackScale={fallbackScale}
      target={target}
      latestFrameLandmarks={latestFrame?.landmarks ?? null}
      width={width}
      height={height}
    />
  );
}

interface FallbackGhostProps {
  mirrored: boolean;
  anchorX: number;
  anchorY: number;
  fallbackScale: number;
  target: NonNullable<ReturnType<typeof usePoseTarget.getState>['selected']>;
  latestFrameLandmarks: PoseLandmark[] | null;
  width: number;
  height: number;
}

function FallbackGeometricGhost({
  mirrored,
  anchorX,
  anchorY,
  fallbackScale,
  target,
  latestFrameLandmarks,
  width,
  height,
}: FallbackGhostProps): React.JSX.Element | null {
  const projected = useMemo(() => {
    const scale = userShoulderHipScale(latestFrameLandmarks) ?? fallbackScale;
    return projectCanonicalToImage(target.referenceLandmarks, anchorX, anchorY, scale);
  }, [target, latestFrameLandmarks, anchorX, anchorY, fallbackScale]);

  const outline = useMemo(() => {
    const screen = imageToScreen(projected, width, height, mirrored);
    return computeBodyOutlinePaths(screen);
  }, [projected, width, height, mirrored]);

  if (!outline?.valid) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Group>
          {outline.paths.map((p, i) => (
            <Group key={`tgt-outline-${i}`}>
              <Path path={p} color={GHOST_FILL_COLOR} style="fill" opacity={GHOST_FILL_OPACITY} />
              <Path
                path={p}
                color={GHOST_FILL_COLOR}
                style="stroke"
                strokeWidth={GHOST_EDGE_STROKE}
                opacity={GHOST_EDGE_OPACITY}
              />
            </Group>
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: StyleSheet.absoluteFillObject,
});

function userShoulderHipScale(landmarks: PoseLandmark[] | null): number | null {
  if (!landmarks) return null;
  const ls = landmarks[LEFT_SHOULDER];
  const rs = landmarks[RIGHT_SHOULDER];
  const lh = landmarks[LEFT_HIP];
  const rh = landmarks[RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return null;
  if (ls.visibility < 0.5 || rs.visibility < 0.5 || lh.visibility < 0.5 || rh.visibility < 0.5) {
    return null;
  }
  const sx = (ls.x + rs.x) / 2;
  const sy = (ls.y + rs.y) / 2;
  const hx = (lh.x + rh.x) / 2;
  const hy = (lh.y + rh.y) / 2;
  const dx = sx - hx;
  const dy = sy - hy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist > 0 ? dist : null;
}

function projectCanonicalToImage(
  canonical: PoseLandmark[],
  anchorX: number,
  anchorY: number,
  scale: number,
): PoseLandmark[] {
  return canonical.map((p) => ({
    x: anchorX + p.x * scale,
    y: anchorY + p.y * scale,
    z: p.z * scale,
    visibility: p.visibility,
    presence: p.presence,
  }));
}
