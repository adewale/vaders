# Cloudflare Platform Audit

Status: draft audit; reviewed for low-traffic game assumptions  
Scope: Worker, Durable Objects, hibernatable WebSockets, storage, static assets, operational quality  
Primary reference: Cloudflare Durable Objects WebSocket best practices (`/durable-objects/best-practices/websockets/`) plus local Cloudflare skill references for Durable Objects API, patterns, and gotchas.

## 1. Cloudflare best-practice checklist used

### Durable Object WebSockets

- Prefer the **Hibernation WebSocket API**: `ctx.acceptWebSocket(server)` instead of `server.accept()`.
- Use `webSocketMessage`, `webSocketClose`, and `webSocketError` class handlers.
- Use `ctx.getWebSockets()` after wake; do not rely on in-memory connection lists.
- Use `serializeAttachment()` / `deserializeAttachment()` for small per-socket state that must survive hibernation.
- Keep attachments small; Cloudflare's documented limit is 2,048 bytes. Larger or longer-lived state belongs in DO storage.
- Remember hibernation resets all in-memory state and reruns the constructor.
- Minimize constructor work on wake.
- Avoid timers that keep the object alive. Use alarms for scheduled work, and only while work is pending.
- Cloudflare automatically handles WebSocket protocol ping/pong frames without waking the DO; application-level ping messages do wake it.
- Batch many small logical messages into fewer WebSocket frames when throughput matters.
- Validate WebSocket upgrade requests in the Worker before routing to a DO to avoid unnecessary DO billing.
- Handle close/error paths. With compatibility dates before `web_socket_auto_reply_to_close` (`2026-04-07` in current docs), explicitly closing in `webSocketClose` is the conservative pattern.
- Expect deploys to disconnect WebSockets; clients need reconnect/rejoin behavior.

### Durable Object design/storage

- Model one DO around one atom of coordination.
- Avoid global singleton bottlenecks for high traffic; shard if growth requires it.
- Persist all important state; memory is only a cache for the current wake cycle.
- Use `blockConcurrencyWhile()` sparingly for initialization/migration only.
- Avoid external I/O inside initialization critical sections.
- Prefer SQLite for structured/growing state.
- Batch writes and avoid rewriting large objects on every request.
- Use one alarm as an event queue when multiple timers are needed.
- Handle DO overload / `503` with retry and backoff where appropriate.
- Rate limit expensive public endpoints when abuse or high public traffic is expected. For this low-traffic public game, explicit room-creation rate limiting is intentionally deferred.

### Workers/static assets/security/observability

- Validate user input at the Worker edge where possible.
- Restrict CORS/origins when credentials or abuse-sensitive endpoints are involved.
- Serve static assets same-origin with APIs when possible to avoid CSP/CORS complexity.
- Emit structured, low-cardinality, context-rich logs; avoid per-tick/per-message production log spam.
- Include deploy metadata and correlation IDs consistently.

## 2. What the project does well

- **Right atom of coordination for gameplay.** `GameRoom` is one DO per room via `idFromName(roomCode)`, which is a natural multiplayer coordination boundary (`worker/src/index.ts:155-158`).
- **Uses hibernatable WebSockets.** `GameRoom` calls `this.ctx.acceptWebSocket(pair[1])`, not `server.accept()` (`worker/src/GameRoom.ts:305-312`).
- **Uses hibernation-safe socket enumeration.** Broadcasts use `this.ctx.getWebSockets()` (`worker/src/GameRoom.ts:942-951`, `1087-1091`).
- **Stores per-socket identity in attachments.** The player id is serialized after join and deserialized on messages/closes (`worker/src/GameRoom.ts:447-448`, `373`, `608`). The attachment is tiny and well below Cloudflare's limit.
- **Persists room state to SQLite.** `game_state` is created/restored in the constructor and persisted via `INSERT OR REPLACE` (`worker/src/GameRoom.ts:174-192`, `242-248`).
- **Uses alarms instead of Worker timers in the DO.** Countdown, active gameplay, and cleanup use storage alarms (`worker/src/GameRoom.ts:696-697`, `782-784`, `1026-1027`).
- **Has cleanup paths.** Empty/game-over rooms schedule cleanup and unregister from matchmaker (`worker/src/GameRoom.ts:1026-1027`, `1075-1084`, `1102-1112`).
- **Avoids production per-message debug logs.** `DEBUG_TRACE` defaults false.
- **Same-origin static assets are configured.** Worker serves API and `web/dist` through the `ASSETS` binding (`worker/wrangler.jsonc:13-17`).
- **Compatibility date is current enough for modern DO APIs.** `2026-04-29` (`worker/wrangler.jsonc:4`).

## 3. Best-practice violations and risks

### Resolved — Countdown hibernation source of truth

`countdownRemaining` used to be duplicated between persisted `this.game.countdownRemaining` and an in-memory field. The alarm handler now uses persisted `GameState` as the source of truth, so a hibernated/evicted DO can resume countdown after constructor rehydration. A regression test covers constructing a fresh `GameRoom` over persisted countdown state and firing `alarm()`.

### Resolved — Reconnect/rejoin protocol

A frontend-agnostic `rejoin` protocol now exists. Initial join syncs include an opaque `rejoinToken`, the token is persisted in `GameRoom` storage, clients reconnect to `?rejoin=1` and send `{ type: 'rejoin', token }`, and abnormal active-game disconnects keep the player slot for rejoin while clearing held input. Desktop web/mobile store the token in `sessionStorage`; the TUI observer keeps it in memory for the current run.

