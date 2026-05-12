import { create } from 'zustand';

import {
  loadActivePoseIds,
  POSE_LIBRARY_MMKV_ID,
  type PoseLibraryStorage,
  saveActivePoseIds,
  toggleActivePoseId,
} from './poseLibraryPersistence';

interface PoseLibraryState {
  /** Set of pose IDs currently enabled (visible in carousel). */
  activePoseIds: Set<string>;
  /** Toggle a pose's active state. Persists immediately. */
  togglePose: (poseId: string) => void;
  /** Read-only check. */
  isActive: (poseId: string) => boolean;
}

let lazyDefaultStorage: PoseLibraryStorage | null = null;
function defaultStorage(): PoseLibraryStorage {
  if (lazyDefaultStorage) return lazyDefaultStorage;
  // Lazy require keeps `react-native-mmkv`'s native module out of unit-test
  // module graphs that don't touch the store. Mirrors aiMode.ts.
  const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = createMMKV({ id: POSE_LIBRARY_MMKV_ID });
  lazyDefaultStorage = {
    getString: (k) => mmkv.getString(k),
    set: (k, v) => mmkv.set(k, v),
  };
  return lazyDefaultStorage;
}

export const usePoseLibraryStore = create<PoseLibraryState>((set, get) => {
  const storage = defaultStorage();
  return {
    activePoseIds: loadActivePoseIds(storage),
    togglePose: (poseId) => {
      const next = toggleActivePoseId(get().activePoseIds, poseId);
      if (next === null) return;
      saveActivePoseIds(storage, next);
      set({ activePoseIds: next });
    },
    isActive: (poseId) => get().activePoseIds.has(poseId),
  };
});

export const useActivePoseIds = (): Set<string> => usePoseLibraryStore((s) => s.activePoseIds);
