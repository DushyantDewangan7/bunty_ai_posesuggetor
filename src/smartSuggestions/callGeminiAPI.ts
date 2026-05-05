import type { SmartSuggestionError, SmartSuggestionRequest } from '../types/smartSuggestions';

import { buildSystemPrompt, buildUserMessage } from './buildPrompt.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 20_000;

/**
 * Call the Gemini 2.5 Flash API with the request payload + image.
 *
 * Returns the raw response body text on success. Throws an object that matches
 * the `SmartSuggestionError` discriminated union on any failure — caller is
 * expected to catch and pattern-match. We throw plain objects rather than
 * Error instances because the union shape is what the UI maps to user-facing
 * messages; wrapping in Error would require unwrapping at the call site.
 *
 * `timeoutMs` defaults to TIMEOUT_MS (20 s). Phase 4-A harness measured ~9.4 s
 * end-to-end against a 10 s timeout (0.6 s margin = intermittent timeouts in
 * production), so we doubled the budget. Harness still overrides for
 * diagnostic runs.
 */
export async function callGeminiAPI(
  request: SmartSuggestionRequest,
  apiKey: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<string> {
  if (!apiKey) {
    throw makeError({
      type: 'api-error',
      status: 0,
      message: 'missing_api_key',
    });
  }

  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(request);

  const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: userMessage.text },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: userMessage.image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (isAbortError(err)) {
      throw makeError({ type: 'timeout' });
    }
    throw makeError({ type: 'no-internet' });
  }
  clearTimeout(timeoutId);

  if (response.status === 200) {
    return await response.text();
  }

  if (response.status === 401 || response.status === 403) {
    throw makeError({
      type: 'api-error',
      status: response.status,
      message: 'invalid_key',
    });
  }
  if (response.status === 429) {
    throw makeError({ type: 'rate-limit' });
  }

  const message = await safeReadBody(response);
  throw makeError({
    type: 'api-error',
    status: response.status,
    message,
  });
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'AbortError'
  );
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 500 ? text.slice(0, 500) : text;
  } catch {
    return `http_${response.status}`;
  }
}

/**
 * Wrap a SmartSuggestionError-shaped object so it can be `throw`n. We attach
 * the union as a property on a real Error to keep stack traces while still
 * letting consumers introspect the discriminator via the `errorPayload` prop.
 *
 * Consumers should `catch (e)` and read `(e as { errorPayload?: SmartSuggestionError }).errorPayload`.
 */
function makeError(payload: SmartSuggestionError): Error & {
  errorPayload: SmartSuggestionError;
} {
  const err = new Error(`SmartSuggestion ${payload.type}`) as Error & {
    errorPayload: SmartSuggestionError;
  };
  err.errorPayload = payload;
  return err;
}

export { GEMINI_API_BASE, MODEL, TIMEOUT_MS };
