import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { type RateLimiterStorage, SmartSuggestionsRateLimiter } from '../rateLimiter.ts';

function makeFakeStorage(): RateLimiterStorage {
  const map = new Map<string, string | number>();
  return {
    getString: (k) => {
      const v = map.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (k) => {
      const v = map.get(k);
      return typeof v === 'number' ? v : undefined;
    },
    set: (k, v) => {
      map.set(k, v);
    },
  };
}

function fixedNow(d: Date): () => Date {
  return () => new Date(d);
}

describe('SmartSuggestionsRateLimiter', () => {
  it('fresh limiter reports allowed=true, remaining=50, currentCount=0', () => {
    const rl = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: fixedNow(new Date('2026-05-06T10:00:00')),
    });
    const s = rl.status();
    assert.equal(s.allowed, true);
    assert.equal(s.remaining, 50);
    assert.equal(s.currentCount, 0);
  });

  it('after one consume, currentCount=1, remaining=49, still allowed', () => {
    const rl = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: fixedNow(new Date('2026-05-06T10:00:00')),
    });
    assert.equal(rl.consume(), true);
    const s = rl.status();
    assert.equal(s.currentCount, 1);
    assert.equal(s.remaining, 49);
    assert.equal(s.allowed, true);
  });

  it('after 50 consumes in same day, allowed=false, remaining=0', () => {
    const rl = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: fixedNow(new Date('2026-05-06T10:00:00')),
    });
    for (let i = 0; i < 50; i++) {
      assert.equal(rl.consume(), true, `consume ${i + 1} should succeed`);
    }
    const s = rl.status();
    assert.equal(s.currentCount, 50);
    assert.equal(s.remaining, 0);
    assert.equal(s.allowed, false);
  });

  it('51st consume returns false and counter stays at 50', () => {
    const storage = makeFakeStorage();
    const rl = new SmartSuggestionsRateLimiter({
      storage,
      now: fixedNow(new Date('2026-05-06T10:00:00')),
    });
    for (let i = 0; i < 50; i++) rl.consume();
    assert.equal(rl.consume(), false);
    assert.equal(rl.status().currentCount, 50);
  });

  it('counter resets when local date crosses midnight', () => {
    let date = new Date('2026-05-06T10:00:00');
    const storage = makeFakeStorage();
    const rl = new SmartSuggestionsRateLimiter({
      storage,
      now: () => new Date(date),
    });
    for (let i = 0; i < 30; i++) rl.consume();
    assert.equal(rl.status().currentCount, 30);
    // Advance past midnight to the next local day.
    date = new Date('2026-05-07T00:30:00');
    const s = rl.status();
    assert.equal(s.currentCount, 0);
    assert.equal(s.remaining, 50);
    assert.equal(s.allowed, true);
  });

  it('hitting cap then crossing midnight allows the next consume', () => {
    let date = new Date('2026-05-06T23:50:00');
    const rl = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: () => new Date(date),
    });
    for (let i = 0; i < 50; i++) rl.consume();
    assert.equal(rl.consume(), false);
    date = new Date('2026-05-07T00:01:00');
    assert.equal(rl.consume(), true);
    assert.equal(rl.status().currentCount, 1);
  });

  it('respects a custom dailyCap', () => {
    const rl = new SmartSuggestionsRateLimiter({
      dailyCap: 5,
      storage: makeFakeStorage(),
      now: fixedNow(new Date('2026-05-06T10:00:00')),
    });
    for (let i = 0; i < 5; i++) assert.equal(rl.consume(), true);
    assert.equal(rl.consume(), false);
    assert.equal(rl.status().remaining, 0);
  });

  it('resetAt is the upcoming local midnight', () => {
    const rl = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: fixedNow(new Date('2026-05-06T15:30:00')),
    });
    const r = rl.status().resetAt;
    assert.equal(r.getFullYear(), 2026);
    assert.equal(r.getMonth(), 4);
    assert.equal(r.getDate(), 7);
    assert.equal(r.getHours(), 0);
    assert.equal(r.getMinutes(), 0);
  });

  it('reset() zeros count mid-day', () => {
    const rl = new SmartSuggestionsRateLimiter({
      storage: makeFakeStorage(),
      now: fixedNow(new Date('2026-05-06T10:00:00')),
    });
    for (let i = 0; i < 7; i++) rl.consume();
    rl.reset();
    assert.equal(rl.status().currentCount, 0);
    assert.equal(rl.status().remaining, 50);
  });

  it('two limiters sharing storage see consistent state', () => {
    const storage = makeFakeStorage();
    const now = fixedNow(new Date('2026-05-06T10:00:00'));
    const a = new SmartSuggestionsRateLimiter({ storage, now });
    const b = new SmartSuggestionsRateLimiter({ storage, now });
    for (let i = 0; i < 10; i++) a.consume();
    assert.equal(b.status().currentCount, 10);
    for (let i = 0; i < 5; i++) b.consume();
    assert.equal(a.status().currentCount, 15);
  });
});
