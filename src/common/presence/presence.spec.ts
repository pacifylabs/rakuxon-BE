import { isOnline, PRESENCE_ONLINE_WINDOW_MS } from './presence';

describe('isOnline', () => {
  it('is false for null (never seen)', () => {
    expect(isOnline(null)).toBe(false);
  });

  it('is true just inside the window', () => {
    expect(isOnline(new Date(Date.now() - (PRESENCE_ONLINE_WINDOW_MS - 1000)))).toBe(true);
  });

  it('is false just outside the window', () => {
    expect(isOnline(new Date(Date.now() - (PRESENCE_ONLINE_WINDOW_MS + 1000)))).toBe(false);
  });

  it('is true for a heartbeat this instant', () => {
    expect(isOnline(new Date())).toBe(true);
  });
});
