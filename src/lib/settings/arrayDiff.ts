// Shared by every panel with an array field replaced wholesale (working_days,
// the two notification-routing email lists) — these are unordered
// collections conceptually, so equality ignores order.
export function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}
