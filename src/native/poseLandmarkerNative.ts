import { NitroModules } from 'react-native-nitro-modules';

import type { PoseLandmarker } from './PoseLandmarker.nitro';

let cached: PoseLandmarker | undefined;

/**
 * Lazy accessor for the native pose-landmarker Nitro `HybridObject`.
 *
 * After the Output-attached pivot (ADR-001 G14, 2026-05-03) the worklet-callable
 * factory pattern is gone. This object now only exposes `ping()` and `warmup()`;
 * per-frame inference lives inside `HybridPoseLandmarkerOutput` on the analyzer
 * thread.
 */
export function getPoseLandmarker(): PoseLandmarker {
  if (cached === undefined) {
    cached = NitroModules.createHybridObject<PoseLandmarker>('PoseLandmarker');
  }
  return cached;
}
