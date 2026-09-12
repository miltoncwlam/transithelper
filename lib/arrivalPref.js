/** Last-bus restore wins over auto nearby. Incomplete prefs do not count. */

export function hasRestorableArrival(pref) {
  if (!pref?.service) return false;
  if (pref.stopIndex === '' || pref.stopIndex == null) return false;
  return true;
}
