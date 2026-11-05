/**
 * Single place for runtime configuration.
 * Android emulator + physical device both work with:  adb reverse tcp:3000 tcp:3000
 * (then "localhost" on the phone == your PC). Alternative: your PC's LAN IP.
 */
export const config = {
  baseUrl: 'http://localhost:3000',
  /** Normal JSON calls. */
  requestTimeoutMs: 20_000,
  /** One image PUT. ~1 MB over 2G (~50 kbps) needs ~160 s, so this is generous. */
  uploadTimeoutMs: 180_000,
  /** Endpoints of the silent device account (the app has no login screen; change paths here if your backend differs). */
  authEndpoints: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    refresh: '/api/auth/refresh',
  },
  retry: {
    baseDelayMs: 1_000,
    maxDelayMs: 5 * 60_000,
    minDelayMs: 500,
    /** Non-network, non-HTTP failures (e.g. a native crash) give up after this many tries. */
    maxLocalFailures: 8,
  },
} as const;