### Resolved — WebSocket close auto-reply compatibility

The Worker compatibility date has been updated to `2026-04-29`, which is after Cloudflare's documented `web_socket_auto_reply_to_close` compatibility date (`2026-04-07`). Explicit `ws.close()` from `webSocketClose` is no longer required by the current Cloudflare guidance.

### Accepted/documented — Application-level pings wake hibernated rooms every 30 seconds

Browser clients send `{ type: 'ping' }` every 30s. Cloudflare protocol ping/pong frames do not wake the DO, but browsers cannot send protocol ping frames directly. Decision: keep the application heartbeat for reliable phantom-player detection and user-visible reconnect behavior. The low-traffic cost tradeoff is documented in `client-core/src/connection/useGameConnection.ts`.

### Resolved — Unauthenticated WebSocket timeout

Accepted sockets now receive a small unauthenticated attachment with `acceptedAt`. The DO schedules/uses alarms to close sockets that do not `join`/`rejoin` within the timeout, and logs `ws_unauth_timeout` when cleanup occurs.

### Resolved — Worker validates WebSocket upgrade before DO routing

`worker/src/index.ts` now requires `GET` plus `Upgrade: websocket` for `/room/:code/ws` before routing to `GameRoom`; invalid upgrade attempts return `426` at the Worker edge.

### Accepted for now — Public room creation/matchmaking has no edge rate limit

`POST /room` creates a `GameRoom` and registers it (`worker/src/index.ts:122-143`). `/matchmake` may also create rooms. For a high-traffic public service this should be rate limited before DO creation.

Decision: **skip rate limiting for now** because Vaders is a low-traffic game and room creation is intentionally public/frictionless. Revisit only if abuse appears or traffic assumptions change.

### Accepted for low traffic — Matchmaker is a global singleton

`MATCHMAKER.idFromName('global')` centralizes all matchmaking and registry writes. Cloudflare guidance flags global singleton DOs as future bottlenecks for high-traffic systems.

Decision: **keep the global Matchmaker**. For this low-traffic game it is simpler, easier to reason about, and not expected to bottleneck. Shard by region/colo/bucket only if traffic materially increases.

### Accepted for low traffic — Matchmaker rewrites the entire room registry

`Matchmaker` stores all rooms in one object (`rooms`) and writes the entire object on every register/unregister/find prune (`worker/src/Matchmaker.ts:27-28`, `98`, `119`, `220`). At large scale this risks write amplification and object-size limits.

Decision: **keep the current registry representation** for now. For a low-traffic game, the simplicity is worth more than premature SQLite indexing. Move to SQLite rows only if room volume grows or storage size/write amplification becomes visible.

### Resolved — Constructor avoids outbound registry updates

`GameRoom` constructor still performs local schema/hydration/reconciliation work, but no longer starts `updateRoomRegistry()` from inside `blockConcurrencyWhile()`.

### P2 — Origin/CORS posture is permissive

CORS is `Access-Control-Allow-Origin: *` for API responses (`worker/src/index.ts:101-106`), and WebSocket origin is not checked before routing to the DO. This is okay for a fully public no-auth game, but it makes room creation and joins embeddable/callable by any site.

Fix:

- Decide the intended trust model.
- If only the deployed web app should create/join rooms, validate `Origin` for HTTP and WebSocket routes.
- If public API is intentional, combine with rate limiting.

### Resolved/exception-documented — Structured logging context propagation

`GameRoom` now threads `x-vaders-request-id` into internal Matchmaker register/unregister calls, and Matchmaker includes it in request-scoped logs. Boot/cold-start logs remain documented exceptions because they do not originate from a user request.

### Resolved — Region context reset

`index.ts` now resets `globalThis.CF_REGION` on every request to `request.cf?.colo ?? undefined`, preventing stale region values from previous requests in the same isolate.

### Resolved — Fire-and-forget failures are logged

`GameRoom` now wraps intentional background promises with `fireAndForget()`, which emits structured `async_task_failed` logs on rejection.

## 4. Game-loop/alarm tradeoff

The active game uses one alarm about every 33ms (`worker/src/GameRoom.ts:829-831`). Cloudflare guidance says alarms every few seconds should be questioned; 33ms alarms are far more aggressive.

This is not necessarily a bug: a server-authoritative real-time game needs a heartbeat. The important distinction is:

- **Idle/lobby/game-over rooms should hibernate.** Current design mostly supports this, except app-level pings and unauthenticated sockets.
- **Active rooms will not hibernate.** That is an accepted gameplay cost, but should be documented as a deliberate tradeoff.

Potential optimization later:

- Use lower tick rates in non-interactive wipe/countdown phases.
- Avoid full-state broadcasts when no visible state changed.
- Delta-compress or binary-pack state if bandwidth becomes a problem.

## 5. Cross-frontend impact

Any fixes must preserve the shared protocol model:

- TUI, desktop web, and mobile must continue to use the same `ClientMessage` / `ServerMessage` definitions.
- Rejoin must be frontend-agnostic. TUI may store its token in memory or a local file; web/mobile can use `sessionStorage`.
- Server must not branch game rules by client type.

## 6. Recommended remediation order

All eight low-traffic-adjusted remediation items have been implemented or explicitly accepted/documented.

Deferred by low-traffic decision: public room creation rate limiting, Matchmaker sharding, and Matchmaker SQLite migration.
