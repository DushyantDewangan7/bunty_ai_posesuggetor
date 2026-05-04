import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { EMPTY_PROFILE, type UserProfile } from '../types/userProfile';

const storage = createMMKV({ id: 'user-profile' });
const KEY = 'profile.v1';

function loadProfile(): UserProfile {
  const raw = storage.getString(KEY);
  if (!raw) return EMPTY_PROFILE;
  try {
    const parsed = JSON.parse(raw) as UserProfile;
    if (parsed.version !== 1) return EMPTY_PROFILE;
    return parsed;
  } catch {
    return EMPTY_PROFILE;
  }
}

function saveProfile(profile: UserProfile): void {
  storage.set(KEY, JSON.stringify(profile));
}

interface UserProfileState {
  profile: UserProfile;
  setGender: (gender: UserProfile['gender']) => void;
  setHeightBucket: (height: UserProfile['heightBucket']) => void;
  setFaceShape: (shape: UserProfile['faceShape']) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

export const useUserProfile = create<UserProfileState>((set, get) => ({
  profile: loadProfile(),

  setGender: (gender) => {
    const next: UserProfile = { ...get().profile, gender };
    saveProfile(next);
    set({ profile: next });
  },

  setHeightBucket: (heightBucket) => {
    const next: UserProfile = { ...get().profile, heightBucket };
    saveProfile(next);
    set({ profile: next });
  },

  setFaceShape: (faceShape) => {
    const next: UserProfile = { ...get().profile, faceShape };
    saveProfile(next);
    set({ profile: next });
  },

  completeOnboarding: () => {
    const next: UserProfile = {
      ...get().profile,
      onboardingComplete: true,
      onboardedAt: new Date().toISOString(),
    };
    saveProfile(next);
    set({ profile: next });
  },

  reset: () => {
    saveProfile(EMPTY_PROFILE);
    set({ profile: EMPTY_PROFILE });
  },
}));
