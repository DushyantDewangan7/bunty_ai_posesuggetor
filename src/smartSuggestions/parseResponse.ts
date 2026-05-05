import type {
  SmartSuggestionError,
  SmartSuggestionPick,
  SmartSuggestionResult,
} from '../types/smartSuggestions';

const REASONING_MAX_CHARS = 200;

/**
 * Parse the raw Gemini response body and return a validated result.
 *
 * Raw response shape (Gemini v1beta generateContent):
 *   { candidates: [{ content: { parts: [{ text: "<json string>" }] } }, ...], ... }
 *
 * We:
 *   1. Unwrap the response envelope and pull out candidates[0].content.parts[0].text.
 *   2. JSON.parse the inner text.
 *   3. Validate and normalize the picks against `libraryIds`, dropping any
 *      poseId not in the library (hallucination filter).
 *   4. Trim reasoning to 200 chars.
 *   5. Re-rank in array order if the ranks aren't contiguous 1..N.
 *   6. Return SmartSuggestionResult or throw a SmartSuggestionError-shaped object.
 *
 * Throws a plain Error whose `.errorPayload` matches the SmartSuggestionError
 * union, mirroring callGeminiAPI's contract.
 */
export function parseGeminiResponse(
  rawText: string,
  libraryIds: Set<string>,
): SmartSuggestionResult {
  let envelope: unknown;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    throwError({ type: 'parse-error', message: 'envelope_not_json' });
  }

  const innerText = extractInnerText(envelope);
  if (innerText === null) {
    throwError({ type: 'parse-error', message: 'missing_inner_text' });
  }

  let inner: unknown;
  try {
    inner = JSON.parse(innerText);
  } catch {
    throwError({ type: 'parse-error', message: 'invalid_json' });
  }

  if (!isObject(inner)) {
    throwError({ type: 'parse-error', message: 'inner_not_object' });
  }

  const recsRaw = (inner as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(recsRaw)) {
    throwError({ type: 'parse-error', message: 'missing_recommendations' });
  }

  if (recsRaw.length === 0) {
    throwError({ type: 'no-valid-picks' });
  }

  const validPicks: SmartSuggestionPick[] = [];
  const droppedIds: string[] = [];

  for (const item of recsRaw) {
    if (!isObject(item)) continue;
    const poseId = (item as { poseId?: unknown }).poseId;
    const reasoning = (item as { reasoning?: unknown }).reasoning;
    const rank = (item as { rank?: unknown }).rank;
    if (typeof poseId !== 'string' || typeof reasoning !== 'string') {
      continue;
    }
    if (!libraryIds.has(poseId)) {
      droppedIds.push(poseId);
      continue;
    }
    validPicks.push({
      poseId,
      reasoning: reasoning.length > REASONING_MAX_CHARS
        ? reasoning.slice(0, REASONING_MAX_CHARS)
        : reasoning,
      rank: typeof rank === 'number' && Number.isFinite(rank) ? rank : 0,
    });
  }

  if (droppedIds.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[smartSuggestions] dropped ${droppedIds.length} hallucinated pose id(s): ${droppedIds.join(', ')}`,
    );
  }

  if (validPicks.length === 0) {
    throwError({ type: 'no-valid-picks' });
  }

  // Re-rank if non-contiguous starting from 1.
  const expectContiguous = validPicks.every((p, i) => p.rank === i + 1);
  const finalPicks = expectContiguous
    ? validPicks
    : validPicks.map((p, i) => ({ ...p, rank: i + 1 }));

  const sceneDescription = (inner as { sceneDescription?: unknown }).sceneDescription;
  const result: SmartSuggestionResult = {
    recommendations: finalPicks,
    fromCache: false,
    timestamp: new Date().toISOString(),
  };
  if (typeof sceneDescription === 'string' && sceneDescription.length > 0) {
    result.sceneDescription = sceneDescription;
  }
  return result;
}

function extractInnerText(envelope: unknown): string | null {
  if (!isObject(envelope)) return null;
  const candidates = (envelope as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0];
  if (!isObject(first)) return null;
  const content = (first as { content?: unknown }).content;
  if (!isObject(content)) return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const firstPart = parts[0];
  if (!isObject(firstPart)) return null;
  const text = (firstPart as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function throwError(payload: SmartSuggestionError): never {
  const err = new Error(`SmartSuggestion ${payload.type}`) as Error & {
    errorPayload: SmartSuggestionError;
  };
  err.errorPayload = payload;
  throw err;
}
