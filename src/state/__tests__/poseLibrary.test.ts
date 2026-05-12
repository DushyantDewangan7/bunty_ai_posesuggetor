import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  ALL_POSE_IDS,
  DEFAULT_ACTIVE_POSE_IDS,
  loadActivePoseIds,
  POSE_LIBRARY_KEY,
  type PoseLibraryStorage,
  saveActivePoseIds,
  toggleActivePoseId,
} from '../poseLibraryPersistence.ts';

function makeFakeStorage(): PoseLibraryStorage & { dump: () => Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v);
    },
    dump: () => map,
  };
}

describe('poseLibrary defaults', () => {
  it('default active set has 7 of 10 poses', () => {
    assert.equal(ALL_POSE_IDS.length, 10);
    assert.equal(DEFAULT_ACTIVE_POSE_IDS.size, 7);
  });

  it('default active set contains casual-standing-01', () => {
    assert.equal(DEFAULT_ACTIVE_POSE_IDS.has('casual-standing-01'), true);
  });

  it('default active set excludes crosslegged, warrior-1, thinker', () => {
    assert.equal(DEFAULT_ACTIVE_POSE_IDS.has('crosslegged'), false);
    assert.equal(DEFAULT_ACTIVE_POSE_IDS.has('warrior-1'), false);
    assert.equal(DEFAULT_ACTIVE_POSE_IDS.has('thinker'), false);
  });
});

describe('toggleActivePoseId', () => {
  it('adds a previously-inactive ID', () => {
    const start = new Set(['casual-standing-01', 'tpose']);
    const next = toggleActivePoseId(start, 'warrior-1');
    assert.notEqual(next, null);
    assert.equal(next!.has('warrior-1'), true);
    assert.equal(next!.size, 3);
  });

  it('removes a currently-active ID', () => {
    const start = new Set(['casual-standing-01', 'tpose', 'warrior-1']);
    const next = toggleActivePoseId(start, 'tpose');
    assert.notEqual(next, null);
    assert.equal(next!.has('tpose'), false);
    assert.equal(next!.size, 2);
  });

  it('enforces minimum: cannot reduce to 0 active poses', () => {
    const start = new Set(['casual-standing-01']);
    const next = toggleActivePoseId(start, 'casual-standing-01');
    assert.equal(next, null);
  });

  it('ignores unknown pose IDs (no-op)', () => {
    const start = new Set(['casual-standing-01', 'tpose']);
    const next = toggleActivePoseId(start, 'not-a-real-pose');
    assert.equal(next, null);
  });

  it('does not mutate the input set', () => {
    const start = new Set(['casual-standing-01', 'tpose']);
    toggleActivePoseId(start, 'warrior-1');
    assert.equal(start.size, 2);
    assert.equal(start.has('warrior-1'), false);
  });
});

describe('poseLibrary persistence', () => {
  it('empty storage returns the defaults', () => {
    const storage = makeFakeStorage();
    const loaded = loadActivePoseIds(storage);
    assert.equal(loaded.size, 7);
    assert.equal(loaded.has('casual-standing-01'), true);
    assert.equal(loaded.has('warrior-1'), false);
  });

  it('save then load restores the active set (simulates app restart)', () => {
    const storage = makeFakeStorage();
    const original = new Set(['casual-standing-01', 'tpose', 'warrior-1']);
    saveActivePoseIds(storage, original);
    const restored = loadActivePoseIds(storage);
    assert.equal(restored.size, 3);
    assert.equal(restored.has('casual-standing-01'), true);
    assert.equal(restored.has('tpose'), true);
    assert.equal(restored.has('warrior-1'), true);
  });

  it('drops stale/unknown pose IDs from serialized state', () => {
    const storage = makeFakeStorage();
    storage.set(
      POSE_LIBRARY_KEY,
      JSON.stringify(['casual-standing-01', 'tpose', 'fake-pose-id', 'another-removed-pose']),
    );
    const loaded = loadActivePoseIds(storage);
    assert.equal(loaded.size, 2);
    assert.equal(loaded.has('casual-standing-01'), true);
    assert.equal(loaded.has('tpose'), true);
    assert.equal(loaded.has('fake-pose-id'), false);
  });

  it('new pose IDs in ALL_POSE_IDS but not in serialized state are inactive', () => {
    const storage = makeFakeStorage();
    // Simulate a user who toggled before warrior-1 etc shipped — only their
    // saved selection is restored, new IDs default to off.
    saveActivePoseIds(storage, new Set(['casual-standing-01', 'tpose']));
    const loaded = loadActivePoseIds(storage);
    assert.equal(loaded.has('casual-standing-01'), true);
    assert.equal(loaded.has('tpose'), true);
    assert.equal(loaded.has('warrior-1'), false);
    assert.equal(loaded.has('crosslegged'), false);
  });

  it('malformed JSON in storage falls back to defaults', () => {
    const storage = makeFakeStorage();
    storage.set(POSE_LIBRARY_KEY, '{not valid json');
    const loaded = loadActivePoseIds(storage);
    assert.equal(loaded.size, 7);
  });

  it('explicitly persisted empty set survives reload (separate from defaults)', () => {
    const storage = makeFakeStorage();
    saveActivePoseIds(storage, new Set());
    const loaded = loadActivePoseIds(storage);
    // Empty array is a valid persisted state — distinct from "never saved".
    // togglePose's minimum-1 guard prevents reaching this in practice, but
    // load must not silently swap to defaults if it ever happened.
    assert.equal(loaded.size, 0);
  });
});
