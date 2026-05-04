import { Circle, Group, Line, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { usePoseStream } from '../../state/poseStream';
import { usePoseTarget } from '../../state/poseTarget';
import type { PoseLandmark } from '../../types/landmarks';
import { POSE_CONNECTIONS, imageToScreen } from '../overlays/skeletonGeometry';

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

const GHOST_LINE_COLOR = 'rgba(255, 255, 255, 0.55)';
const GHOST_POINT_COLOR = 'rgba(255, 255, 255, 0.85)';

/**
 * Renders the currently-selected target pose as a translucent ghost skeleton
 * inside the camera Skia canvas. Reference landmarks are stored in canonical
 * pose space (hip mid at origin, shoulder-to-hip distance = 1.0); we project
 * them back into image space using the live user's shoulder-to-hip distance
 * as scale so the ghost appears at the user's body size.
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

  if (!projected) return null;

  const screen = imageToScreen(projected, width, height, mirrored);

  return (
    <Group>
      {POSE_CONNECTIONS.map(([a, b], i) => {
        const pa = screen[a];
        const pb = screen[b];
        if (!pa || !pb) return null;
        return (
          <Line
            key={`tgt-line-${i}`}
            p1={vec(pa.x, pa.y)}
            p2={vec(pb.x, pb.y)}
            color={GHOST_LINE_COLOR}
            style="stroke"
            strokeWidth={4}
          />
        );
      })}
      {screen.map((p, i) => (
        <Circle key={`tgt-pt-${i}`} cx={p.x} cy={p.y} r={5} color={GHOST_POINT_COLOR} />
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
