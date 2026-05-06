/**
 * Per-device daily rate limit for Smart Suggestions API calls.
 *
 * Why client-side: the spec is personal-scope-only (no backend yet), so the
 * cap protects the user's dev-key quota from accidental burn during active
 * testing. A server-side limit will replace this once the backend proxy ships.
 *
 * Storage: dedicated MMKV id 'smart-suggestions-usage' so its lifecycle is
 * independent of the user-profile / custom-poses stores. Two keys:
 *   usage.count.v1     — number, today's count
 *   usage.resetDate.v1 — string, YYYY-MM-DD in device local timezone
 *
 * Reset is lazy: each consume() / status() compares today's local date string
 * to the stored one; mismatch zeros the counter. No background timer.
 *
 * Cache hits do NOT consume. The button calls consume() only after a cache
 * miss, immediately before callGeminiAPI. See ADR G24.
 */

const MMKV_ID = 'smart-suggestions-usage';
const COUNT_KEY = 'usage.count.v1';
const RESET_DATE_KEY = 'usage.resetDate.v1';
const DEFAULT_DAILY_CAP = 50;

/** Minimal storage surface so tests can inject a Map-backed fake. */
export interface RateLimiterStorage {
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  set(key: string, value: string | number): void;
}

export interface RateLimitConfig {
  dailyCap: number;
  now: () => Date;
  storage: RateLimiterStorage;
}

export interface RateLimitStatus {
  /** True if a fresh consume() would succeed. */
  allowed: boolean;
  /** Remaining requests before the cap. Clamped at 0. */
  remaining: number;
  /** Local-midnight Date at which the counter resets. */
  resetAt: Date;
  /** Today's running count (after lazy reset is applied). */
  currentCount: number;
}

function localDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nextLocalMidnight(d: Date): Date {
  const next = new Date(d);
  next.setHours(24, 0, 0, 0);
  return next;
}

export class SmartSuggestionsRateLimiter {
  private readonly dailyCap: number;
  private readonly now: () => Date;
  private readonly storage: RateLimiterStorage;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.dailyCap = config.dailyCap ?? DEFAULT_DAILY_CAP;
    this.now = config.now ?? (() => new Date());
    this.storage = config.storage ?? defaultStorage();
  }

  /** Read-only check, used for UI display. */
  status(): RateLimitStatus {
    const today = this.now();
    const todayKey = localDateString(today);
    const lastReset = this.storage.getString(RESET_DATE_KEY);
    const count = lastReset === todayKey ? (this.storage.getNumber(COUNT_KEY) ?? 0) : 0;
    return {
      allowed: count < this.dailyCap,
      remaining: Math.max(0, this.dailyCap - count),
      resetAt: nextLocalMidnight(today),
      currentCount: count,
    };
  }

  /**
   * Atomically check + consume one request. Returns true if allowed and the
   * counter was incremented; false if at cap (counter unchanged). Caller must
   * not invoke the API on false.
   */
  consume(): boolean {
    const today = this.now();
    const todayKey = localDateString(today);
    const lastReset = this.storage.getString(RESET_DATE_KEY);
    let count = lastReset === todayKey ? (this.storage.getNumber(COUNT_KEY) ?? 0) : 0;

    if (count >= this.dailyCap) {
      // Persist the rolled-over date even on refusal so a stale resetDate
      // doesn't perpetually re-load the previous day's count.
      if (lastReset !== todayKey) {
        this.storage.set(RESET_DATE_KEY, todayKey);
        this.storage.set(COUNT_KEY, 0);
      }
      return false;
    }

    count += 1;
    this.storage.set(COUNT_KEY, count);
    this.storage.set(RESET_DATE_KEY, todayKey);
    return true;
  }

  /** Force-reset to zero. For tests and a hypothetical "reset usage" debug. */
  reset(): void {
    this.storage.set(COUNT_KEY, 0);
    this.storage.set(RESET_DATE_KEY, localDateString(this.now()));
  }
}

let lazyDefaultStorage: RateLimiterStorage | null = null;
function defaultStorage(): RateLimiterStorage {
  if (lazyDefaultStorage) return lazyDefaultStorage;
  // Lazy require: keeps `react-native-mmkv`'s native module out of unit-test
  // module graphs that don't construct the limiter with real storage.
  const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = createMMKV({ id: MMKV_ID });
  lazyDefaultStorage = {
    getString: (k) => mmkv.getString(k),
    getNumber: (k) => mmkv.getNumber(k),
    set: (k, v) => mmkv.set(k, v),
  };
  return lazyDefaultStorage;
}

let lazySingleton: SmartSuggestionsRateLimiter | null = null;
export function smartSuggestionsRateLimiter(): SmartSuggestionsRateLimiter {
  if (!lazySingleton) lazySingleton = new SmartSuggestionsRateLimiter();
  return lazySingleton;
}
