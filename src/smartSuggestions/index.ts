/**
 * Public API for the smartSuggestions module. Consumers outside this folder
 * should import from here rather than reaching into individual files; the
 * internal layout is free to change.
 *
 * Note: importing this barrel pulls in captureFrame which depends on
 * react-native-vision-camera and @shopify/react-native-skia. Node-side tests
 * that don't need frame capture should import the specific submodules
 * (./cache, ./rateLimiter, etc.) directly.
 */

export { smartSuggestionsCache, SmartSuggestionsCache } from './cache.ts';
export type { CacheConfig } from './cache.ts';
export { smartSuggestionsRateLimiter, SmartSuggestionsRateLimiter } from './rateLimiter.ts';
export type {
  RateLimitConfig,
  RateLimitStatus,
  RateLimiterStorage,
} from './rateLimiter.ts';
export { computePHash, hammingDistance } from './pHash.ts';
export { buildSystemPrompt, buildUserMessage, projectPoseForAgent } from './buildPrompt.ts';
export { callGeminiAPI } from './callGeminiAPI.ts';
export { parseGeminiResponse } from './parseResponse.ts';
export { captureCurrentFrame } from './captureFrame.ts';
export { runSmartSuggestionsFlow } from './orchestrate.ts';
export type {
  SmartSuggestionsFlowDeps,
  SmartSuggestionsFlowInput,
} from './orchestrate.ts';

export type {
  PoseMetadataForAgent,
  SmartSuggestionError,
  SmartSuggestionPick,
  SmartSuggestionRequest,
  SmartSuggestionResult,
} from '../types/smartSuggestions';
