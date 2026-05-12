import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { type AiModeStorage, loadAiMode, saveAiMode } from '../aiModePersistence.ts';

function makeFakeStorage(): AiModeStorage & { dump: () => Map<string, boolean> } {
  const map = new Map<string, boolean>();
  return {
    getBoolean: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v);
    },
    dump: () => map,
  };
}

describe('aiMode persistence', () => {
  it('default reads as false on empty storage', () => {
    const storage = makeFakeStorage();
    assert.equal(loadAiMode(storage), false);
  });

  it('saveAiMode(true) then loadAiMode returns true', () => {
    const storage = makeFakeStorage();
    saveAiMode(storage, true);
    assert.equal(loadAiMode(storage), true);
  });

  it('saveAiMode(false) is persisted distinctly from empty', () => {
    const storage = makeFakeStorage();
    saveAiMode(storage, true);
    saveAiMode(storage, false);
    assert.equal(loadAiMode(storage), false);
    // Explicit false is stored, not just absent.
    assert.equal(storage.dump().get('aiMode.enabled'), false);
  });

  it('fresh load after save simulates app restart with persisted true', () => {
    const storage = makeFakeStorage();
    saveAiMode(storage, true);
    // Simulate a fresh module load by reading via a new consumer of the same
    // storage backing. Persisted value survives the restart.
    const restartLoad = loadAiMode(storage);
    assert.equal(restartLoad, true);
  });
});
