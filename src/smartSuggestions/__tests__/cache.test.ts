import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { SmartSuggestionResult } from '../../types/smartSuggestions';
import { SmartSuggestionsCache } from '../cache.ts';

function makeResult(label: string): SmartSuggestionResult {
  return {
    recommendations: [{ poseId: `pose-${label}`, reasoning: label, rank: 1 }],
    sceneDescription: `scene-${label}`,
    fromCache: false,
    timestamp: '2026-05-05T00:00:00.000Z',
  };
}

// Build a 16-char hex hash where each nibble pair is `byte`. Useful for
// constructing inputs with a known pairwise Hamming distance.
function uniformHash(byte: number): string {
  return byte.toString(16).padStart(2, '0').repeat(8);
}

describe('SmartSuggestionsCache', () => {
  it('returns null on empty lookup', () => {
    const cache = new SmartSuggestionsCache();
    assert.equal(cache.lookup(uniformHash(0)), null);
    assert.equal(cache.size(), 0);
  });

  it('returns the stored result for an identical hash', () => {
    const cache = new SmartSuggestionsCache();
    const hash = uniformHash(0xab);
    cache.store(hash, makeResult('a'));
    const hit = cache.lookup(hash);
    assert.ok(hit);
    assert.equal(hit.recommendations[0]!.poseId, 'pose-a');
  });

  it('returns the stored result when Hamming distance is within threshold', () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 8 });
    // 0x00 vs 0x01 differs in 1 bit per byte * 8 bytes = 8 bits — exactly at threshold.
    cache.store(uniformHash(0x00), makeResult('a'));
    const hit = cache.lookup(uniformHash(0x01));
    assert.ok(hit);
    assert.equal(hit.recommendations[0]!.poseId, 'pose-a');
  });

  it('returns null when Hamming distance exceeds threshold', () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 8 });
    // 0x00 vs 0x03 differs in 2 bits per byte * 8 bytes = 16 bits — well over.
    cache.store(uniformHash(0x00), makeResult('a'));
    assert.equal(cache.lookup(uniformHash(0x03)), null);
  });

  it('returns null for entries past TTL', () => {
    let now = 1_000_000;
    const cache = new SmartSuggestionsCache({ ttlMs: 1000, now: () => now });
    cache.store(uniformHash(0xab), makeResult('a'));
    now += 999;
    assert.ok(cache.lookup(uniformHash(0xab)));
    now += 2;
    assert.equal(cache.lookup(uniformHash(0xab)), null);
  });

  it('evicts the oldest entry when at capacity', () => {
    // matchDistance: 0 — only exact hash matches count, so unrelated hashes
    // do not collide via fuzzy lookup and confuse the eviction assertions.
    const cache = new SmartSuggestionsCache({ maxEntries: 3, matchDistance: 0 });
    cache.store(uniformHash(0x10), makeResult('first'));
    cache.store(uniformHash(0x20), makeResult('second'));
    cache.store(uniformHash(0x30), makeResult('third'));
    cache.store(uniformHash(0x40), makeResult('fourth'));
    assert.equal(cache.size(), 3);
    assert.equal(cache.lookup(uniformHash(0x10)), null, 'first should have been evicted');
    assert.ok(cache.lookup(uniformHash(0x20)));
    assert.ok(cache.lookup(uniformHash(0x30)));
    assert.ok(cache.lookup(uniformHash(0x40)));
  });

  it('promotes hit entries to MRU so they survive subsequent eviction', () => {
    const cache = new SmartSuggestionsCache({ maxEntries: 3, matchDistance: 0 });
    cache.store(uniformHash(0x10), makeResult('first'));
    cache.store(uniformHash(0x20), makeResult('second'));
    cache.store(uniformHash(0x30), makeResult('third'));
    // Touch the first entry — should become MRU.
    cache.lookup(uniformHash(0x10));
    // Insert a new entry; the now-LRU is the second.
    cache.store(uniformHash(0x40), makeResult('fourth'));
    assert.ok(cache.lookup(uniformHash(0x10)), 'first should survive');
    assert.equal(cache.lookup(uniformHash(0x20)), null, 'second should have been evicted');
  });

  it('returns the closest match when multiple entries are within threshold', () => {
    const cache = new SmartSuggestionsCache({ matchDistance: 16 });
    cache.store(uniformHash(0x00), makeResult('zero'));
    cache.store(uniformHash(0x03), makeResult('three')); // 16 bits from 0x00
    // Query 0x01 — distance to 0x00 = 8 bits, distance to 0x03 = 8 bits (0x01 ^ 0x03 = 0x02 = 1 bit/byte * 8).
    // Query 0x00 directly → exact match wins.
    const hit = cache.lookup(uniformHash(0x00));
    assert.ok(hit);
    assert.equal(hit.recommendations[0]!.poseId, 'pose-zero');
  });

  it('clear() empties the cache', () => {
    const cache = new SmartSuggestionsCache();
    cache.store(uniformHash(0x10), makeResult('a'));
    cache.store(uniformHash(0x20), makeResult('b'));
    assert.equal(cache.size(), 2);
    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(cache.lookup(uniformHash(0x10)), null);
  });

  it('refreshes storedAt when storing the same hash again', () => {
    let now = 1_000_000;
    const cache = new SmartSuggestionsCache({ ttlMs: 1000, now: () => now });
    cache.store(uniformHash(0xab), makeResult('a'));
    now += 800;
    // Re-store the same hash with a new result — bumps storedAt.
    cache.store(uniformHash(0xab), makeResult('a2'));
    now += 800; // 1600ms after the first store, but only 800ms after re-store.
    const hit = cache.lookup(uniformHash(0xab));
    assert.ok(hit);
    assert.equal(hit.recommendations[0]!.poseId, 'pose-a2');
  });
});
