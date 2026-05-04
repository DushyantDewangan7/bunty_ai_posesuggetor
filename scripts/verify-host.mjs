// Structural verifier: launches puppeteer, loads scripts/mediapipe-host.html,
// waits for the PoseLandmarker to initialize, then exits. No images needed.
// Use to confirm the heaviest deps (Chromium, jsDelivr ESM, MediaPipe WASM,
// model download) work on this machine before processing real poses.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = pathToFileURL(path.join(__dirname, 'mediapipe-host.html')).href;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
  await page.goto(HOST, { waitUntil: 'load' });
  console.log('[verify] host page loaded, waiting for landmarker...');
  await page.waitForFunction(
    'window.__ready === true || typeof window.__error === "string"',
    { timeout: 180000 },
  );
  const err = await page.evaluate(() => window.__error ?? null);
  if (err) {
    console.log('[verify] FAILED:', err);
    process.exitCode = 1;
  } else {
    const status = await page.$eval('#status', (el) => el.textContent);
    console.log('[verify] OK — status:', status);
  }
} finally {
  await browser.close();
}
