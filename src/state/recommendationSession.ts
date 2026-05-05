import { create } from 'zustand';

interface RecommendationSessionState {
  /** Pose IDs shown this session (cleared on app restart, NOT persisted) */
  shownPoseIds: Set<string>;
  /** Add a pose to the shown set */
  markShown: (poseId: string) => void;
  /** Reset session (e.g. for "fresh recommendations" button) */
  reset: () => void;
}

export const useRecommendationSession = create<RecommendationSessionState>((set, get) => ({
  shownPoseIds: new Set(),
  markShown: (poseId) => {
    const next = new Set(get().shownPoseIds);
    next.add(poseId);
    set({ shownPoseIds: next });
  },
  reset: () => set({ shownPoseIds: new Set() }),
}));
