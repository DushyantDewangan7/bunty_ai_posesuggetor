// Phase 3A offline pose-data pipeline.
//
// Reads images/manifest.json, runs each referenced JPEG through MediaPipe
// PoseLandmarker (Lite) in headless Chromium, validates the 33 landmarks,
// normalizes them with the SAME normalizePose() used by the on-device
// runtime (src/ml/normalize.ts), and writes
// src/library/data/poses.generated.json.
//
// Backend: Option 2 (Puppeteer + Chromium running @mediapipe/tasks-vision Web).
// Option 1 (tasks-vision in pure Node) was rejected — its createFromOptions
// path does `document.createElement(...)` which throws ReferenceError outside
// a DOM. Same model file (pose_landmarker_lite.task) either way.

import { readFile, writeFile, appendFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';
import puppeteer from 'puppeteer';

import { normalizePose } from '../src/ml/normalize.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.join(ROOT, 'images', 'manifest.json');
const SOURCE_DIR = path.join(ROOT, 'images', 'source');
const REJECTED_PATH = path.join(ROOT, 'images', 'rejected.txt');
const HOST_HTML_PATH = path.join(__dirname, 'mediapipe-host.html');
const OUTPUT_PATH = path.join(ROOT, 'src', 'library', 'data', 'poses.generated.json');

const MAX_DIM = 640; // resize cap; MediaPipe handles arbitrary sizes but smaller is faster
const VISIBILITY_THRESHOLD = 0.5;
const MIN_VISIBLE_LANDMARKS = 30;
const REQUIRED_LANDMARKS = 33;

const HIP_LEFT = 23;
const HIP_RIGHT = 24;
const SHOULDER_LEFT = 11;
const SHOULDER_RIGHT = 12;

async function loadManifest() {
  const raw = await readFile(MANIFEST_PATH, 'utf8');
  const json = JSON.parse(raw);
  if (!Array.isArray(json?.poses)) {
    throw new Error('manifest.json must have a top-level "poses" array');
  }
  return json.poses;
}

async function imageToDataUrl(absPath) {
  const buf = await sharp(absPath)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function validateLandmarks(landmarks) {
  if (landmarks.length !== REQUIRED_LANDMARKS) {
    return {
      ok: false,
      reason: `expected ${REQUIRED_LANDMARKS} landmarks, got ${landmarks.length}`,
    };
  }
  const visibleCount = landmarks.filter((l) => l.visibility >= VISIBILITY_THRESHOLD).length;
  if (visibleCount < MIN_VISIBLE_LANDMARKS) {
    return {
      ok: false,
      reason: `only ${visibleCount}/${REQUIRED_LANDMARKS} landmarks have visibility >= ${VISIBILITY_THRESHOLD}`,
    };
  }
  // Hip and shoulder midpoints must be derivable: each anchor must be visible.
  const anchors = [HIP_LEFT, HIP_RIGHT, SHOULDER_LEFT, SHOULDER_RIGHT];
  for (const idx of anchors) {
    if (landmarks[idx].visibility < VISIBILITY_THRESHOLD) {
      return {
        ok: false,
        reason: `anchor landmark ${idx} visibility ${landmarks[idx].visibility.toFixed(2)} < ${VISIBILITY_THRESHOLD}`,
      };
    }
  }
  return { ok: true };
}

async function logReject(imageFile, reason) {
  const ts = new Date().toISOString();
  await appendFile(REJECTED_PATH, `${ts}\t${imageFile}\t${reason}\n`);
}

async function main() {
  const poses = await loadManifest();
  console.log(`[pipeline] manifest has ${poses.length} pose entries`);

  if (poses.length === 0) {
    await writeFile(OUTPUT_PATH, '[]\n');
    console.log(`[pipeline] manifest empty — wrote [] to ${path.relative(ROOT, OUTPUT_PATH)}`);
    console.log('[pipeline] summary: 0 processed, 0 validated, 0 rejected');
    return;
  }

  console.log('[pipeline] launching headless Chromium...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const generated = [];
  let rejected = 0;

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser-error]', msg.text());
    });

    const hostUrl = pathToFileURL(HOST_HTML_PATH).href;
    await page.goto(hostUrl, { waitUntil: 'load' });
    console.log('[pipeline] waiting for landmarker...');
    await page.waitForFunction('window.__ready === true || typeof window.__error === "string"', {
      timeout: 120000,
    });
    const err = await page.evaluate(() => window.__error ?? null);
    if (err) throw new Error('browser host failed to init: ' + err);
    console.log('[pipeline] landmarker ready');

    for (const entry of poses) {
      const { imageFile, metadata } = entry;
      if (!imageFile || !metadata?.id) {
        console.log('[pipeline] SKIP: malformed manifest entry', entry);
        continue;
      }

      const absImage = path.join(SOURCE_DIR, imageFile);
      try {
        await access(absImage);
      } catch {
        await logReject(imageFile, 'image file missing in images/source/');
        console.log(`[pipeline] REJECT ${imageFile}: missing on disk`);
        rejected += 1;
        continue;
      }

      console.log(`[pipeline] processing ${imageFile} (${metadata.id})...`);
      const dataUrl = await imageToDataUrl(absImage);
      const result = await page.evaluate(async (url) => window.__detectPose(url), dataUrl);

      if (!result?.landmarks || result.count === 0) {
        await logReject(imageFile, 'PoseLandmarker returned no person');
        console.log(`[pipeline] REJECT ${imageFile}: no person detected`);
        rejected += 1;
        continue;
      }

      const validation = validateLandmarks(result.landmarks);
      if (!validation.ok) {
        await logReject(imageFile, validation.reason);
        console.log(`[pipeline] REJECT ${imageFile}: ${validation.reason}`);
        rejected += 1;
        continue;
      }

      const normalized = normalizePose(result.landmarks);
      if (!normalized) {
        await logReject(imageFile, 'normalizePose returned null (anchor visibility or zero scale)');
        console.log(`[pipeline] REJECT ${imageFile}: normalize failed`);
        rejected += 1;
        continue;
      }

      const { imageAttribution, ...meta } = metadata;
      generated.push({
        ...meta,
        referenceLandmarks: normalized,
        imageAttribution,
      });
      console.log(`[pipeline] OK ${imageFile} -> ${metadata.id}`);
    }
  } finally {
    await browser.close();
  }

  generated.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(OUTPUT_PATH, JSON.stringify(generated, null, 2) + '\n');

  console.log(
    `[pipeline] summary: ${poses.length} processed, ${generated.length} validated, ${rejected} rejected`,
  );
  console.log(`[pipeline] wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error('[pipeline] FATAL:', err);
  process.exit(1);
});
