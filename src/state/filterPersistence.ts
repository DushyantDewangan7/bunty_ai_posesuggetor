// TODO: filter rendering pipeline not yet implemented. See ADR-001 G40 (deferred).
export const FILTER_MMKV_ID = 'camera-filter';
export const FILTER_KEY = 'filter.current';

export type FilterId = 'none' | 'bw' | 'clarendon';

export const ALL_FILTERS: readonly FilterId[] = ['none', 'bw', 'clarendon'] as const;

export const FILTER_LABELS: Record<FilterId, string> = {
  none: 'Original',
  bw: 'Black & White',
  clarendon: 'Clarendon',
};

export interface FilterStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

function isFilterId(value: unknown): value is FilterId {
  return value === 'none' || value === 'bw' || value === 'clarendon';
}

export function loadFilter(storage: FilterStorage): FilterId {
  const raw = storage.getString(FILTER_KEY);
  return isFilterId(raw) ? raw : 'none';
}

export function saveFilter(storage: FilterStorage, value: FilterId): void {
  storage.set(FILTER_KEY, value);
}

export function nextFilter(current: FilterId, delta: 1 | -1): FilterId {
  const idx = ALL_FILTERS.indexOf(current);
  const len = ALL_FILTERS.length;
  const nextIdx = (((idx + delta) % len) + len) % len;
  return ALL_FILTERS[nextIdx]!;
}
