export const INSIGHTS_MODEL_PREFERENCES_KEY = "peh.nous.modelPreferences.v1";

export const INSIGHTS_RECEIPT_ACTION = {
  modelPreferenceChanged: "nous.model-preference.changed",
  modelPreferencesReset: "nous.model-preferences.reset",
} as const;

export const INSIGHTS_RECEIPT_ACTIONS = Object.values(INSIGHTS_RECEIPT_ACTION);
