import { Circle, Group, Line, Path, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { usePoseStream } from '../../state/poseStream';
import { computeBodyOutlinePaths } from './bodyOutline';
import { POSE_CONNECTIONS, imageToScreen } from './skeletonGeometry';

interface PoseSkeletonProps {
  mirrored?: boolean;
  visibilityThreshold?: number;
  lineWidth?: number;
  pointRadius?: number;
}

const LIVE_FILL_COLOR = '#22C55E';
const LIVE_FILL_OPACITY = 0.4;
const LIVE_EDGE_OPACITY = 0.9;
const LIVE_EDGE_STROKE = 2;

export function PoseSkeleton({
  mirrored = false,
  visibilityThreshold = 0.5,
  lineWidth = 3,
  pointRadius = 4,
}: PoseSkeletonProps): React.JSX.Element | null {
  const { width, height } = useWindowDimensions();
  const latestFrame = usePoseStream((state) => state.latestFrame);

  const screen = useMemo(
    () =>
      latestFrame?.landmarks ? imageToScreen(latestFrame.landmarks, width, height, mirrored) : null,
    [latestFrame, width, height, mirrored],
  );

  const outline = useMemo(
    () => (screen ? computeBodyOutlinePaths(screen, { visibilityThreshold }) : null),
    [screen, visibilityThreshold],
  );

  if (!screen) return null;

  // Body silhouette is the primary representation when geometry is coherent.
  // If the outline is invalid (shoulders/hips occluded) fall back to the
  // skeleton-line renderer so the user still sees their pose tracked.
  if (outline?.valid) {
    return (
      <Group>
        {outline.paths.map((p, i) => (
          <Group key={`outline-${i}`}>
            <Path path={p} color={LIVE_FILL_COLOR} style="fill" opacity={LIVE_FILL_OPACITY} />
            <Path
              path={p}
              color={LIVE_FILL_COLOR}
              style="stroke"
              strokeWidth={LIVE_EDGE_STROKE}
              opacity={LIVE_EDGE_OPACITY}
            />
          </Group>
        ))}
      </Group>
    );
  }

  return (
    <Group>
      {POSE_CONNECTIONS.map(([a, b], i) => {
        const pa = screen[a];
        const pb = screen[b];
        if (!pa || !pb) return null;
        if (pa.visibility < visibilityThreshold || pb.visibility < visibilityThreshold) {
          return null;
        }
        return (
          <Line
            key={`line-${i}`}
            p1={vec(pa.x, pa.y)}
            p2={vec(pb.x, pb.y)}
            color="#00FF88"
            style="stroke"
            strokeWidth={lineWidth}
          />
        );
      })}
      {screen.map((p, i) => {
        if (p.visibility < visibilityThreshold) return null;
        return (
          <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={pointRadius} color={colorForLandmark(i)} />
        );
      })}
    </Group>
  );
}

function colorForLandmark(index: number): string {
  if (index <= 10) return '#FFFFFF';
  if (index === 11 || index === 12 || index === 23 || index === 24) return '#00FF88';
  if (index >= 13 && index <= 22) return '#00CCFF';
  if (index >= 25) return '#FFCC00';
  return '#FFFFFF';
}
