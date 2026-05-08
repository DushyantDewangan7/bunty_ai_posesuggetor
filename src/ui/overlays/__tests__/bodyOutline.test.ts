import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

// Test the pure geometry layer; the Skia adapter is a thin map() over this
// and doesn't need its own runtime test.
import {
  computeBodyOutlineGeometry,
  tubeBetween,
  tubeThroughThree,
  type OutlinePoint,
  type PolygonPart,
  type EllipsePart,
} from '../bodyOutlineGeometry.ts';

const VIS = 0.9;
const HIDDEN = 0.1;

/**
 * Build a 33-element pose with a roughly T-pose layout in screen pixels on a
 * 1080×1920 canvas. Coordinates are eyeballed to be plausible, not exact.
 */
function tPose(overrides: Partial<Record<number, OutlinePoint>> = {}): OutlinePoint[] {
  const cx = 540;
  const top = 400;
  const points: OutlinePoint[] = Array.from({ length: 33 }, () => ({
    x: cx,
    y: top,
    visibility: VIS,
  }));
  // Face cluster
  points[0] = { x: cx, y: top + 60, visibility: VIS }; // nose
  points[7] = { x: cx - 80, y: top + 50, visibility: VIS }; // left ear
  points[8] = { x: cx + 80, y: top + 50, visibility: VIS }; // right ear
  // Shoulders
  points[11] = { x: cx - 200, y: top + 200, visibility: VIS };
  points[12] = { x: cx + 200, y: top + 200, visibility: VIS };
  // Elbows + wrists (arms out horizontal — true T-pose)
  points[13] = { x: cx - 400, y: top + 200, visibility: VIS };
  points[14] = { x: cx + 400, y: top + 200, visibility: VIS };
  points[15] = { x: cx - 600, y: top + 200, visibility: VIS };
  points[16] = { x: cx + 600, y: top + 200, visibility: VIS };
  // Hips
  points[23] = { x: cx - 150, y: top + 600, visibility: VIS };
  points[24] = { x: cx + 150, y: top + 600, visibility: VIS };
  // Knees + ankles
  points[25] = { x: cx - 160, y: top + 900, visibility: VIS };
  points[26] = { x: cx + 160, y: top + 900, visibility: VIS };
  points[27] = { x: cx - 170, y: top + 1200, visibility: VIS };
  points[28] = { x: cx + 170, y: top + 1200, visibility: VIS };

  for (const [k, v] of Object.entries(overrides)) {
    if (v) points[Number(k)] = v;
  }
  return points;
}

