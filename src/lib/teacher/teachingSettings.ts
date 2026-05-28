/**
 * Teaching settings for Public Squidley.
 *
 * Controls whether teach-while-chatting annotations appear,
 * and tracks first-run state. Browser localStorage only.
 */

export interface TeachingSettings {
  teachWhileChatting: boolean;
  firstRunCompleted: boolean;
  showInContextCards: boolean;
  showExplainHelpers: boolean;
}

export const TEACHING_SETTINGS_KEY = "squidley_teaching_settings";

export const DEFAULT_TEACHING_SETTINGS: TeachingSettings = {
  teachWhileChatting: true,
  firstRunCompleted: false,
  showInContextCards: true,
  showExplainHelpers: true,
};

export function loadTeachingSettings(): TeachingSettings {
  if (typeof window === "undefined") return DEFAULT_TEACHING_SETTINGS;
  try {
    const raw = localStorage.getItem(TEACHING_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TEACHING_SETTINGS, ...parsed };
    }
  } catch { /* ignore */ }
  return DEFAULT_TEACHING_SETTINGS;
}

export function saveTeachingSettings(settings: TeachingSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TEACHING_SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function markFirstRunCompleted(settings: TeachingSettings): TeachingSettings {
  return { ...settings, firstRunCompleted: true };
}
