export const AI_MODE_MMKV_ID = 'ai-mode';
export const AI_MODE_KEY = 'aiMode.enabled';

export interface AiModeStorage {
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: boolean): void;
}

export function loadAiMode(storage: AiModeStorage): boolean {
  return storage.getBoolean(AI_MODE_KEY) ?? false;
}

export function saveAiMode(storage: AiModeStorage, value: boolean): void {
  storage.set(AI_MODE_KEY, value);
}
