/**
 * "Online" is computed at read time from a polling heartbeat, not pushed —
 * no WebSocket infrastructure exists (see the plan's own note on this). A
 * two-minute window comfortably outlasts the frontend's ~60s heartbeat
 * interval, so one missed tick (a slow request, a backgrounded tab) does not
 * flicker someone offline.
 */
export const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < PRESENCE_ONLINE_WINDOW_MS;
}
