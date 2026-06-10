// client/src/serverUrl.ts
// Single source of truth for resolving the game server URL.
//
// Bug context: App.tsx defaulted to 'http://localhost:8787' while the launcher
// bin/vaders.ts defaults to the production URL. Running the client directly
// (not via the launcher) silently targeted a dead localhost with no clear
// signal. The in-app default is now coherent with the launcher's production
// default. This lives in its own (OpenTUI-free) module so the resolution is
// unit-testable in isolation.

/**
 * Production server URL. MUST match the launcher default in bin/vaders.ts so a
 * direct `bun run src/index.tsx` and `bun run vaders` point at the same server.
 */
export const PRODUCTION_SERVER_URL = 'https://vaders.adewale-883.workers.dev'

/**
 * Resolve the server URL from the VADERS_SERVER override, falling back to the
 * production default. An unset OR empty override falls back (empty would
 * otherwise yield a useless empty URL).
 *
 * @param override - typically process.env.VADERS_SERVER
 */
export function resolveServerUrl(override: string | undefined): string {
  if (override && override.length > 0) {
    return override
  }
  return PRODUCTION_SERVER_URL
}
