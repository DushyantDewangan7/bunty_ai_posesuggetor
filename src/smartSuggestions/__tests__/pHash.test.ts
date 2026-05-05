import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { computePHash, hammingDistance } from '../pHash.ts';

function naturalish(seed: number): Uint8Array {
  // Sum of a few sinusoids — gives a non-degenerate DCT spectrum, closer to a
  // real photograph than a single-frequency gradient. A single-pixel tweak on
  // such an image should only nudge one or two near-threshold coefficients.
  const a = new Uint8Array(32 * 32);
  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      const v =
        128 +
        40 * Math.sin((c + seed) / 4) +
        30 * Math.cos(r / 5) +
        20 * Math.sin((r + c) / 3) +
        15 * Math.cos((r - c + seed) / 6);
      a[r * 32 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return a;
}

function gradient(seed: number): Uint8Array {
  const a = new Uint8Array(32 * 32);
  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      a[r * 32 + c] = (c * 8 + seed) & 0xff;
    }
  }
  return a;
}

function diagonal(): Uint8Array {
  const a = new Uint8Array(32 * 32);
  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      a[r * 32 + c] = ((r + c) * 4) & 0xff;
    }
  }
  return a;
}

function checkerboard(): Uint8Array {
  const a = new Uint8Array(32 * 32);
  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      a[r * 32 + c] = (r + c) & 1 ? 250 : 5;
    }
  }
  return a;
}

describe('computePHash', () => {
  it('produces a 16-char hex hash', () => {
    const h = computePHash(gradient(0));
    assert.equal(h.length, 16);
    assert.match(h, /^[0-9a-f]{16}$/);
  });

  it('is deterministic for identical inputs', () => {
    const a = gradient(0);
    const b = gradient(0);
    assert.equal(computePHash(a), computePHash(b));
  });

  it('throws when the buffer is not 1024 bytes', () => {
    assert.throws(() => computePHash(new Uint8Array(100)), /expected 1024 bytes/);
  });

  it('produces small Hamming distance for a near-identical image (one pixel changed)', () => {
    const a = naturalish(0);
    const b = naturalish(0);
    b[16 * 32 + 16] = Math.min(255, b[16 * 32 + 16]! + 30);
    const d = hammingDistance(computePHash(a), computePHash(b));
    assert.ok(d <= 4, `expected distance <= 4, got ${d}`);
  });

  it('produces large Hamming distance for visually different patterns', () => {
    const a = naturalish(0);
    const b = checkerboard();
    const d = hammingDistance(computePHash(a), computePHash(b));
    assert.ok(d > 20, `expected distance > 20, got ${d}`);
  });

  it('produces different hashes for distinct directional patterns', () => {
    const horiz = gradient(0);
    const diag = diagonal();
    const d = hammingDistance(computePHash(horiz), computePHash(diag));
    assert.ok(d > 8, `expected distance > 8 between horizontal and diagonal, got ${d}`);
  });
});

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    assert.equal(hammingDistance('0000000000000000', '0000000000000000'), 0);
    assert.equal(hammingDistance('a3f2b1c0d4e5f607', 'a3f2b1c0d4e5f607'), 0);
  });

  it('is 64 for hashes that differ in every bit', () => {
    assert.equal(hammingDistance('0000000000000000', 'ffffffffffffffff'), 64);
  });

  it('counts single-bit differences correctly', () => {
    assert.equal(hammingDistance('0000000000000000', '0000000000000001'), 1);
    assert.equal(hammingDistance('0000000000000000', '8000000000000000'), 1);
  });

  it('throws on malformed input lengths', () => {
    assert.throws(() => hammingDistance('abc', 'def'), /expected 16-char hashes/);
  });
});
