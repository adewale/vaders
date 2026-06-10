// worker/src/env.ts
// Shared Env interface for Cloudflare Worker bindings

import type { Matchmaker } from './Matchmaker'

/**
 * The RPC surface of the Matchmaker DO as seen by callers. The binding's stub
 * is cast to this at call sites: `env.MATCHMAKER.get(id) as unknown as
 * MatchmakerStub`. (We can't type the namespace as
 * `DurableObjectNamespace<Matchmaker>` directly because the worker package
 * typechecks against the hand-rolled `cloudflare:workers` mock, whose
 * DurableObject base isn't RPC-branded.)
 */
export type MatchmakerStub = Pick<Matchmaker, 'register' | 'unregister' | 'find' | 'getRoomInfo'>

export interface Env {
  GAME_ROOM: DurableObjectNamespace
  MATCHMAKER: DurableObjectNamespace
  ASSETS: Fetcher
}
