/**
 * Perceptual hash for an image. 64-bit hash returned as a 16-char hex string.
 *
 * Hamming distance between two pHashes correlates with perceptual similarity:
 *   distance 0      = identical pixels
 *   distance 1-8    = visually similar (same scene, slight movement)
 *   distance 9+     = different scene
 *
 * Algorithm (standard pHash):
 *   1. Caller supplies a 32x32 grayscale Uint8Array (1024 bytes, row-major).
 *   2. Apply 2D DCT-II (DCT on each row, then on each column).
 *   3. Take the top-left 8x8 block (low frequencies). Skip [0][0] (DC) when
 *      computing the threshold so brightness shifts do not flip every bit.
 *   4. Threshold = median of the remaining 63 coefficients.
 *   5. For each of the 64 cells, bit = 1 if coefficient > threshold else 0.
 *
 * The DCT cosine basis is precomputed once at module load.
 *
 * Performance: 32-point row DCT is O(32^2) = 1024 multiplications per row,
 * times 32 rows = ~33k mults per pass, times 2 passes = ~66k mults total.
 * Comfortably under 50ms on the Samsung A22 5G in JS.
 */

const N = 32;

const COSINE: Float64Array = (() => {
  const c = new Float64Array(N * N);
  for (let k = 0; k < N; k++) {
    for (let n = 0; n < N; n++) {
      c[k * N + n] = Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N));
    }
  }
  return c;
})();

function dct1d(input: Float64Array, output: Float64Array): void {
  for (let k = 0; k < N; k++) {
    let sum = 0;
    const base = k * N;
    for (let n = 0; n < N; n++) {
      sum += input[n]! * COSINE[base + n]!;
    }
    output[k] = sum;
  }
}

function dct2d(pixels: Uint8Array): Float64Array {
  // First pass: DCT on each row. rowBuf reused.
  const rowBuf = new Float64Array(N);
  const rowOut = new Float64Array(N);
  const intermediate = new Float64Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      rowBuf[c] = pixels[r * N + c]!;
    }
    dct1d(rowBuf, rowOut);
    for (let c = 0; c < N; c++) {
      intermediate[r * N + c] = rowOut[c]!;
    }
  }
  // Second pass: DCT on each column of intermediate.
  const colBuf = new Float64Array(N);
  const colOut = new Float64Array(N);
  const result = new Float64Array(N * N);
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      colBuf[r] = intermediate[r * N + c]!;
    }
    dct1d(colBuf, colOut);
    for (let r = 0; r < N; r++) {
      result[r * N + c] = colOut[r]!;
    }
  }
  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function computePHash(grayscale32x32: Uint8Array): string {
  if (grayscale32x32.length !== N * N) {
    throw new Error(`computePHash: expected ${N * N} bytes, got ${grayscale32x32.length}`);
  }
  const dct = dct2d(grayscale32x32);

  // Extract top-left 8x8 block.
  const block: number[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      block.push(dct[r * N + c]!);
    }
  }
  // Threshold = median of all but the DC (index 0).
  const threshold = median(block.slice(1));

  // Build 64 bits MSB-first into 8 bytes.
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 64; i++) {
    if (block[i]! > threshold) {
      bytes[i >> 3]! |= 1 << (7 - (i & 7));
    }
  }

  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

const POPCOUNT_TABLE: Uint8Array = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    let c = 0;
    while (v) {
      c += v & 1;
      v >>= 1;
    }
    t[i] = c;
  }
  return t;
})();

export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== 16 || hashB.length !== 16) {
    throw new Error(
      `hammingDistance: expected 16-char hashes, got ${hashA.length} and ${hashB.length}`,
    );
  }
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    const a = parseInt(hashA.substring(i, i + 2), 16);
    const b = parseInt(hashB.substring(i, i + 2), 16);
    d += POPCOUNT_TABLE[a ^ b]!;
  }
  return d;
}
