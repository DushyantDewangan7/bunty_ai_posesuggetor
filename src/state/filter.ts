// TODO: filter rendering pipeline not yet implemented. See ADR-001 G40 (deferred).
import { create } from 'zustand';

import {
  FILTER_MMKV_ID,
  type FilterId,
  type FilterStorage,
  loadFilter,
  nextFilter,
  saveFilter,
} from './filterPersistence';

export { ALL_FILTERS, FILTER_LABELS, type FilterId } from './filterPersistence';

interface FilterState {
  current: FilterId;
  setFilter: (id: FilterId) => void;
  cycleNext: () => void;
  cyclePrevious: () => void;
}

let lazyDefaultStorage: FilterStorage | null = null;
function defaultStorage(): FilterStorage {
  if (lazyDefaultStorage) return lazyDefaultStorage;
  // Lazy require keeps `react-native-mmkv`'s native module out of unit-test
  // module graphs that don't touch the store. Mirrors aiMode.ts.
  const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = createMMKV({ id: FILTER_MMKV_ID });
  lazyDefaultStorage = {
    getString: (k) => mmkv.getString(k),
    set: (k, v) => mmkv.set(k, v),
  };
  return lazyDefaultStorage;
}

export const useFilterStore = create<FilterState>((set, get) => {
  const storage = defaultStorage();
  const apply = (next: FilterId): void => {
    saveFilter(storage, next);
    set({ current: next });
  };
  return {
    current: loadFilter(storage),
    setFilter: apply,
    cycleNext: () => apply(nextFilter(get().current, 1)),
    cyclePrevious: () => apply(nextFilter(get().current, -1)),
  };
});

export const useCurrentFilter = (): FilterId => useFilterStore((s) => s.current);
