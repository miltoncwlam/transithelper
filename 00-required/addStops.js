/** Host apps can bind this so newly seen poles are remembered. Standalone copies may leave it as a no-op. */
let impl = () => {};

export function addStops(rows) {
  impl(rows);
}

export function bindAddStops(fn) {
  impl = typeof fn === 'function' ? fn : () => {};
}
