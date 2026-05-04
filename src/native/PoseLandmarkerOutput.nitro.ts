import type { CameraOutput } from 'react-native-vision-camera';

import type { PoseLandmarkResult } from './PoseLandmarker.nitro';

/**
 * A native Vision Camera v5 {@linkcode CameraOutput} that owns its own
 * `androidx.camera.core.ImageAnalysis` UseCase, runs MediaPipe pose-landmark
 * inference inline on the analyzer thread, and emits results back to the main
 * JS runtime via a regular (non-worklet) callback.
 *
 * This is the production pattern (ADR-001 G14, 2026-05-03) that replaces the
 * worklet-callable factory hybrid — see the canonical
 * `react-native-vision-camera-barcode-scanner` `HybridBarcodeScannerOutput`.
 *
 * Inference does NOT cross the JSI worklet boundary; the only JSI call is the
 * `setOnResultsCallback`-installed callback being invoked from the analyzer
 * thread back to the main runtime, which Nitro marshals natively.
 *
 * Construct via `NitroModules.createHybridObject<PoseLandmarkerOutput>('PoseLandmarkerOutput')`
 * and pass through `<Camera outputs={[poseOutput]} />`.
 */
export interface PoseLandmarkerOutput extends CameraOutput {
  /**
   * Install (or remove, by passing `undefined`) the callback invoked on every
   * successful MediaPipe inference. The callback fires on the main JS runtime,
   * not a worklet — landmarks can be pushed straight into a Zustand store.
   *
   * The Output drops the result silently (no callback fired) when no pose is
   * detected — the JS side's "no person" UX is driven by FPS not falling to
   * zero plus the staleness check in `usePoseStream`.
   */
  setOnResultsCallback(onResults: ((result: PoseLandmarkResult) => void) | undefined): void;
}
