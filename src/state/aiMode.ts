import { create } from 'zustand';

import { AI_MODE_MMKV_ID, type AiModeStorage, loadAiMode, saveAiMode } from './aiModePersistence';

interface AiModeState {
  aiMode: boolean;
  setAiMode: (value: boolean) => void;
}

let lazyDefaultStorage: AiModeStorage | null = null;
function defaultStorage(): AiModeStorage {
  if (lazyDefaultStorage) return lazyDefaultStorage;
  // Lazy require keeps `react-native-mmkv`'s native module out of unit-test
  // module graphs that don't touch the store. Mirrors rateLimiter.ts.
  const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = createMMKV({ id: AI_MODE_MMKV_ID });
  lazyDefaultStorage = {
    getBoolean: (k) => mmkv.getBoolean(k),
    set: (k, v) => mmkv.set(k, v),
  };
  return lazyDefaultStorage;
}

export const useAiModeStore = create<AiModeState>((set) => {
  const storage = defaultStorage();
  return {
    aiMode: loadAiMode(storage),
    setAiMode: (value) => {
      saveAiMode(storage, value);
      set({ aiMode: value });
    },
  };
});

export const useAiMode = (): boolean => useAiModeStore((s) => s.aiMode);
