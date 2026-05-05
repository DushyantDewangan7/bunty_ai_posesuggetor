import type { PoseFrame } from '../types/landmarks';

export interface ValidationResult {
  valid: boolean;
  /** Count of landmarks with visibility >= 0.5 */
  visibleCount: number;
  /** Reason if invalid */
  reason?: string;
}

/**
 * Validate that a pose frame is good enough to capture as a reference.
 * Mirrors the offline pipeline's thresholds in scripts/process-poses.mjs.
 */
export function validateForCapture(frame: PoseFrame | null): ValidationResult {
  if (!frame || !frame.landmarks) {
    return { valid: false, visibleCount: 0, reason: 'No pose detected' };
  }

  const landmarks = frame.landmarks;
  if (landmarks.length !== 33) {
    return { valid: false, visibleCount: 0, reason: 'Incomplete landmarks' };
  }

  const visibleCount = landmarks.filter((lm) => lm.visibility >= 0.5).length;
  if (visibleCount < 30) {
    return {
      valid: false,
      visibleCount,
      reason: `Only ${visibleCount}/33 landmarks visible (need 30+)`,
    };
  }

  // Critical anchor landmarks for normalization (hip + shoulder midpoints)
  const criticalIndices = [11, 12, 23, 24];
  const criticalVisible = criticalIndices.every(
    (i) => landmarks[i] !== undefined && landmarks[i]!.visibility >= 0.5,
  );
  if (!criticalVisible) {
    return {
      valid: false,
      visibleCount,
      reason: 'Hip or shoulder anchors not visible',
    };
  }

  return { valid: true, visibleCount };
}