describe('computeBodyOutlineGeometry', () => {
  it('builds head + torso + 4 limbs + hands + feet for a clean T-pose', () => {
    const result = computeBodyOutlineGeometry(tPose());
    assert.equal(result.valid, true);

    const kinds = result.parts.map((p) => p.kind);
    // 1 head (ellipse) + 1 torso + 4 limbs + 2 hands + 2 feet = 10
    assert.equal(result.parts.length, 10);
    assert.equal(kinds.filter((k) => k === 'torso').length, 1);
    assert.equal(kinds.filter((k) => k === 'limb').length, 4);
    assert.equal(kinds.filter((k) => k === 'head').length, 1);
    assert.equal(kinds.filter((k) => k === 'circle').length, 4);
  });

  it('returns valid=false when left shoulder is below visibility', () => {
    const points = tPose({ 11: { x: 340, y: 600, visibility: HIDDEN } });
    const result = computeBodyOutlineGeometry(points);
    assert.equal(result.valid, false);
    assert.equal(result.parts.length, 0);
  });

  it('returns valid=false when a hip is below visibility', () => {
    const points = tPose({ 24: { x: 690, y: 1000, visibility: HIDDEN } });
    const result = computeBodyOutlineGeometry(points);
    assert.equal(result.valid, false);
  });

  it('arm renders as a single tapered line when elbow is occluded', () => {
    const points = tPose({ 13: { x: 140, y: 600, visibility: HIDDEN } });
    const result = computeBodyOutlineGeometry(points);
    assert.equal(result.valid, true);
    const limbs = result.parts.filter((p): p is PolygonPart => p.kind === 'limb');
    // Without the elbow vertex, the affected limb has 4 vertices (tubeBetween)
    // instead of 6 (tubeThroughThree). Three other limbs still bend so they
    // each contribute 6 vertices.
    const fourVert = limbs.filter((l) => l.vertices.length === 4);
    const sixVert = limbs.filter((l) => l.vertices.length === 6);
    assert.equal(fourVert.length, 1);
    assert.equal(sixVert.length, 3);
  });

  it('returns valid=false when every landmark is invisible', () => {
    const points: OutlinePoint[] = Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      visibility: 0,
    }));
    const result = computeBodyOutlineGeometry(points);
    assert.equal(result.valid, false);
  });

  it('renders both arms with their actual angles in an asymmetric pose', () => {
    // Right arm raised straight up, left arm out horizontal.
    const points = tPose({
      14: { x: 740, y: 350, visibility: VIS }, // right elbow up
      16: { x: 740, y: 150, visibility: VIS }, // right wrist further up
    });
    const result = computeBodyOutlineGeometry(points);
    assert.equal(result.valid, true);
    const limbs = result.parts.filter((p): p is PolygonPart => p.kind === 'limb');
    assert.equal(limbs.length, 4);

    // Each bent limb has 6 vertices; their bounding boxes should differ
    // because the right arm goes up and the left arm goes sideways.
    const bbox = (
      verts: { x: number; y: number }[],
    ): {
      w: number;
      h: number;
    } => {
      const xs = verts.map((v) => v.x);
      const ys = verts.map((v) => v.y);
      return {
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    };
    const boxes = limbs.map((l) => bbox(l.vertices));
    // We expect at least two different bbox aspect ratios — the raised right
    // arm should be much taller than wide; the left arm the opposite.
    const tall = boxes.some((b) => b.h > b.w);
    const wide = boxes.some((b) => b.w > b.h);
    assert.ok(tall, 'expected at least one limb with taller bbox (raised arm)');
    assert.ok(wide, 'expected at least one limb with wider bbox (horizontal arm)');
  });

  it('places head ellipse above the nose', () => {
    const result = computeBodyOutlineGeometry(tPose());
    const head = result.parts.find((p): p is EllipsePart => p.kind === 'head');
    assert.ok(head, 'head ellipse missing');
    // Nose at (540, 460). Head center should be above (smaller y).
    assert.ok(head.cy < 460, `expected head center above nose; got ${head.cy}`);
    // Width derived from ear-to-ear (160 px) × 1.1 = 176 → rx ≈ 88
    assert.ok(head.rx > 60 && head.rx < 120, `unexpected head rx: ${head.rx}`);
  });

  it('omits head when nose visibility is below threshold', () => {
    const points = tPose({ 0: { x: 540, y: 460, visibility: HIDDEN } });
    const result = computeBodyOutlineGeometry(points);
    assert.equal(result.valid, true);
    assert.equal(
      result.parts.find((p) => p.kind === 'head'),
      undefined,
    );
  });

  it('omits a limb entirely when both mid and tip are occluded', () => {
    const points = tPose({
      13: { x: 140, y: 600, visibility: HIDDEN },
      15: { x: -60, y: 600, visibility: HIDDEN },
    });
    const result = computeBodyOutlineGeometry(points);
    assert.equal(result.valid, true);
    const limbs = result.parts.filter((p) => p.kind === 'limb');
    // Three remaining limbs (right arm, both legs).
    assert.equal(limbs.length, 3);
  });
});

describe('tubeBetween', () => {
  it('produces a 4-vertex polygon symmetric around the segment', () => {
    const verts = tubeBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 10);
    assert.equal(verts.length, 4);
    // Horizontal segment, perpendicular is (0, 1) [unit, 90° ccw of +x].
    // Half-thicknesses 10 and 5 → top side (y=+h), bottom (y=-h).
    assert.deepEqual(verts[0], { x: 0, y: 10 });
    assert.deepEqual(verts[1], { x: 100, y: 5 });
    assert.deepEqual(verts[2], { x: 100, y: -5 });
    assert.deepEqual(verts[3], { x: 0, y: -10 });
  });

  it('returns degenerate (all-coincident) vertices when endpoints coincide', () => {
    // Caller is responsible for not invoking with coincident points; but the
    // function should not throw or NaN — perpendicular falls back to (0, 0).
    const verts = tubeBetween({ x: 5, y: 5 }, { x: 5, y: 5 }, 10, 10);
    assert.equal(verts.length, 4);
    for (const v of verts) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
    }
  });
});

describe('tubeThroughThree', () => {
  it('produces a 6-vertex polygon through three colinear points', () => {
    const verts = tubeThroughThree({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, 20, 14, 10);
    assert.equal(verts.length, 6);
    for (const v of verts) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
    }
    // Symmetric across the x-axis: vertex i should mirror vertex (5-i) in y.
    for (let i = 0; i < 3; i++) {
      const a = verts[i];
      const b = verts[5 - i];
      assert.ok(a && b, 'expected paired vertices');
      assert.equal(a.x, b.x);
      assert.ok(Math.abs(a.y + b.y) < 1e-9);
    }
  });

  it('preserves 6-vertex polygon shape across a bend', () => {
    // L-shaped bend: 0,0 → 100,0 → 100,100
    const verts = tubeThroughThree(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      20,
      20,
      20,
    );
    assert.equal(verts.length, 6);
    for (const v of verts) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
    }
  });
});
