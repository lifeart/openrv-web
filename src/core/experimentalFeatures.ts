/**
 * experimentalFeatures - read/observe the "Experimental features" preference.
 *
 * Unfinished features (External Presentation window, Quad View) are hidden
 * from the UI unless the user opts in via this preference (default: off).
 */

import { getCorePreferencesManager, type PreferencesManager } from './PreferencesManager';

export function isExperimentalFeaturesEnabled(prefs: PreferencesManager = getCorePreferencesManager()): boolean {
  return prefs.getGeneralPrefs().experimentalFeatures;
}

export function setExperimentalFeaturesEnabled(
  enabled: boolean,
  prefs: PreferencesManager = getCorePreferencesManager(),
): void {
  prefs.setGeneralPrefs({ experimentalFeatures: enabled });
}

/**
 * Invoke `callback` whenever the experimental-features flag changes value.
 * Returns an unsubscribe function.
 */
export function onExperimentalFeaturesChange(
  callback: (enabled: boolean) => void,
  prefs: PreferencesManager = getCorePreferencesManager(),
): () => void {
  let last = isExperimentalFeaturesEnabled(prefs);
  return prefs.on('generalPrefsChanged', (general) => {
    if (general.experimentalFeatures !== last) {
      last = general.experimentalFeatures;
      callback(last);
    }
  });
}
