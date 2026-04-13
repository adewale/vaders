# TODO

Open product / UX questions that need a decision before implementation.
Engineering-only items go in commit comments or test file headers;
this file is for choices that affect the user.

---

## Stranded-matchmaker UX

**Scenario**. Matchmaking has a timing edge where a user hits Matchmake
expecting to join an active game and ends up alone in a freshly-created
room.

```
t=0    Alice matchmakes → no open room → server creates ABC123 → waits alone
t=1    Bob matchmakes   → /find returns ABC123 → joins → 2 players in ABC123
t=2    Alice & Bob ready → countdown → status flips out of `waiting`
t=3    Matchmaker removes ABC123 from openRooms
t=4    Charlie matchmakes → /find returns null → server creates XYZ789
t=5    Charlie lands in XYZ789 alone. Ticker: "Waiting for another player…"
```

Charlie's mental model is "Matchmake = join an active game". Reality
is "join an existing waiting room if one exists, otherwise create one
and wait". Those diverge at t=4 and nothing in the UI tells Charlie
what happened.

### Why the matchmaker works this way

Server has no "players looking" queue — it has a list of rooms. Rooms
are either `waiting` (joinable) or post-countdown (closed). When a room
closes, it disappears from the matchable pool. Architecturally correct:
making rooms retroactively joinable post-countdown would violate the
late-join rejection we already have (the HIGH PBT finding, fixed).

### Options (product decision required)

**1. "You're the seed" notice** — one-time toast when a user lands in a
freshly-created matchmade room as the only player: "You started a
matchmaking room. Others who matchmake in the next few minutes will
join you automatically." Honest, low-effort, no backend change.

**2. Retry button** — prominent button next to Start Solo: "Try
matchmaking again". Re-hits `/matchmake`. If a new room is available
you'll find it. Drawback: encourages bouncing if many users retry at
once.

**3. Background re-match** — silent periodic `/matchmake` if alone for
>30 seconds; silently relocate to a different room if one opened.
Drawback: user location changes without consent.

**4. Lobby-activity signal** — "4 players matchmaking right now" or "a
game just started X seconds ago". Drawback: needs matchmaker-side
metrics; privacy considerations around other-room info.

### Recommendation

Options 1 + 2 together:
- Honest explanation of state on arrival.
- Exit path when waiting becomes intolerable.
- No matchmaker-side changes.
- Fits existing informational-banner vocabulary (see `ErrorToast.tsx`
  and `PlayerDepartureNotice.tsx`).
- The retry button is structurally analogous to the Start Solo escape
  hatch added for the matchmake-alone regression.

### Copy draft

> **You started a matchmaking room.**
> Others who matchmake in the next few minutes will join you
> automatically. Or you can **Play Solo** now.
> _[Try matchmaking again]_

### Decisions required before implementation

- Which option(s)?
- If 1: auto-dismiss or stay? How long?
- If 2: how long to wait before surfacing the retry?
- Exact copy (voice/tone).

### Implementation notes (once decided)

- Detect "freshly created matchmade room with one player" on the
  client (App.tsx after `matchmake()` resolves — carry a flag into
  the Lobby).
- Components probably new `MatchmakeSeedNotice.tsx` (mirrors
  PlayerDepartureNotice for wiring pattern).
- Playwright test: spin up one context, matchmake, assert seed notice
  appears; then spin up a second context, matchmake, assert notice is
  dismissed when 2nd player joins.

---

## Phantom players (reproduced in production 2026-04-13 — **FIXED 2026-04-13**)

**Status**: all three mitigations (A + B + C) shipped in the same pass.
The production symptom (matchmaker trapped in XPJZ7K) will self-clear on
that DO's next wake (Option A) or after 10 min of no status progress in
the matchmaker (Option C). The history below is preserved for the
postmortem.

**This was why 2-player matchmaking didn't work for real users.** The
test against production reproduced the exact failure the user
reported.

### Reproduction

`PLAYWRIGHT_BASE_URL=https://vaders.adewale-883.workers.dev
./node_modules/.bin/playwright test matchmake-multiplayer --grep "8-step"`
fails at Step 2 with:

```
Expected pattern: /waiting for another player/i
Received string:  "0/4 ready — starting when all ready"
```

### Log-correlated trace

Full sequence for the failing run (from `wrangler tail --format=json`):

```
11:41:55.804  mm_rehydrate        totalRoomsStored=74  openRoomsRebuilt=1
11:41:55.804  mm_find_result hit  roomCode=XPJZ7K  playerCount=3  status=waiting
11:41:55.808  http_matchmake      outcome=joined_existing  roomCode=XPJZ7K
11:41:55.896  ws_upgrade_attempt  roomCode=XPJZ7K   (Alice)
11:41:56.301  mm_register         roomCode=XPJZ7K  playerCount=4  opened→closed
11:42:01.253  mm_register         roomCode=XPJZ7K  playerCount=3  closed→opened
              (Alice's tab closed; 3 phantoms remain)
```

Probe: `GET /room/XPJZ7K` returns `{ playerCount: 3, status: waiting }`.
Those 3 players have been in the room for an unknown duration, never
readied up, never left. They are phantoms.

### Why the user never sees a working matchmake

- Every matchmaker hitting `/matchmake` gets XPJZ7K (the only open
  room).
- They join and see 4 players (3 phantoms + themselves) but "0/4
  ready" — because the phantoms will never ready up.
