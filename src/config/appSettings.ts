export interface AppSettings {
  queimadasBufferM: number;
  prodesLimit: number;
  deterLimit: number;
  queimadasLimit: number;
  areasProtegidasLimit: number;
  vizinhosLimit: number;
  mapCenterLat: number;
  mapCenterLng: number;
  mapZoom: number;
  toastDurationMs: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  queimadasBufferM: 10000,
  prodesLimit: 1000,
  deterLimit: 1000,
  queimadasLimit: 2000,
  areasProtegidasLimit: 500,
  vizinhosLimit: 200,
  mapCenterLat: -22.5,
  mapCenterLng: -48.5,
  mapZoom: 7,
  toastDurationMs: 5000,
};

const SETTINGS_KEY = 'stratos-app-settings';

export function loadSettings(): AppSettings {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}