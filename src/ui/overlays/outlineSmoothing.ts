export interface SmoothedTransform {
  /** Smoothed torso centerX in normalized [0..1] */
  centerX: number;
  /** Smoothed torso centerY in normalized [0..1] */
  centerY: number;
  /** Smoothed scale factor — ratio of detected-body-height to SVG-design-height */
  scale: number;
  /** Smoothed opacity 0..1 (fades out on landmark loss) */
  opacity: number;
  /** ms timestamp of last applyValidUpdate */
  lastUpdateTimestamp: number;
}

const ALPHA = 0.3;
const HOLD_MS = 800;
const FADE_MS = 300;

export function createInitialTransform(): SmoothedTransform {
  return { centerX: 0.5, centerY: 0.5, scale: 1.0, opacity: 0, lastUpdateTimestamp: 0 };
}

export function applyValidUpdate(
  current: SmoothedTransform,
  target: { centerX: number; centerY: number; scale: number },
  now: number,
): SmoothedTransform {
  return {
    centerX: lerp(current.centerX, target.centerX, ALPHA),
    centerY: lerp(current.centerY, target.centerY, ALPHA),
    scale: lerp(current.scale, target.scale, ALPHA),
    opacity: lerp(current.opacity, 1.0, ALPHA),
    lastUpdateTimestamp: now,
  };
}

export function applyMissingUpdate(current: SmoothedTransform, now: number): SmoothedTransform {
  if (current.lastUpdateTimestamp === 0) return current;
  const elapsed = now - current.lastUpdateTimestamp;
  if (elapsed < HOLD_MS) return current;
  if (elapsed < HOLD_MS + FADE_MS) {
    const fadeProgress = (elapsed - HOLD_MS) / FADE_MS;
    return { ...current, opacity: 1.0 - fadeProgress };
  }
  if (current.opacity === 0) return current;
  return { ...current, opacity: 0 };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
