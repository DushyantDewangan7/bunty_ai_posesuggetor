// scripts/generate-pose-outline.mjs
//
// Offline tool that turns a source pose photo into the canonical white-contour
// SVG used by the runtime PoseTargetOverlay (ADR-001 G28). Pipeline:
//   1. Source image -> MediaPipe ImageSegmenter (selfie_segmenter.tflite),
//      run inside headless Chromium via Puppeteer. Reuses the same
//      Puppeteer/MediaPipe-Tasks-Vision pattern established by
//      scripts/process-poses.mjs + scripts/mediapipe-host.html.
//   2. Page returns a category mask (uint8, 1 byte per pixel).
//   3. Threshold -> 1-bit binary mask (foreground category only).
//   4. Crop to mask bbox, scale to 900x900-fit, center-pad to 1000x1000.
//      Doing the normalization on the mask BEFORE potrace lets the resulting
//      path coords land natively in viewBox 0 0 1000 1000 with no transforms.
//   5. potrace with turdSize=100 / alphaMax=1.0 / optTolerance=0.4 -> smooth
//      vector path.
//   6. Re-wrap potrace's <path d="..."/> in our canonical SVG: white stroke,
//      no fill, rounded caps/joins, stroke-width 4.
//
// Cross-platform (Windows-friendly): no shell pipes, all I/O via node:fs.
// Requires Node >= 20.

import potrace from 'potrace';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TARGET_SIZE = 1000;
const PADDING_PCT = 0.05;

// Cap input to ~1024 px on the long edge before handing it to MediaPipe. The
// selfie segmenter handles arbitrary sizes but bigger inputs only inflate
// Chromium's memory use; the contour we extract is re-sampled into a
// 1000x1000 mask anyway. Matches the spirit of process-poses.mjs's MAX_DIM.
const SEGMENTATION_LONG_EDGE_MAX = 1024;

const POTRACE_OPTS = {
  turdSize: 100,
  alphaMax: 1.0,
  optTolerance: 0.4,
  threshold: 128,
  // Our normalized mask uses white=255 for the subject and black=0 for the
  // padded background. Potrace's default `blackOnWhite: true` would trace the
  // black border instead of the subject; flipping it makes potrace trace the
  // white foreground silhouette, which is what we want.
  blackOnWhite: false,
};

const STROKE_COLOR = '#FFFFFF';
const STROKE_WIDTH = 6;
const STROKE_DASHARRAY = '8 12';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEGMENTER_HOST_HTML = path.join(__dirname, 'segmenter-host.html');

const USAGE = `Usage: node scripts/generate-pose-outline.mjs --input <path> --output <path> [--pose-id <id>]

Generate a normalized white-contour SVG outline asset from a source pose
photo. Pipeline: MediaPipe selfie segmentation (Puppeteer/Chromium) ->
binary mask -> potrace -> wrapped SVG.

Options:
  --input    <path>   Source image (JPG/PNG/WebP). Required.
  --output   <path>   Output SVG path. Will be created (parent dirs auto-mkdir). Required.
  --pose-id  <id>     Pose ID for log output. Optional.
  -h, --help          Print this message.
`;

