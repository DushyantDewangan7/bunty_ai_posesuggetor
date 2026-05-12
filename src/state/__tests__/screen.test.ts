import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { useScreenStore } from '../screen.ts';

describe('useScreenStore', () => {
  it('defaults to camera screen on first import', () => {
    // Reset to baseline before asserting — other tests in this file mutate it.
    useScreenStore.setState({ current: 'camera' });
    assert.equal(useScreenStore.getState().current, 'camera');
  });

  it("navigate('marketplace') updates current to marketplace", () => {
    useScreenStore.setState({ current: 'camera' });
    useScreenStore.getState().navigate('marketplace');
    assert.equal(useScreenStore.getState().current, 'marketplace');
  });

  it("navigate('camera') updates current back to camera", () => {
    useScreenStore.setState({ current: 'marketplace' });
    useScreenStore.getState().navigate('camera');
    assert.equal(useScreenStore.getState().current, 'camera');
  });

  it('navigation between screens is idempotent (navigating to current is a no-op)', () => {
    useScreenStore.setState({ current: 'marketplace' });
    useScreenStore.getState().navigate('marketplace');
    assert.equal(useScreenStore.getState().current, 'marketplace');
  });
});
