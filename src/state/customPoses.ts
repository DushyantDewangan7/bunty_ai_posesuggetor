import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import type { CapturedPose } from '../types/customPose';

const storage = createMMKV({ id: 'custom-poses' });
const KEY = 'captures.v1';

function loadCaptures(): CapturedPose[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CapturedPose[];
    return parsed.filter((p) => p.version === 1);
  } catch {
    return [];
  }
}

function saveCaptures(captures: CapturedPose[]): void {
  storage.set(KEY, JSON.stringify(captures));
}

interface CustomPosesState {
  captures: CapturedPose[];
  add: (capture: CapturedPose) => void;
  remove: (id: string) => void;
  reset: () => void;
}

export const useCustomPoses = create<CustomPosesState>((set, get) => ({
  captures: loadCaptures(),
  add: (capture) => {
    const next = [...get().captures, capture];
    saveCaptures(next);
    set({ captures: next });
  },
  remove: (id) => {
    const next = get().captures.filter((p) => p.id !== id);
    saveCaptures(next);
    set({ captures: next });
  },
  reset: () => {
    saveCaptures([]);
    set({ captures: [] });
  },
}));
