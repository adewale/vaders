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
