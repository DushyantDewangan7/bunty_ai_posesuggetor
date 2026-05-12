import generatedPosesJson from '../library/data/poses.generated.json' with { type: 'json' };

export const POSE_LIBRARY_MMKV_ID = 'pose-library';
export const POSE_LIBRARY_KEY = 'poseLibrary.activeIds.v1';

const DEFAULT_LIBRARY_HIDDEN = new Set(['crosslegged', 'warrior-1', 'thinker']);

// Read pose IDs from the generated JSON at module load. Hardcoding would
// silently break when new poses ship.
export const ALL_POSE_IDS: readonly string[] = (
  generatedPosesJson as readonly { id: string }[]
).map((p) => p.id);

const ALL_POSE_ID_SET = new Set(ALL_POSE_IDS);

export const DEFAULT_ACTIVE_POSE_IDS: ReadonlySet<string> = new Set(
  ALL_POSE_IDS.filter((id) => !DEFAULT_LIBRARY_HIDDEN.has(id)),
);

export interface PoseLibraryStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

export function loadActivePoseIds(storage: PoseLibraryStorage): Set<string> {
  const raw = storage.getString(POSE_LIBRARY_KEY);
  if (raw === undefined) return new Set(DEFAULT_ACTIVE_POSE_IDS);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_ACTIVE_POSE_IDS);
    // Intersect with ALL_POSE_IDS to drop stale IDs from removed poses or any
    // unknown IDs from a future library that hasn't shipped yet.
    return new Set(
      parsed.filter((id): id is string => typeof id === 'string' && ALL_POSE_ID_SET.has(id)),
    );
  } catch {
    return new Set(DEFAULT_ACTIVE_POSE_IDS);
  }
}

export function saveActivePoseIds(storage: PoseLibraryStorage, ids: ReadonlySet<string>): void {
  storage.set(POSE_LIBRARY_KEY, JSON.stringify(Array.from(ids)));
}

/**
 * Pure toggle. Returns the next set, or null when the toggle is a no-op
 * (unknown pose ID, or attempting to remove the last active pose).
 */
export function toggleActivePoseId(
  current: ReadonlySet<string>,
  poseId: string,
): Set<string> | null {
  if (!ALL_POSE_ID_SET.has(poseId)) return null;
  const next = new Set(current);
  if (next.has(poseId)) {
    if (next.size <= 1) return null;
    next.delete(poseId);
  } else {
    next.add(poseId);
  }
  return next;
}
