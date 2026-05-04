import { create } from 'zustand';
import type { MatchResult, PoseTarget } from '../types/pose';

interface PoseTargetState {
  /** Currently selected target pose, or null if no target is active. */
  selected: PoseTarget | null;
  /** Latest match result against the selected target, recomputed per frame. */
  matchResult: MatchResult | null;

  selectTarget: (target: PoseTarget | null) => void;
  setMatchResult: (result: MatchResult | null) => void;
}

export const usePoseTarget = create<PoseTargetState>((set) => ({
  selected: null,
  matchResult: null,

  selectTarget: (target) =>
    set({
      selected: target,
      // Clearing matchResult on selection avoids briefly showing stale fit% from
      // the previous target until the next frame is scored.
      matchResult: null,
    }),

  setMatchResult: (result) => set({ matchResult: result }),
}));
