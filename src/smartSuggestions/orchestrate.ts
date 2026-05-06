import type { SmartSuggestionsCache } from './cache.ts';
import { computePHash } from './pHash.ts';
import type { SmartSuggestionsRateLimiter } from './rateLimiter.ts';
import type {
  PoseMetadataForAgent,
  SmartSuggestionError,
  SmartSuggestionRequest,
  SmartSuggestionResult,
} from '../types/smartSuggestions';
import type { UserProfile } from '../types/userProfile';

/**
 * Inputs the caller has already gathered from React state and vision-camera
 * before invoking the flow. Frame capture stays in the UI layer because it
 * needs the live photoOutput; the orchestration is the pure-data part.
 */
export interface SmartSuggestionsFlowInput {
  /** JPEG-encoded frame, base64, no data URL prefix. */
  frameBase64: string;
  /** 32x32 grayscale Uint8Array used as the pHash input. */
  grayscale: Uint8Array;
  profile: UserProfile;
  libraryMetadata: PoseMetadataForAgent[];
  /** Set of valid library pose IDs — passed to parseResponse for hallucination filter. */
  libraryIds: Set<string>;
  shownPoseIds: string[];
}

export interface SmartSuggestionsFlowDeps {
  cache: Pick<SmartSuggestionsCache, 'lookup' | 'store'>;
  rateLimiter: Pick<SmartSuggestionsRateLimiter, 'status' | 'consume'>;
  /** Returns the raw API response body text on success; throws on failure. */
  callGemini: (request: SmartSuggestionRequest) => Promise<string>;
  parseResponse: (rawText: string, libraryIds: Set<string>) => SmartSuggestionResult;
  /** Override for tests; defaults to ./pHash computePHash. */
  computeHash?: (grayscale: Uint8Array) => string;
}

/**
 * Cache → rate-limit → API → parse → store flow. The order matches ADR G25:
 * cache lookup happens first so a hit avoids any quota check; status() gates
 * the API call before consume() so we don't burn a slot on a refused request.
 *
 * Throws an Error whose `.errorPayload` matches SmartSuggestionError. Callers
 * pattern-match on the payload to render UI state.
 */
export async function runSmartSuggestionsFlow(
  input: SmartSuggestionsFlowInput,
  deps: SmartSuggestionsFlowDeps,
): Promise<SmartSuggestionResult> {
  const computeHash = deps.computeHash ?? computePHash;
  const hash = computeHash(input.grayscale);

  const cached = deps.cache.lookup(hash);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const status = deps.rateLimiter.status();
  if (!status.allowed) {
    throwError({ type: 'rate-limit', resetAt: status.resetAt.toISOString() });
  }

  if (!deps.rateLimiter.consume()) {
    // Lost a race against another consumer; report the freshly-read resetAt.
    throwError({
      type: 'rate-limit',
      resetAt: deps.rateLimiter.status().resetAt.toISOString(),
    });
  }

  const request: SmartSuggestionRequest = {
    frameBase64: input.frameBase64,
    profile: input.profile,
    libraryMetadata: input.libraryMetadata,
    shownPoseIds: input.shownPoseIds,
  };
  const rawText = await deps.callGemini(request);
  const parsed = deps.parseResponse(rawText, input.libraryIds);
  const fresh: SmartSuggestionResult = { ...parsed, fromCache: false };
  deps.cache.store(hash, fresh);
  return fresh;
}

function throwError(payload: SmartSuggestionError): never {
  const err = new Error(`SmartSuggestion ${payload.type}`) as Error & {
    errorPayload: SmartSuggestionError;
  };
  err.errorPayload = payload;
  throw err;
}
