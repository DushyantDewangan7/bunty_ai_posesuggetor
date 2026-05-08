import { Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { usePoseStream } from '../../state/poseStream';
import { usePoseTarget } from '../../state/poseTarget';
import type { PoseLandmark } from '../../types/landmarks';
import { computeBodyOutlinePaths } from '../overlays/bodyOutline';
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
 * Renders the currently-selected target pose as a translucent body silhouette
 * inside the camera Skia canvas. Reference landmarks are stored in canonical
 * pose space (hip mid at origin, shoulder-to-hip distance = 1.0); we project
 * them back into image space using the live user's shoulder-to-hip distance
 * as scale so the ghost appears at the user's body size.
 *
 * Per ADR-001 G27 (2026-05-08): renders as a body-outline silhouette rather
 * than skeleton lines, sharing geometry with the live tracking renderer.
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

  const projected = useMemo(() => {
    if (!target) return null;
    const scale = userShoulderHipScale(latestFrame?.landmarks ?? null) ?? fallbackScale;
    return projectCanonicalToImage(target.referenceLandmarks, anchorX, anchorY, scale);
  }, [target, latestFrame, anchorX, anchorY, fallbackScale]);

  const outline = useMemo(() => {
    if (!projected) return null;
    const screen = imageToScreen(projected, width, height, mirrored);
    return computeBodyOutlinePaths(screen);
  }, [projected, width, height, mirrored]);

  // If the reference data is incoherent, omit the ghost rather than drawing a
  // wrong "you should be here" target. Library entries pass validation upstream
  // so this is defensive; the user should not be misled by a bad reference.
  if (!outline?.valid) return null;

  return (
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
  );
}

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
