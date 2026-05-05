/**
 * Frame capture for Phase 4-A smart suggestions.
 *
 * Phase 4-A scope (this session): function signature + documentation only.
 * The RN runtime wiring (real camera ref, expo-image-manipulator resize,
 * JPEG re-encode) lands in Phase 4-B alongside SmartSuggestionsButton, where
 * the camera ref and image-manipulator package are wired together with the UI.
 *
 * The offline harness (scripts/smartSuggestions-harness.mjs) bypasses this
 * module entirely and reads a test image from disk. So Phase 4-A's offline
 * pipeline (prompt build → API call → response parse) can be exercised
 * end-to-end without a device.
 *
 * Phase 4-B will install:
 *   - expo-camera (or react-native-view-shot) for `takePictureAsync` / capture
 *   - expo-image-manipulator for resize + JPEG re-encode at quality 80
 *
 * Output contract: base64 string with no data-URL prefix, JPEG-encoded,
 * downscaled to fit within MAX_DIMENSION x MAX_DIMENSION while preserving
 * aspect ratio.
 */

export const MAX_DIMENSION = 768;
export const JPEG_QUALITY = 80;

/**
 * Phase 4-B will replace this opaque type with the actual camera ref shape
 * (e.g. `RefObject<Camera>` from expo-camera). Kept as `unknown` to avoid
 * pulling RN-only types into modules that the harness imports.
 */
export type CameraRefLike = unknown;

/**
 * Capture the current camera frame and return it as a base64 JPEG string.
 *
 * @throws Error("Phase 4-B not yet implemented") — until Phase 4-B wires
 *         expo-camera + expo-image-manipulator. Use the harness for offline
 *         pipeline testing.
 */
export async function captureCurrentFrame(_cameraRef: CameraRefLike): Promise<string> {
  throw new Error(
    'captureCurrentFrame: not implemented in Phase 4-A. Wire expo-camera + expo-image-manipulator in Phase 4-B; use scripts/smartSuggestions-harness.mjs for offline testing.',
  );
}