- The ready threshold is "all players ready" — impossible while 3
  dead WebSockets occupy slots.
- The countdown never fires. The game never starts.
- The user closes the tab out of frustration, which temporarily
  reduces playerCount to 3 (their own leave IS delivered — log
  confirms closeCode 1006 wasClean=false is handled). But the room
  is re-registered with the 3 phantoms and re-opens for matchmaking,
  trapping the next user.

### Root causes (THREE compounding failures)

1. **No reconciliation on DO wake.** `GameRoom` constructor (at
   `worker/src/GameRoom.ts:170-195`) loads `this.game` from SQL but
   never cross-checks `state.players` against `ctx.getWebSockets()`.
   If a WS died during DO eviction (hibernation + process migration
   + etc.) and Cloudflare lost track of it, the player entry stays
   in SQL forever. On wake there's no garbage collection.

2. **No server-side heartbeat timeout.** The only heartbeat is
   client-initiated: `{ type: 'ping' }` → `{ type: 'pong' }`. The
   server does NOT track last-activity-per-player and does NOT kick
   stale players. A dead client tab that stops pinging stays
   registered indefinitely.

3. **Cloudflare close-event delivery can lag.** `closeCode: 1006
   wasClean: false` shows up in the log (Alice's close WAS delivered
   promptly). But a browser that's force-killed without a TCP FIN
   may not trigger close until Cloudflare's underlying TCP timeout
   fires. That window lets a matchmaker land in a room whose
   "players" are already gone.

(1) is the fundamental reason phantoms persist across DO lifecycle
events. (2) is the fundamental reason they persist while a single DO
remains alive. (3) is the timing window that creates them in the
first place.

### Fixes shipped (A + B + C)

**A. Reconcile on wake** — GameRoom constructor now prunes
`state.players` entries whose id is not attached to a live WebSocket
after rehydrating from SQL. See `worker/src/GameRoom.ts` — new block
below the `migrateGameState` call. Emits `reconcile_prune_phantoms`
wide event on every prune. Closes the primary phantom creation path.
Regression guard: `worker/src/state-machine.pbt.test.ts` → "REGRESSION:
GameRoom reconciles state.players against live WebSockets on wake".

**B. Heartbeat timeout** — `Player` type gained `lastActiveTick`
(`shared/types.ts`). GameRoom bumps it on every inbound
`webSocketMessage` and reaps any player idle for > 2400 ticks (~80s at
30Hz) at the top of `tick()` during active statuses. Threshold is
2× the `PING_INTERVAL + PONG_TIMEOUT` in `client-core`, so two missed
pings are tolerated before treating a player as gone. Emits
`reap_idle_player` wide event. If reaping empties the room during
active play, `endGame('defeat')` fires to avoid
`playing_with_zero_players`. Regression guards: `worker/src/state-machine.pbt.test.ts`
→ "REGRESSION: heartbeat reap removes idle players during active play".

**C. Progress-stale prune** — Matchmaker `RoomInfo` gained
`lastStatusChangeAt`. It refreshes only on status transitions, NOT on
playerCount churn. `/find` prunes any `waiting` room whose
`lastStatusChangeAt` is older than 10 minutes — the exact pattern of a
phantom-trapped room where victims cycle through without ever readying.
Emits `mm_prune_stale_by_progress` wide event. Regression guards:
`worker/src/Matchmaker.test.ts` → "REGRESSION: /find prunes
progress-stale rooms".

Defence-in-depth combination: A closes the source (eviction-origin
phantoms), B catches in-session phantoms (force-killed tab before close
event fires), C is the matchmaker-level safety net for anything that
escapes A+B.

### Clean-up of XPJZ7K specifically

XPJZ7K had 3 phantoms as of 2026-04-13 11:42 UTC. After the A+B+C
deploy, it self-clears via one of:
- Its next DO wake → Option A prunes the 3 phantoms from state.players
- 10 minutes of no further status transition → Option C prunes the
  matchmaker entry; no further matchmakers land there
- 5 minutes of no activity → the pre-existing `STALE_THRESHOLD` fires

No manual intervention required.

### Instrumentation that made this diagnosis possible

- `mm_rehydrate` (new today): showed 74 historical rooms in storage
  and only 1 currently open — immediately surfaced that the
  matchmaker was working off stale state.
- `mm_find_result` (new today): told us the matchmaker returned
  XPJZ7K with `playerCount: 3` BEFORE the new player joined.
- `http_matchmake outcome: joined_existing` — confirmed the
  client-visible symptom corresponds to the server's view.
- `mm_register openTransition`: showed the room flipping
  opened→closed on 4th join and closed→opened on leave — but NEVER
  unregistering entirely despite 3 dead players.

Without these wide events, we would only know "Alice saw 0/4 ready"
— not WHY.

---

## Other deferred items

### WebSocket hibernation coverage

The state-machine PBT harness flagged this: the `acceptWebSocket` mock
doesn't simulate the hibernate/wake cycle that causes
`deserializeAttachment` to be called without a warm in-memory object.
A real rejoin path (upgrade with `?rejoin` against a playing room) is
unreachable from unit tests. Needs real Cloudflare-env integration
(wrangler `--local` + a driver test), not a mock extension.

### Concurrent DO writes

`blockConcurrencyWhile` mock in the test harness is a pass-through.
Real hibernation has an alarm queue and can interleave alarm /
ws-message / fetch tasks; the harness doesn't stress those races.
Matters more as the game adds features that mutate DO state from
multiple entry points.
