import { create } from 'zustand';

export type ScreenName = 'camera' | 'marketplace';

interface ScreenState {
  current: ScreenName;
  navigate: (screen: ScreenName) => void;
}

// Not persisted: screen state is session-scoped; the app reopens to camera.
export const useScreenStore = create<ScreenState>((set) => ({
  current: 'camera',
  navigate: (screen) => set({ current: screen }),
}));

export const useCurrentScreen = (): ScreenName => useScreenStore((s) => s.current);
export const useNavigate = (): ((screen: ScreenName) => void) => useScreenStore((s) => s.navigate);