function parseArgs(argv) {
  const out = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      out.help = true;
    } else if (a === '--input') {
      out.input = argv[++i];
    } else if (a === '--output') {
      out.output = argv[++i];
    } else if (a === '--pose-id') {
      out.poseId = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

async function imageToDataUrl(absPath) {
  const buf = await sharp(absPath)
    .resize({
      width: SEGMENTATION_LONG_EDGE_MAX,
      height: SEGMENTATION_LONG_EDGE_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * Decide which mask value represents foreground. MediaPipe's category mask is
 * an array of category indices (0 = background, 1 = person for selfie_segmenter
 * binary), but some builds return 0/255. We sample the four corners of the
 * mask — corners are reliably background — and pick whichever value occupies
 * them as the "background" value, then call the other foreground.
 */
function detectForegroundValue(maskBytes, width, height) {
  const corners = [
    maskBytes[0],
    maskBytes[width - 1],
    maskBytes[(height - 1) * width],
    maskBytes[height * width - 1],
  ];
  const counts = new Map();
  for (const v of corners) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bgValue = corners[0];
  let bgCount = 0;
  for (const [v, c] of counts) {
    if (c > bgCount) {
      bgCount = c;
      bgValue = v;
    }
  }
  // Pick the most-frequent non-background value across the whole mask as fg.
  const fgCounts = new Map();
  for (let i = 0; i < maskBytes.length; i++) {
    const v = maskBytes[i];
    if (v === bgValue) continue;
    fgCounts.set(v, (fgCounts.get(v) ?? 0) + 1);
  }
  let fgValue = bgValue === 0 ? 255 : 0;
  let fgCount = -1;
  for (const [v, c] of fgCounts) {
    if (c > fgCount) {
      fgCount = c;
      fgValue = v;
    }
  }
  return { bgValue, fgValue };
}

function findBboxAndCoverage(binMask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let coverage = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (binMask[y * width + x] !== 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        coverage++;
      }
    }
  }
  return { minX, minY, maxX, maxY, coverage };
}

async function buildNormalizedMaskPng(binMask, width, height) {
  const bbox = findBboxAndCoverage(binMask, width, height);
  if (bbox.maxX < 0) {
    throw new Error(
      'No foreground pixels in segmenter output — segmentation produced an empty mask.',
    );
  }

  const bboxW = bbox.maxX - bbox.minX + 1;
  const bboxH = bbox.maxY - bbox.minY + 1;
  const padPx = Math.round(TARGET_SIZE * PADDING_PCT);
  const innerArea = TARGET_SIZE - 2 * padPx;
  const scale = Math.min(innerArea / bboxW, innerArea / bboxH);
  const innerW = Math.max(1, Math.round(bboxW * scale));
  const innerH = Math.max(1, Math.round(bboxH * scale));
  const offX = Math.round((TARGET_SIZE - innerW) / 2);
  const offY = Math.round((TARGET_SIZE - innerH) / 2);

  const maskPng = await sharp(binMask, {
    raw: { width, height, channels: 1 },
  })
    .extract({ left: bbox.minX, top: bbox.minY, width: bboxW, height: bboxH })
    .resize(innerW, innerH, { kernel: 'nearest' })
    .extend({
      top: offY,
      bottom: TARGET_SIZE - innerH - offY,
      left: offX,
      right: TARGET_SIZE - innerW - offX,
      background: { r: 0, g: 0, b: 0 },
    })
    .threshold(128)
    .png()
    .toBuffer();

  return {
    maskPng,
    coveragePct: (bbox.coverage / (width * height)) * 100,
  };
}

function tracePromise(buffer, opts) {
  return new Promise((resolve, reject) => {
    potrace.trace(buffer, opts, (err, svg) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

function extractPathData(potraceSvg) {
  const m = potraceSvg.match(/<path[^>]*\sd="([^"]+)"/);
  if (!m) {
    throw new Error('potrace output did not contain a <path d="..."> element');
  }
  return m[1];
}

/**
 * Split a multi-subpath d-string on uppercase `M` (absolute moveto = subpath
 * start). Lowercase `m` is relative-move within a subpath and is left intact.
 * Returns one element per subpath, each retaining its leading `M`.
 */
function splitSubpaths(pathD) {
  const out = [];
  let cur = '';
  for (let i = 0; i < pathD.length; i++) {
    const ch = pathD[i];
    if (ch === 'M' && cur.length > 0) {
      out.push(cur.trim());
      cur = '';
    }
    cur += ch;
  }
  if (cur.trim().length > 0) out.push(cur.trim());
  return out;
}

/**
 * Tight-enough bbox for ranking subpaths by area. Walks every numeric pair the
 * subpath emits and treats them all as candidate vertices/control points. This
 * over-approximates true bezier hulls but the comparison between subpaths
 * stays valid (any subpath with strictly larger control-point spread will rank
 * higher), which is all we need to pick the body's outermost contour.
 */
function approxBboxArea(subpathD) {
  const tokens = subpathD.match(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/g) ?? [];
  if (tokens.length < 4) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const x = parseFloat(tokens[i]);
    const y = parseFloat(tokens[i + 1]);
    if (Number.isFinite(x)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (Number.isFinite(y)) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return 0;
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

/**
 * Drop all subpaths except the one with the largest bbox area. Removes inner
 * contours (e.g. holes between arms and torso) that look noisy under a dotted
 * stroke. If the input only has one subpath, returns it unchanged.
 */
function keepLargestSubpath(pathD) {
  const subpaths = splitSubpaths(pathD);
  if (subpaths.length <= 1) return pathD.trim();
  let bestIdx = 0;
  let bestArea = -1;
  for (let i = 0; i < subpaths.length; i++) {
    const area = approxBboxArea(subpaths[i]);
    if (area > bestArea) {
      bestArea = area;
      bestIdx = i;
    }
  }
  return subpaths[bestIdx];
}

function wrapAsCanonicalSvg(pathD) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TARGET_SIZE} ${TARGET_SIZE}">\n` +
    `  <path d="${pathD}" stroke="${STROKE_COLOR}" fill="none" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${STROKE_DASHARRAY}"/>\n` +
    `</svg>\n`
  );
}

function countPathCommands(pathD) {
  const m = pathD.match(/[MmLlCcQqAaSsTtZzHhVv]/g);
  return m ? m.length : 0;
}

async function main() {
  const argv = process.argv.slice(2);
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    console.error('');
    console.error(USAGE);
    process.exit(2);
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!args.input || !args.output) {
    console.error('Missing required --input and/or --output.');
    console.error('');
    console.error(USAGE);
    process.exit(2);
  }

  const inputAbs = path.resolve(args.input);
  const outputAbs = path.resolve(args.output);
  const poseLabel = args.poseId ? ` [${args.poseId}]` : '';

  console.log(`generate-pose-outline${poseLabel}: input=${inputAbs}`);
  console.log(`generate-pose-outline${poseLabel}: output=${outputAbs}`);

  const meta = await sharp(inputAbs).metadata();
  const origDims = `${meta.width}x${meta.height}`;
  const dataUrl = await imageToDataUrl(inputAbs);

  console.log(`generate-pose-outline${poseLabel}: launching headless Chromium...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let segResult;
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser-error]', msg.text());
    });

    const hostUrl = pathToFileURL(SEGMENTER_HOST_HTML).href;
    await page.goto(hostUrl, { waitUntil: 'load' });
    console.log(`generate-pose-outline${poseLabel}: waiting for segmenter...`);
    await page.waitForFunction('window.__ready === true || typeof window.__error === "string"', {
      timeout: 120000,
    });
    const err = await page.evaluate(() => window.__error ?? null);
    if (err) throw new Error('browser host failed to init: ' + err);
    console.log(`generate-pose-outline${poseLabel}: segmenter ready`);

    const t0 = Date.now();
    segResult = await page.evaluate(async (url) => window.__segment(url), dataUrl);
    const t1 = Date.now();
    console.log(`generate-pose-outline${poseLabel}: segmentation ${t1 - t0}ms`);
  } finally {
    await browser.close();
  }

  if (!segResult || segResult.error) {
    throw new Error(`segmenter failed: ${segResult?.error ?? 'no result returned'}`);
  }
  if (!segResult.maskB64 || !segResult.width || !segResult.height) {
    throw new Error('segmenter returned malformed result (missing maskB64/width/height)');
  }

  const maskBytes = Buffer.from(segResult.maskB64, 'base64');
  if (maskBytes.length !== segResult.width * segResult.height) {
    throw new Error(
      `mask byte count ${maskBytes.length} != width*height ${segResult.width * segResult.height}`,
    );
  }

  const { bgValue, fgValue } = detectForegroundValue(maskBytes, segResult.width, segResult.height);
  console.log(
    `generate-pose-outline${poseLabel}: mask values bg=${bgValue} fg=${fgValue} (${segResult.width}x${segResult.height})`,
  );

  const binMask = Buffer.alloc(maskBytes.length);
  for (let i = 0; i < maskBytes.length; i++) {
    binMask[i] = maskBytes[i] === bgValue ? 0 : 255;
  }

  const { maskPng, coveragePct } = await buildNormalizedMaskPng(
    binMask,
    segResult.width,
    segResult.height,
  );

  console.log(`generate-pose-outline${poseLabel}: tracing mask with potrace...`);
  const tBeforeTrace = Date.now();
  const potraceSvg = await tracePromise(maskPng, POTRACE_OPTS);
  const tAfterTrace = Date.now();

  const pathDFull = extractPathData(potraceSvg);
  const subpathsBefore = splitSubpaths(pathDFull);
  const pathD = keepLargestSubpath(pathDFull);
  const commandCount = countPathCommands(pathD);
  const svg = wrapAsCanonicalSvg(pathD);

  await fs.mkdir(path.dirname(outputAbs), { recursive: true });
  await fs.writeFile(outputAbs, svg, 'utf8');

  const outStat = await fs.stat(outputAbs);

  console.log('');
  console.log(`Summary${poseLabel}:`);
  console.log(`  source image dims: ${origDims}`);
  console.log(`  segmenter dims:    ${segResult.width}x${segResult.height}`);
  console.log(`  mask coverage:     ${coveragePct.toFixed(1)}%`);
  console.log(`  potrace time:      ${tAfterTrace - tBeforeTrace}ms`);
  console.log(`  subpaths in:       ${subpathsBefore.length}`);
  console.log(`  subpaths out:      1 (largest kept)`);
  console.log(`  path commands:     ${commandCount}`);
  console.log(`  path data length:  ${pathD.length} chars`);
  console.log(`  output file size:  ${outStat.size} bytes`);
  console.log(`  output:            ${outputAbs}`);
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = path.resolve(process.argv[1] ?? '');
if (thisFile === invokedFile) {
  main().catch((err) => {
    console.error('generate-pose-outline failed:');
    console.error(err);
    process.exit(1);
  });
}
