export const NOUS_MODEL_PREFERENCES_KEY = "squidley.nous.modelPreferences.v1";

export const NOUS_RECEIPT_ACTION = {
  modelPreferenceChanged: "nous.model-preference.changed",
  modelPreferencesReset: "nous.model-preferences.reset",
} as const;

export const NOUS_RECEIPT_ACTIONS = Object.values(NOUS_RECEIPT_ACTION);
