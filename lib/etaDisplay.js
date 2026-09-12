/** Wall-clock vs countdown for the prominent ETA number. Muted 開車／到達 lines stay wall-clock. */
export function etaPrimaryText(mode, { clock, minutesText }) {
  if (mode === 'countdown') return minutesText || '';
  return clock || '';
}
