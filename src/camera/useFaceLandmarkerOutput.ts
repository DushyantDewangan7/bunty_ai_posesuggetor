import { useEffect, useMemo } from 'react';
import { NitroModules } from 'react-native-nitro-modules';

import type {
  FaceLandmarkerOutput,
  FaceLandmarkResult,
} from '../native/FaceLandmarkerOutput.nitro';
import { isFaceCentered, useFaceCapture } from '../state/faceCapture';

/**
 * Construct (once) a `FaceLandmarkerOutput` Nitro hybrid and wire its
 * `onResults` callback to push frames into `useFaceCapture`. Returns the
 * Output for `<Camera outputs={[faceOutput]} />`.
 *
 * Mirrors {@link usePoseLandmarkerOutput} (ADR-001 G14/G15). Used only by
 * the onboarding face-capture screen.
 */
export function useFaceLandmarkerOutput(): FaceLandmarkerOutput {
  const output = useMemo(
    () => NitroModules.createHybridObject<FaceLandmarkerOutput>('FaceLandmarkerOutput'),
    [],
  );

  useEffect(() => {
    const setLatest = useFaceCapture.getState().setLatest;

    output.setOnResultsCallback((result: FaceLandmarkResult) => {
      setLatest(result, isFaceCentered(result));
    });

    return () => {
      output.setOnResultsCallback(undefined);
      useFaceCapture.getState().reset();
    };
  }, [output]);

  return output;
}
