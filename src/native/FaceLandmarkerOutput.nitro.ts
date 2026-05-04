import type { CameraOutput } from 'react-native-vision-camera';

/**
 * One landmark in MediaPipe's face-mesh space, normalized to [0,1] within the
 * input frame's coordinate system. Unlike pose landmarks, face-mesh points
 * carry no visibility/presence — the model emits all 468 every inference or
 * none at all.
 */
export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Result of a single MediaPipe face-mesh inference. `landmarks` always has
 * exactly 468 entries when present (full mesh) — the MediaPipe face model's
 * fixed schema. `inferenceMs` is the wall-clock time spent in `detectForVideo`.
 */
export interface FaceLandmarkResult {
  landmarks: FaceLandmark[];
  inferenceMs: number;
}

/**
 * Output-attached MediaPipe face-landmarker. Mirrors {@linkcode
 * PoseLandmarkerOutput} exactly (ADR-001 G14): owns its own
 * `androidx.camera.core.ImageAnalysis` UseCase, runs inference inline on the
 * analyzer thread, emits results via a regular (non-worklet) Nitro callback.
 *
 * Used only during onboarding's face-capture step (ADR-001 G15) — never on
 * the main camera preview. Construct via
 * `NitroModules.createHybridObject<FaceLandmarkerOutput>('FaceLandmarkerOutput')`
 * and pass through `<Camera outputs={[faceOutput]} />`.
 */
export interface FaceLandmarkerOutput extends CameraOutput {
  /**
   * Install (or remove, by passing `undefined`) the callback invoked on every
   * successful MediaPipe inference. Fires on the main JS runtime, not a
   * worklet — landmarks can be pushed straight into a Zustand store.
   *
   * Drops the result silently (no callback fired) when no face is detected.
   */
  setOnResultsCallback(onResults: ((result: FaceLandmarkResult) => void) | undefined): void;
}
