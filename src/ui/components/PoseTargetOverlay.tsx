import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { getOutlineAssetForPose } from '../../library/poseOutlineAsset';
import { usePoseStream } from '../../state/poseStream';
import { usePoseTarget } from '../../state/poseTarget';
import type { PoseLandmark } from '../../types/landmarks';
import { computeBodyOutlinePaths } from '../overlays/bodyOutline';
import { computeBodyBBox } from '../overlays/bodyBoundingBox';
import {
  applyMissingUpdate,
  applyValidUpdate,
  createInitialTransform,
  type SmoothedTransform,
} from '../overlays/outlineSmoothing';
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
 * Per ADR-001 G28/G36: the canonical guide is a clean white dotted SVG
 * contour produced offline by `scripts/generate-pose-outline.mjs`, wrapped
 * in a transform-bearing View that translates and scales the outline to
 * follow the user's torso center and body height in real time (G36).
 * Smoothing + hold/fade on landmark loss live in `outlineSmoothing.ts`;
 * bbox computation in `bodyBoundingBox.ts`. In dev/internal builds, poses
 * without a baked SVG fall back to the geometric silhouette renderer from
 * G27 (with a console.warn fired by `getOutlineAssetForPose`). In
 * production, missing SVGs throw so the gap is impossible to ship.
 *
 * Because the SVG path uses react-native-svg and the fallback uses Skia,
 * this component renders OUTSIDE the main Skia Canvas in CameraScreen and
 * wraps either branch in its own absolute-fill subtree. The fallback wraps
 * the Skia primitives in its own Canvas so that calling code doesn't have
 * to know which renderer is in use.
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
      <DynamicPoseOutline outlineAsset={outlineAsset} previewWidth={width} previewHeight={height} />
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

interface DynamicPoseOutlineProps {
  outlineAsset: string;
  previewWidth: number;
  previewHeight: number;
}

// SVG viewBox is 1000×1000 with `xMidYMid meet`, so at scale=1 the body is
// rendered into a square area of edge `min(previewWidth, previewHeight)`
// centered in the preview, occupying SVG_BODY_FRACTION of that square.
const SVG_BODY_FRACTION = 0.9;
// Tick rate for the smoothing heartbeat. Faster than landmark callbacks
// (~10–15 fps) so the fade animation runs visibly smooth even between frames.
const SMOOTHING_TICK_MS = 50;
// Frames older than this are treated as "no person in view" and trigger
// the missing-update / fade path. Native silently drops no-person frames,
// so latestFrame.timestamp is the only signal.
const STALE_FRAME_MS = 250;

function DynamicPoseOutline({
  outlineAsset,
  previewWidth,
  previewHeight,
}: DynamicPoseOutlineProps): React.JSX.Element {
  const [smoothed, setSmoothed] = useState<SmoothedTransform>(createInitialTransform);

  // At scale=1 the displayed body height is `SVG_BODY_FRACTION * fitDim`
  // pixels (fitDim = the shorter of preview width/height because of the
  // SVG's `xMidYMid meet` aspect-fit). We want it to equal
  // `bbox.height * previewHeight` pixels, so scale = ratio of the two.
  const fitDim = Math.min(previewWidth, previewHeight);
  const scaleDenominator = SVG_BODY_FRACTION * fitDim;

  useEffect(() => {
    const id = setInterval(() => {
      const frame = usePoseStream.getState().latestFrame;
      const now = Date.now();
      const isFresh =
        frame?.landmarks != null && performance.now() - frame.timestamp < STALE_FRAME_MS;
      if (isFresh) {
        const bbox = computeBodyBBox(frame!.landmarks);
        if (bbox.isValid) {
          const targetScale = (bbox.height * previewHeight) / scaleDenominator;
          setSmoothed((curr) =>
            applyValidUpdate(
              curr,
              { centerX: bbox.centerX, centerY: bbox.centerY, scale: targetScale },
              now,
            ),
          );
          return;
        }
      }
      setSmoothed((curr) => applyMissingUpdate(curr, now));
    }, SMOOTHING_TICK_MS);
    return () => clearInterval(id);
  }, [previewHeight, scaleDenominator]);

  const wrapperStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: previewWidth,
      height: previewHeight,
      opacity: smoothed.opacity,
      transform: [
        { translateX: smoothed.centerX * previewWidth - previewWidth / 2 },
        { translateY: smoothed.centerY * previewHeight - previewHeight / 2 },
        { scale: smoothed.scale },
      ],
    }),
    [previewWidth, previewHeight, smoothed],
  );

  return (
    <View style={wrapperStyle} pointerEvents="none">
      <PoseOutlineSvg outlineAsset={outlineAsset} width={previewWidth} height={previewHeight} />
    </View>
  );
}
