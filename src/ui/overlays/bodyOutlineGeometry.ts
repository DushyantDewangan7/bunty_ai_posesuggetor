/**
 * Pure geometric body outline computation. No Skia imports — this file is
 * importable from `node --test` without the native Skia module loading.
 *
 * Renders the 33-landmark MediaPipe pose as a closed silhouette: torso
 * polygon, tapered limb tubes, head ellipse, hand/foot circles. The Skia
 * adapter (./bodyOutline.ts) maps these descriptors to SkPath instances.
 */

export interface OutlinePoint {
  /** Screen-space x in pixels (already mirrored / scaled by caller). */
  x: number;
  /** Screen-space y in pixels. */
  y: number;
  /** 0..1 confidence the landmark is visible (not occluded). */
  visibility: number;
}

export interface BodyOutlineConfig {
  /** Landmarks below this visibility are treated as missing. Defaults to 0.5. */
  visibilityThreshold?: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface PolygonPart {
  kind: 'torso' | 'limb';
  vertices: Vec2[];
}

export interface EllipsePart {
  kind: 'head';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface CirclePart {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export type BodyPart = PolygonPart | EllipsePart | CirclePart;

export interface BodyOutlineGeometry {
  parts: BodyPart[];
  /**
   * False iff a coherent silhouette could not be built (typically: shoulders
   * or hips below visibility threshold). Caller should fall back to skeleton
   * lines or skip rendering, depending on context.
   */
  valid: boolean;
}

const LANDMARK = {
  NOSE: 0,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

const DEFAULT_VISIBILITY = 0.5;

// Limb thickness ratios are expressed relative to shoulder width (a
// stable, body-scaled unit). Chosen by eye to read as a body silhouette
// without claiming anatomical accuracy.
const ARM_T_SHOULDER = 0.18;
const ARM_T_ELBOW = 0.13;
const ARM_T_WRIST = 0.1;
const LEG_T_HIP = 0.22;
const LEG_T_KNEE = 0.16;
const LEG_T_ANKLE = 0.12;
const HAND_RADIUS = 0.07;
const FOOT_RADIUS = 0.08;
const HEAD_NOSE_OFFSET = 0.15;
const HEAD_HEIGHT_RATIO = 1.25;
const HEAD_FALLBACK_WIDTH = 0.7;
const HEAD_EAR_WIDTH_PAD = 1.1;

export function computeBodyOutlineGeometry(
  points: readonly OutlinePoint[],
  config: BodyOutlineConfig = {},
): BodyOutlineGeometry {
  const threshold = config.visibilityThreshold ?? DEFAULT_VISIBILITY;
  if (points.length < 33) {
    return { parts: [], valid: false };
  }

  const ls = points[LANDMARK.L_SHOULDER];
  const rs = points[LANDMARK.R_SHOULDER];
  const lh = points[LANDMARK.L_HIP];
  const rh = points[LANDMARK.R_HIP];

  if (
    !isVisible(ls, threshold) ||
    !isVisible(rs, threshold) ||
    !isVisible(lh, threshold) ||
    !isVisible(rh, threshold)
  ) {
    return { parts: [], valid: false };
  }

  const shoulderWidth = distance(ls, rs);
  if (shoulderWidth < 1) {
    return { parts: [], valid: false };
  }

  const parts: BodyPart[] = [];

  parts.push({
    kind: 'torso',
    vertices: [
      { x: ls.x, y: ls.y },
      { x: rs.x, y: rs.y },
      { x: rh.x, y: rh.y },
      { x: lh.x, y: lh.y },
    ],
  });

  appendLimb(parts, {
    root: ls,
    mid: points[LANDMARK.L_ELBOW],
    tip: points[LANDMARK.L_WRIST],
    rootT: shoulderWidth * ARM_T_SHOULDER,
    midT: shoulderWidth * ARM_T_ELBOW,
    tipT: shoulderWidth * ARM_T_WRIST,
    threshold,
  });
  appendLimb(parts, {
    root: rs,
    mid: points[LANDMARK.R_ELBOW],
    tip: points[LANDMARK.R_WRIST],
    rootT: shoulderWidth * ARM_T_SHOULDER,
    midT: shoulderWidth * ARM_T_ELBOW,
    tipT: shoulderWidth * ARM_T_WRIST,
    threshold,
  });
  appendLimb(parts, {
    root: lh,
    mid: points[LANDMARK.L_KNEE],
    tip: points[LANDMARK.L_ANKLE],
    rootT: shoulderWidth * LEG_T_HIP,
    midT: shoulderWidth * LEG_T_KNEE,
    tipT: shoulderWidth * LEG_T_ANKLE,
    threshold,
  });
  appendLimb(parts, {
    root: rh,
    mid: points[LANDMARK.R_KNEE],
    tip: points[LANDMARK.R_ANKLE],
    rootT: shoulderWidth * LEG_T_HIP,
    midT: shoulderWidth * LEG_T_KNEE,
    tipT: shoulderWidth * LEG_T_ANKLE,
    threshold,
  });

  const nose = points[LANDMARK.NOSE];
  if (isVisible(nose, threshold)) {
    parts.push(
      headEllipse(
        nose,
        shoulderWidth,
        relaxedVisible(points[LANDMARK.L_EAR], threshold),
        relaxedVisible(points[LANDMARK.R_EAR], threshold),
      ),
    );
  }

  appendCircle(parts, points[LANDMARK.L_WRIST], shoulderWidth * HAND_RADIUS, threshold);
  appendCircle(parts, points[LANDMARK.R_WRIST], shoulderWidth * HAND_RADIUS, threshold);
  appendCircle(parts, points[LANDMARK.L_ANKLE], shoulderWidth * FOOT_RADIUS, threshold);
  appendCircle(parts, points[LANDMARK.R_ANKLE], shoulderWidth * FOOT_RADIUS, threshold);

  return { parts, valid: true };
}

interface LimbArgs {
  root: OutlinePoint;
  mid: OutlinePoint | undefined;
  tip: OutlinePoint | undefined;
  rootT: number;
  midT: number;
  tipT: number;
  threshold: number;
}

function appendLimb(out: BodyPart[], args: LimbArgs): void {
  const { root, mid, tip, rootT, midT, tipT, threshold } = args;
  const midOk = isVisible(mid, threshold);
  const tipOk = isVisible(tip, threshold);

  if (midOk && tipOk) {
    out.push({ kind: 'limb', vertices: tubeThroughThree(root, mid, tip, rootT, midT, tipT) });
    return;
  }
  if (tipOk) {
    out.push({ kind: 'limb', vertices: tubeBetween(root, tip, rootT, (midT + tipT) / 2) });
    return;
  }
  if (midOk) {
    out.push({ kind: 'limb', vertices: tubeBetween(root, mid, rootT, midT) });
    return;
  }
}

function appendCircle(
  out: BodyPart[],
  p: OutlinePoint | undefined,
  r: number,
  threshold: number,
): void {
  if (!isVisible(p, threshold)) return;
  out.push({ kind: 'circle', cx: p.x, cy: p.y, r });
}

function relaxedVisible(p: OutlinePoint | undefined, threshold: number): OutlinePoint | undefined {
  // Ears are often partially occluded even on a clean detection; relax the
  // threshold so we get a reasonable head-width estimate when possible.
  if (!p) return undefined;
  return p.visibility >= threshold * 0.6 ? p : undefined;
}

function isVisible(p: OutlinePoint | undefined, threshold: number): p is OutlinePoint {
  return p !== undefined && p.visibility >= threshold;
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function perpendicularUnit(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: -dy / len, y: dx / len };
}

function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return v;
  return { x: v.x / len, y: v.y / len };
}

export function tubeBetween(p1: Vec2, p2: Vec2, t1: number, t2: number): Vec2[] {
  const perp = perpendicularUnit(p1, p2);
  const h1 = t1 / 2;
  const h2 = t2 / 2;
  return [
    { x: p1.x + perp.x * h1, y: p1.y + perp.y * h1 },
    { x: p2.x + perp.x * h2, y: p2.y + perp.y * h2 },
    { x: p2.x - perp.x * h2, y: p2.y - perp.y * h2 },
    { x: p1.x - perp.x * h1, y: p1.y - perp.y * h1 },
  ];
}

export function tubeThroughThree(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t1: number,
  t2: number,
  t3: number,
): Vec2[] {
  const perp12 = perpendicularUnit(p1, p2);
  const perp23 = perpendicularUnit(p2, p3);
  const perpMid = normalize({ x: perp12.x + perp23.x, y: perp12.y + perp23.y });
  const h1 = t1 / 2;
  const h2 = t2 / 2;
  const h3 = t3 / 2;
  return [
    { x: p1.x + perp12.x * h1, y: p1.y + perp12.y * h1 },
    { x: p2.x + perpMid.x * h2, y: p2.y + perpMid.y * h2 },
    { x: p3.x + perp23.x * h3, y: p3.y + perp23.y * h3 },
    { x: p3.x - perp23.x * h3, y: p3.y - perp23.y * h3 },
    { x: p2.x - perpMid.x * h2, y: p2.y - perpMid.y * h2 },
    { x: p1.x - perp12.x * h1, y: p1.y - perp12.y * h1 },
  ];
}

function headEllipse(
  nose: Vec2,
  shoulderWidth: number,
  earL: OutlinePoint | undefined,
  earR: OutlinePoint | undefined,
): EllipsePart {
  let widthEst = shoulderWidth * HEAD_FALLBACK_WIDTH;
  if (earL && earR) {
    widthEst = distance(earL, earR) * HEAD_EAR_WIDTH_PAD;
  }
  const heightEst = widthEst * HEAD_HEIGHT_RATIO;
  return {
    kind: 'head',
    cx: nose.x,
    cy: nose.y - heightEst * HEAD_NOSE_OFFSET,
    rx: widthEst / 2,
    ry: heightEst / 2,
  };
}
