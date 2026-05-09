import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { getOutlineAssetForPose } from '../poseOutlineAsset.ts';
import type { PoseTarget } from '../../types/pose.ts';

function makePose(overrides: Partial<PoseTarget> = {}): PoseTarget {
  return {
    id: 'fixture-pose',
    name: 'Fixture',
    category: 'standing',
    description: 'fixture',
    referenceLandmarks: [],
    difficulty: 1,
    ...overrides,
  };
}

const g = globalThis as { __DEV__?: boolean };

describe('getOutlineAssetForPose', () => {
  let prevDev: boolean | undefined;
  let prevWarn: typeof console.warn;
  let warnCalls: unknown[][];

  beforeEach(() => {
    prevDev = g.__DEV__;
    prevWarn = console.warn;
    warnCalls = [];
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
  });

  afterEach(() => {
    if (prevDev === undefined) {
      delete g.__DEV__;
    } else {
      g.__DEV__ = prevDev;
    }
    console.warn = prevWarn;
  });

  it('returns the configured outlineSvg path', () => {
    g.__DEV__ = true;
    const pose = makePose({ outlineSvg: 'casual-standing-01_outline.svg' });
    assert.equal(getOutlineAssetForPose(pose), 'casual-standing-01_outline.svg');
    assert.equal(warnCalls.length, 0);
  });

  it('returns null and warns when outlineSvg is missing in dev', () => {
    g.__DEV__ = true;
    const pose = makePose();
    assert.equal(getOutlineAssetForPose(pose), null);
    assert.equal(warnCalls.length, 1);
    const firstCall = warnCalls[0];
    assert.ok(firstCall, 'console.warn should have been called');
    const msg = String(firstCall[0]);
    assert.match(msg, /Missing outlineSvg/);
    assert.match(msg, /fixture-pose/);
    assert.match(msg, /G27/);
  });

  it('throws when outlineSvg is missing in production', () => {
    g.__DEV__ = false;
    const pose = makePose();
    assert.throws(() => getOutlineAssetForPose(pose), /Production build is missing outlineSvg/);
    assert.throws(() => getOutlineAssetForPose(pose), /fixture-pose/);
  });

  it('throws when __DEV__ is undefined (defensive: prod-equivalent)', () => {
    delete g.__DEV__;
    const pose = makePose();
    assert.throws(() => getOutlineAssetForPose(pose), /Production build is missing outlineSvg/);
  });
});
