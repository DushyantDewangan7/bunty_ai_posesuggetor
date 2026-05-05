/**
 * Frame capture for smart suggestions.
 *
 * Phase 4-B implementation. Captures a single still photo via vision-camera's
 * photoOutput, decodes + downscales + JPEG re-encodes via Skia, and returns
 * a base64 string suitable for Gemini's inline_data.
 *
 * Why photoOutput, not cameraRef.takePhoto: vision-camera 5.x removed the
 * imperative ref-based API in favor of declarative outputs. CameraScreen wires
 * a CameraPhotoOutput from `usePhotoOutput()` into the Camera's outputs array
 * (alongside the existing pose output) and passes that handle here.
 *
 * Why Skia for resize, not react-native-image-resizer: Skia is already a dep
 * for the pose overlay rendering. Adding a second native image library for
 * one resize call would force a prebuild and grow the binary for no benefit.
 * `MakeImageFromEncoded` + offscreen `Surface` + `encodeToBase64` covers it.
 *
 * Output: base64 string (no data-URL prefix), JPEG-encoded, longest side fits
 * within MAX_DIMENSION while preserving aspect ratio.
 */

import { ImageFormat, Skia } from '@shopify/react-native-skia';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

export const MAX_DIMENSION = 768;
export const JPEG_QUALITY = 80;

export async function captureCurrentFrame(photoOutput: CameraPhotoOutput): Promise<string> {
  const photo = await photoOutput.capturePhoto({ flashMode: 'off', enableShutterSound: false }, {});

  let encodedBytes: ArrayBuffer;
  try {
    encodedBytes = await photo.getFileDataAsync();
  } finally {
    photo.dispose();
  }

  const data = Skia.Data.fromBytes(new Uint8Array(encodedBytes));
  const sourceImage = Skia.Image.MakeImageFromEncoded(data);
  if (!sourceImage) {
    throw new Error('captureCurrentFrame: Skia could not decode captured photo');
  }

  const sw = sourceImage.width();
  const sh = sourceImage.height();
  const longest = Math.max(sw, sh);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const targetW = Math.max(1, Math.round(sw * scale));
  const targetH = Math.max(1, Math.round(sh * scale));

  const surface = Skia.Surface.MakeOffscreen(targetW, targetH);
  if (!surface) {
    throw new Error('captureCurrentFrame: Skia could not allocate offscreen surface');
  }

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  canvas.drawImageRect(
    sourceImage,
    Skia.XYWHRect(0, 0, sw, sh),
    Skia.XYWHRect(0, 0, targetW, targetH),
    paint,
  );

  const snapshot = surface.makeImageSnapshot();
  return snapshot.encodeToBase64(ImageFormat.JPEG, JPEG_QUALITY);
}
