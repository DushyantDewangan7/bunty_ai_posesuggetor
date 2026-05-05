// Phase 4-A debug harness for smart suggestions.
//
// CLI usage:
//   node scripts/smartSuggestions-harness.mjs <path-to-test-image.jpg>
//   npm run phase4:harness images/source/pose-001-standing-confident.jpg
//
// Reads GEMINI_API_KEY from .env (manual parse — single var, no external dep),
// builds a synthetic SmartSuggestionRequest with a hardcoded user profile and
// the full RICH_POSE_LIBRARY (projected to PoseMetadataForAgent), calls
// Gemini 2.5 Flash, parses the response, and prints the result + elapsed time.
//
// This bypasses captureFrame.ts (Phase 4-B) entirely; the image is read from
// disk and base64-encoded inline.

import { readFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { callGeminiAPI } from '../src/smartSuggestions/callGeminiAPI.ts';
import { parseGeminiResponse } from '../src/smartSuggestions/parseResponse.ts';
import { projectPoseForAgent } from '../src/smartSuggestions/buildPrompt.ts';
import { RICH_POSE_LIBRARY } from '../src/library/poseLibrary.ts';

const MAX_DIMENSION = 768;
const JPEG_QUALITY = 80;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

async function loadApiKey() {
  try {
    await access(ENV_PATH, fsConstants.R_OK);
  } catch {
    throw new Error(`.env not found at ${ENV_PATH}`);
  }
  const raw = await readFile(ENV_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== 'GEMINI_API_KEY') continue;
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value) {
      throw new Error('GEMINI_API_KEY is present in .env but empty');
    }
    return value;
  }
  throw new Error('GEMINI_API_KEY not found in .env');
}

function describeError(err) {
  if (err && typeof err === 'object' && 'errorPayload' in err) {
    return `[smart-suggestion-error] ${JSON.stringify(err.errorPayload)}`;
  }
  return `[unexpected] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
}

async function main() {
  const imagePathArg = process.argv[2];
  if (!imagePathArg) {
    console.error('Usage: node scripts/smartSuggestions-harness.mjs <path-to-test-image.jpg>');
    process.exit(2);
  }
  const imagePath = path.resolve(ROOT, imagePathArg);

  console.log('[harness] loading API key from .env...');
  let apiKey;
  try {
    apiKey = await loadApiKey();
    console.log(
      `[harness] API key loaded (${apiKey.length} chars, prefix ${apiKey.slice(0, 4)}***)`,
    );
  } catch (err) {
    console.error(`[harness] FAILED to load API key: ${err.message}`);
    process.exit(1);
  }

  console.log(`[harness] reading image: ${imagePath}`);
  let originalBuffer;
  try {
    originalBuffer = await readFile(imagePath);
  } catch (err) {
    console.error(`[harness] FAILED to read image: ${err.message}`);
    process.exit(1);
  }
  console.log(`[harness] image (original): ${originalBuffer.length} bytes`);

  // Mirror captureFrame.ts's intended Phase 4-B behaviour: downscale to fit
  // within MAX_DIMENSION x MAX_DIMENSION, JPEG quality 80, preserve aspect.
  const downscaled = await sharp(originalBuffer)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  const frameBase64 = downscaled.toString('base64');
  console.log(
    `[harness] image (downscaled): ${downscaled.length} bytes, base64 ${frameBase64.length} chars`,
  );

  const profile = {
    version: 1,
    onboardingComplete: true,
    onboardedAt: new Date().toISOString(),
    gender: 'male',
    heightBucket: 'medium',
    faceShape: 'oval',
    bodyType: 'unspecified',
  };

  const libraryMetadata = RICH_POSE_LIBRARY.map(projectPoseForAgent);
  console.log(`[harness] library: ${libraryMetadata.length} poses projected for agent`);

  const request = {
    frameBase64,
    profile,
    libraryMetadata,
    shownPoseIds: [],
  };

  const libraryIds = new Set(libraryMetadata.map((p) => p.id));

  console.log('[harness] calling Gemini API (60 s timeout for diagnostics)...');
  const t0 = Date.now();
  let rawResponse;
  try {
    rawResponse = await callGeminiAPI(request, apiKey, 60_000);
  } catch (err) {
    console.error(`[harness] API call FAILED after ${Date.now() - t0} ms`);
    console.error(describeError(err));
    process.exit(1);
  }
  const apiElapsed = Date.now() - t0;
  console.log(`[harness] API call returned in ${apiElapsed} ms (${rawResponse.length} bytes)`);

  console.log('[harness] parsing response...');
  let result;
  try {
    result = parseGeminiResponse(rawResponse, libraryIds);
  } catch (err) {
    console.error('[harness] parse FAILED');
    console.error(describeError(err));
    console.error('[harness] raw response (first 1000 chars):');
    console.error(rawResponse.slice(0, 1000));
    process.exit(1);
  }

  const totalElapsed = Date.now() - t0;
  console.log('');
  console.log('=== RESULT ===');
  if (result.sceneDescription) {
    console.log(`Scene: ${result.sceneDescription}`);
  }
  console.log('Recommendations:');
  for (const pick of result.recommendations) {
    console.log(`  ${pick.rank}. ${pick.poseId} — ${pick.reasoning}`);
  }
  console.log('');
  console.log(`Total elapsed: ${totalElapsed} ms (api ${apiElapsed} ms)`);
  console.log(`Timestamp: ${result.timestamp}`);
}

main().catch((err) => {
  console.error('[harness] unexpected top-level error:');
  console.error(describeError(err));
  process.exit(1);
});
