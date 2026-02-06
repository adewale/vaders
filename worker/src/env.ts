// worker/src/env.ts
// Shared Env interface for Cloudflare Worker bindings

export interface Env {
  GAME_ROOM: DurableObjectNamespace
  MATCHMAKER: DurableObjectNamespace
}
