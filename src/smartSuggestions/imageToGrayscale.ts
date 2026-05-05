/**
 * Convert RGBA pixel data to a luminance-only Uint8Array using the Rec. 601
 * luma formula. Pure JS — no native deps. Used to feed pHash with a 1024-byte
 * grayscale buffer derived from a 32x32 Skia snapshot.
 */
export function rgbaToGrayscale(rgba: Uint8Array): Uint8Array {
  if (rgba.length % 4 !== 0) {
    throw new Error(
      `rgbaToGrayscale: input length must be a multiple of 4, got ${rgba.length}`,
    );
  }
  const pixels = rgba.length >> 2;
  const out = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return out;
}
