// worker/src/env.ts
// Shared Env interface for Cloudflare Worker bindings

export interface Env {
  GAME_ROOM: DurableObjectNamespace
  MATCHMAKER: DurableObjectNamespace
  ASSETS: Fetcher
  /**
   * Optional JSON-serialized DifficultyConfig (shared/types.ts) overriding
   * DEFAULT_DIFFICULTY at game start. Invalid JSON or shape logs a
   * `difficulty_config_invalid` wide event and falls back to defaults.
   * Set via `vars` in wrangler.jsonc or `.dev.vars` for local playtests.
   */
  DIFFICULTY_CONFIG?: string
}
