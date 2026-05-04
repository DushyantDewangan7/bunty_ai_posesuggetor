import { useEffect, useMemo } from 'react';
import { NitroModules } from 'react-native-nitro-modules';

import { normalizePose } from '../ml/normalize';
import { usePoseStream } from '../state/poseStream';
import type { PoseLandmarkResult } from '../native/PoseLandmarker.nitro';
import type { PoseLandmarkerOutput } from '../native/PoseLandmarkerOutput.nitro';
import type { PoseFrame } from '../types/landmarks';

/**
 * Construct (once) a `PoseLandmarkerOutput` Nitro hybrid and wire its
 * `onResults` callback to push frames into `usePoseStream`. Returns the Output
 * for `<Camera outputs={[poseOutput]} />`.
 *
 * Per ADR-001 G14 (2026-05-03): inference runs entirely on the analyzer thread
 * inside `HybridPoseLandmarkerOutput`. The callback installed here fires on the
 * main JS runtime — no worklet, no JSI host-function dispatch from a worklet
 * runtime, no `Variant` return-value marshalling.
 */
export function usePoseLandmarkerOutput(): PoseLandmarkerOutput {
  const output = useMemo(
    () => NitroModules.createHybridObject<PoseLandmarkerOutput>('PoseLandmarkerOutput'),
    [],
  );

  useEffect(() => {
    const setFrame = usePoseStream.getState().setFrame;
    const setFps = usePoseStream.getState().setFps;

    let fpsT0 = performance.now();
    let fpsCount = 0;

    output.setOnResultsCallback((result: PoseLandmarkResult) => {
      const now = performance.now();
      const poseFrame: PoseFrame = {
        landmarks: result.landmarks,
        timestamp: now,
        inferenceMs: result.inferenceMs,
      };
      const normalized: PoseFrame = {
        ...poseFrame,
        landmarks: normalizePose(result.landmarks),
      };
      setFrame(poseFrame, normalized);

      fpsCount += 1;
      const dt = now - fpsT0;
      if (dt >= 1000) {
        setFps((fpsCount * 1000) / dt);
        fpsT0 = now;
        fpsCount = 0;
      }
    });

    return () => {
      output.setOnResultsCallback(undefined);
    };
  }, [output]);

  return output;
}
