import { Circle, Group, Line, vec } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';

import { usePoseStream } from '../../state/poseStream';
import { POSE_CONNECTIONS, imageToScreen } from './skeletonGeometry';

interface PoseSkeletonProps {
  mirrored?: boolean;
  visibilityThreshold?: number;
  lineWidth?: number;
  pointRadius?: number;
}

export function PoseSkeleton({
  mirrored = false,
  visibilityThreshold = 0.5,
  lineWidth = 3,
  pointRadius = 4,
}: PoseSkeletonProps): React.JSX.Element | null {
  const { width, height } = useWindowDimensions();
  const latestFrame = usePoseStream((state) => state.latestFrame);

  if (!latestFrame?.landmarks) return null;
  const screen = imageToScreen(latestFrame.landmarks, width, height, mirrored);

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
