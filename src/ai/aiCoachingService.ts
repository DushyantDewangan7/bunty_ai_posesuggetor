/**
 * Scene-aware AI coaching service. Pure service — no React, no hooks, no stores.
 *
 * Phase E: when aiMode is on, replace rule-based "Adjust your right ankle"
 * coaching with a 1-2 sentence Gemini tip that considers BOTH alignment gaps
 * AND the scene (background, lighting, composition). Caller wraps this with
 * caching, rate limiting, and an aiMode gate — this module just does the call.
 *
 * Error contract differs from callGeminiAPI: that one throws a structured
 * SmartSuggestionError union; we return null on every failure (network, parse,
 * timeout, missing key). The coaching UX falls back to rule-based when null —
 * a swallowed error and a "no tip yet" state are visually indistinguishable, so
 * the simpler null contract removes a try/catch from every caller.
 *
 * Why fetch directly instead of reusing callGeminiAPI:
 *   - callGeminiAPI is locked into responseMimeType: 'application/json' for the
 *     Smart Picks recommender; coaching wants free-form text.
 *   - callGeminiAPI's 20s timeout is calibrated for the larger JSON response;
 *     coaching is meant to be timely (5s budget — stale tip = useless tip).
 *   - The error-shape difference would make wrapping it awkward.
 * We DO reuse the GEMINI_API_BASE / MODEL constants so the endpoint stays in
 * one place.
 */

import { GEMINI_API_BASE, MODEL } from '../smartSuggestions/callGeminiAPI.ts';
import { computePHash } from '../smartSuggestions/pHash.ts';

const COACHING_TIMEOUT_MS = 5_000;
const COACHING_TEMPERATURE = 0.4;
const COACHING_MAX_OUTPUT_TOKENS = 60;

export interface CoachingRequest {
  /** Base64-encoded JPEG of the camera frame (no data URL prefix). */
  frameJpegBase64: string;
  /** 32x32 grayscale luminance buffer for the pHash cache key. From captureCurrentFrame. */
  frameGrayscale: Uint8Array;
  /** Target pose human-readable name (e.g. "Casual standing"). */
  poseName: string;
  /** Target pose ID (cache scoping happens at the caller — pass for prompt context only). */
  poseId: string;
  /** Current match score in [0,1]. */
  fitScore: number;
  /** Top 1-3 worst-deviating joints with normalized deviation (caller maps from worstJoints). */
  topDeltas: { joint: string; deviation: number }[];
}

export interface CoachingResponse {
  /** 1-2 sentence coaching tip, under ~25 words. */
  text: string;
  /** Perceptual hash of the input frame; cache key for the caller. */
  frameHash: string;
  /** Unix ms timestamp of generation. */
  generatedAt: number;
}

export interface CoachingDeps {
  apiKey: string;
  /** Override for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Override for tests. Defaults to Date.now. */
  now?: () => number;
  /** Override for tests. Defaults to computePHash. */
  computeHash?: (grayscale: Uint8Array) => string;
}

export function buildCoachingPrompt(
  req: Pick<CoachingRequest, 'poseName' | 'fitScore' | 'topDeltas'>,
): string {
  const percent = Math.round(req.fitScore * 100);
  const deltasText =
    req.topDeltas.length > 0
      ? req.topDeltas.map((d) => `${d.joint} (${Math.round(d.deviation * 100)}% off)`).join(', ')
      : 'none significant';

  return `You are coaching someone trying to achieve a "${req.poseName}" pose for a photo.
Their current match score is ${percent}%.
The biggest alignment gaps are: ${deltasText}.

Look at the camera frame attached. Consider:
1. The pose alignment gaps listed above
2. The background, lighting, and overall composition
3. What would most help them get a great photo right now

Respond with one or two sentences of specific, actionable coaching. Keep it under 25 words. Use friendly, direct second-person language ("Move your right hand up" not "The user should..."). Don't repeat the score back to them.`;
}

/**
 * Extract the coaching text from the Gemini response body.
 * Returns null on any unexpected shape.
 */
export function extractCoachingText(rawBody: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const candidates = (parsed as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0];
  if (!first || typeof first !== 'object') return null;
  const content = (first as { content?: unknown }).content;
  if (!content || typeof content !== 'object') return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const text = (parts[0] as { text?: unknown } | undefined)?.text;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Call Gemini for scene-aware coaching. Returns null on ANY failure (network,
 * timeout, quota, parse, missing key). Caller falls back to rule-based.
 */
export async function generateCoaching(
  req: CoachingRequest,
  deps: CoachingDeps,
): Promise<CoachingResponse | null> {
  if (!deps.apiKey) return null;

  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const computeHash = deps.computeHash ?? computePHash;

  let frameHash: string;
  try {
    frameHash = computeHash(req.frameGrayscale);
  } catch {
    return null;
  }

  const promptText = buildCoachingPrompt(req);
  const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${deps.apiKey}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: req.frameJpegBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: COACHING_TEMPERATURE,
      maxOutputTokens: COACHING_MAX_OUTPUT_TOKENS,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COACHING_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
  clearTimeout(timeoutId);

  if (response.status !== 200) return null;

  let rawText: string;
  try {
    rawText = await response.text();
  } catch {
    return null;
  }

  const text = extractCoachingText(rawText);
  if (!text) return null;

  return {
    text,
    frameHash,
    generatedAt: now(),
  };
}

export { COACHING_TIMEOUT_MS, COACHING_TEMPERATURE, COACHING_MAX_OUTPUT_TOKENS };
