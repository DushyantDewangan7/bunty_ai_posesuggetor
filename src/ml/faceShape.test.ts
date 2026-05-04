// Synthetic test cases for deriveFaceShape. No Jest in the project yet — these
// run as a manual smoke-check via `npx tsx src/ml/faceShape.test.ts` (or just
// imported into a debug screen). Each builder produces a 468-element landmark
// array with only the indices used by the classifier populated; everything
// else is zero-filled. Coordinates are in normalized [0,1] face-mesh space.
//
// Calibration note: the geometric thresholds in faceShape.ts are tuned for
// real MediaPipe output. These synthetic vectors are designed to exercise
// each rule cleanly, not to model real anatomy — if the classifier gets
// retuned, expect to revisit these numbers.

import { computeFaceShapeMetrics, deriveFaceShape, FACE_MESH_LANDMARK_COUNT } from './faceShape';
import type { FaceLandmark } from '../native/FaceLandmarkerOutput.nitro';
import type { FaceShape } from '../types/userProfile';

interface ShapeFixture {
  faceLength: number;
  foreheadWidth: number;
  cheekboneWidth: number;
  jawWidth: number;
}

function buildLandmarks(f: ShapeFixture): FaceLandmark[] {
  const arr: FaceLandmark[] = new Array(FACE_MESH_LANDMARK_COUNT);
  for (let i = 0; i < FACE_MESH_LANDMARK_COUNT; i++) arr[i] = { x: 0, y: 0, z: 0 };

  // Place forehead↔chin along y axis, cheeks/forehead/jaw along x axis at
  // their respective y heights. Origin at face center.
  arr[10] = { x: 0, y: 0, z: 0 };
  arr[152] = { x: 0, y: f.faceLength, z: 0 };

  arr[21] = { x: -f.foreheadWidth / 2, y: 0.05, z: 0 };
  arr[251] = { x: f.foreheadWidth / 2, y: 0.05, z: 0 };

  arr[234] = { x: -f.cheekboneWidth / 2, y: f.faceLength * 0.4, z: 0 };
  arr[454] = { x: f.cheekboneWidth / 2, y: f.faceLength * 0.4, z: 0 };

  arr[172] = { x: -f.jawWidth / 2, y: f.faceLength * 0.85, z: 0 };
  arr[397] = { x: f.jawWidth / 2, y: f.faceLength * 0.85, z: 0 };

  return arr;
}

interface Case {
  name: string;
  fixture: ShapeFixture;
  expected: FaceShape;
}

const cases: Case[] = [
  // Oval — long face, cheeks ~ jaw
  {
    name: 'oval',
    fixture: { faceLength: 1.4, foreheadWidth: 0.9, cheekboneWidth: 1.0, jawWidth: 0.95 },
    expected: 'oval',
  },
  // Round — cheeks slightly wider than jaw, length ≈ width
  {
    name: 'round',
    fixture: { faceLength: 1.0, foreheadWidth: 0.85, cheekboneWidth: 1.0, jawWidth: 0.85 },
    expected: 'round',
  },
  // Square — strong jaw equal to cheekbones, length ≈ width
  {
    name: 'square',
    fixture: { faceLength: 1.0, foreheadWidth: 0.95, cheekboneWidth: 1.0, jawWidth: 1.0 },
    expected: 'square',
  },
  // Heart — forehead wider than jaw, cheeks ≥ jaw
  {
    name: 'heart',
    fixture: { faceLength: 1.2, foreheadWidth: 1.0, cheekboneWidth: 0.95, jawWidth: 0.7 },
    expected: 'heart',
  },
  // Diamond — cheeks much wider than both forehead and jaw
  {
    name: 'diamond',
    fixture: { faceLength: 1.2, foreheadWidth: 0.7, cheekboneWidth: 1.0, jawWidth: 0.8 },
    expected: 'diamond',
  },
];

export function runFaceShapeTests(): { pass: number; fail: number } {
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const lm = buildLandmarks(c.fixture);
    const got = deriveFaceShape(lm);
    const m = computeFaceShapeMetrics(lm);
    if (got === c.expected) {
      pass++;

      console.log(
        `PASS  ${c.name.padEnd(8)} → ${got}   l/w=${m?.lengthToWidth.toFixed(2)} f/j=${m?.foreheadToJaw.toFixed(2)} c/j=${m?.cheekboneToJaw.toFixed(2)}`,
      );
    } else {
      fail++;

      console.error(
        `FAIL  ${c.name.padEnd(8)} expected=${c.expected} got=${got}   l/w=${m?.lengthToWidth.toFixed(2)} f/j=${m?.foreheadToJaw.toFixed(2)} c/j=${m?.cheekboneToJaw.toFixed(2)}`,
      );
    }
  }

  console.log(`\n${pass}/${pass + fail} passed`);
  return { pass, fail };
}

// Run when executed directly (e.g. via tsx). The CommonJS `require` shim
// isn't part of RN runtime, so this block is gated on `typeof require` and
// removed by Metro at bundle time.
declare const require: { main?: { filename?: string } | undefined } | undefined;
declare const module: { filename?: string } | undefined;
if (
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require?.main?.filename !== undefined &&
  require.main.filename === module?.filename
) {
  runFaceShapeTests();
}
