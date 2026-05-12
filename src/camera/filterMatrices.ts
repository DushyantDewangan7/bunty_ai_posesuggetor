// TODO: filter rendering pipeline not yet implemented. See ADR-001 G40 (deferred).
import type { FilterId } from '../state/filterPersistence';

// 4x5 ColorMatrix: rows are [R G B A constant_offset]
// Identity matrix — used for the 'none' filter.
export const IDENTITY_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
] as const;

// Black & White: luminance-weighted desaturation.
// Coefficients from ITU-R BT.601 (perceptual luminance).
export const BW_MATRIX = [
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0,     0,     0,     1, 0,
] as const;

// Clarendon (approximation):
//   - Cool shadows (slight blue shift in low values)
//   - Warm highlights (slight orange-yellow shift in high values)
//   - Increased contrast
//   - Slight saturation boost
// Single-pass matrix approximation; real Clarendon uses per-channel tone curves
// that a 4x5 ColorMatrix cannot fully replicate. Acceptable for v1 — see
// ADR-001 G40. Values likely need on-device tuning to suit the camera profile.
export const CLARENDON_MATRIX = [
  1.20,  0.05, -0.10, 0, -0.05,
  0.00,  1.20,  0.05, 0,  0.00,
 -0.05,  0.00,  1.15, 0,  0.05,
  0,     0,     0,    1,  0,
] as const;

export function getFilterMatrix(filter: FilterId): readonly number[] {
  switch (filter) {
    case 'bw':
      return BW_MATRIX;
    case 'clarendon':
      return CLARENDON_MATRIX;
    case 'none':
    default:
      return IDENTITY_MATRIX;
  }
}
