import type { SmartSuggestionResult } from '../types/smartSuggestions';
import { hammingDistance } from './pHash.ts';

interface CacheEntry {
  hash: string;
  result: SmartSuggestionResult;
  storedAt: number;
}

export interface CacheConfig {
  /** Max entries before LRU eviction kicks in. */
  maxEntries: number;
  /** Time-to-live in ms; entries older than this are treated as misses. */
  ttlMs: number;
  /** Hamming distance threshold; lookups within this distance are hits. */
  matchDistance: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now: () => number;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxEntries: 20,
  ttlMs: 5 * 60 * 1000,
  matchDistance: 8,
  now: () => Date.now(),
};

/**
 * Bounded LRU cache for SmartSuggestionResult, keyed by perceptual-hash with
 * Hamming-distance lookup. In-memory only — does not persist across app
 * restarts, by design (matches Phase 3B novelty pattern, see ADR G23).
 *
 * Eviction order is insertion order; touching an entry on hit promotes it to
 * the most-recently-used end. TTL is enforced lazily at lookup time.
 */
export class SmartSuggestionsCache {
  private readonly config: CacheConfig;
  // Insertion-ordered map: oldest entry is the first key, newest is the last.
  private readonly entries: Map<string, CacheEntry>;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.entries = new Map();
  }

  lookup(queryHash: string): SmartSuggestionResult | null {
    const now = this.config.now();
    const cutoff = now - this.config.ttlMs;

    let bestKey: string | null = null;
    let bestDistance = this.config.matchDistance + 1;
    let nearestDistance = 65;
    let nearestKey: string | null = null;

    for (const [key, entry] of this.entries) {
      if (entry.storedAt < cutoff) continue;
      const d = hammingDistance(queryHash, entry.hash);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearestKey = key;
      }
      if (d <= this.config.matchDistance && d < bestDistance) {
        bestDistance = d;
        bestKey = key;
      }
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        `[smartSuggestions.cache] lookup hash=${queryHash} entries=${this.entries.size}` +
          ` nearest=${nearestKey ?? 'none'} nearestDist=${nearestDistance}` +
          ` threshold=${this.config.matchDistance}` +
          ` -> ${bestKey ? 'HIT' : 'MISS'}`,
      );
    }

    if (bestKey === null) return null;

    // Promote to MRU end so it survives the next eviction.
    const hit = this.entries.get(bestKey)!;
    this.entries.delete(bestKey);
    this.entries.set(bestKey, hit);
    return hit.result;
  }

  store(hash: string, result: SmartSuggestionResult): void {
    if (this.entries.has(hash)) {
      // Refresh existing entry — re-insert to move it to MRU end.
      this.entries.delete(hash);
    } else if (this.entries.size >= this.config.maxEntries) {
      // Evict LRU (first key in insertion order).
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(hash, {
      hash,
      result,
      storedAt: this.config.now(),
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        `[smartSuggestions.cache] store hash=${hash} size=${this.entries.size}/${this.config.maxEntries}`,
      );
    }
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

declare const __DEV__: boolean | undefined;

export const smartSuggestionsCache = new SmartSuggestionsCache();
