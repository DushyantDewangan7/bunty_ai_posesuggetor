import { create } from 'zustand';

import type { SmartSuggestionError, SmartSuggestionResult } from '../types/smartSuggestions';

interface SmartSuggestionsState {
  loading: boolean;
  result: SmartSuggestionResult | null;
  error: SmartSuggestionError | null;

  startRequest: () => void;
  setResult: (result: SmartSuggestionResult) => void;
  setError: (error: SmartSuggestionError) => void;
  clear: () => void;
}

/**
 * Phase 4-B smart-suggestions request state. Holds the loading flag, the
 * latest cloud result, and the latest error. NOT persisted — clears on app
 * restart, which matches Phase 3B's session-novelty model: a fresh launch
 * deserves a fresh suggestion run rather than stale cached picks.
 */
export const useSmartSuggestions = create<SmartSuggestionsState>((set) => ({
  loading: false,
  result: null,
  error: null,

  startRequest: () => set({ loading: true, error: null }),
  setResult: (result) => set({ loading: false, result, error: null }),
  setError: (error) => set({ loading: false, error }),
  clear: () => set({ loading: false, result: null, error: null }),
}));
