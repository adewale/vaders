# Vaders Mobile Support Spec

Status: proposed  
Scope: web frontend + shared client-core input/audio + protocol-compatible mobile controls  
Non-goal: a separate simplified mobile game

Quality issues and Cloudflare-platform findings are tracked separately in `specs/cloudflare-platform-audit.md`.

## 1. Current state

- The web app explicitly blocks phones/tablets through `web/src/components/MobileGate.tsx`.
- The renderer already scales the fixed 120×36 logical game board into a 960×576 canvas and preserves the 5:3 aspect ratio.
- Input is keyboard-only in `web/src/App.tsx` via `WebInputAdapter` and the shared held-key tracker.
- The server protocol already has the core actions mobile needs: held movement (`input`), `shoot`, `ready`/`unready`, `start_solo`, `forfeit`, and `ping`.
- `client-core/` is the right place for touch-input semantics as long as it stays platform-agnostic.

## 2. Compatibility requirement

Mobile is a third frontend for the same game, not a fork. TUI, desktop web, and mobile players must be able to join the same room and play together against one authoritative `GameRoom` state.

Rules:

- No mobile-only room type.
- No mobile-only game speed, hitboxes, alien formation, score rules, lives, barriers, or weapon behavior.
- No forked WebSocket protocol. Mobile emits the same shared `ClientMessage` types and consumes the same `ServerMessage` sync/events as TUI and desktop web.
- Any protocol addition required for reliability, such as `rejoin`, must be frontend-agnostic and usable by TUI, desktop web, and mobile.
- Mobile rendering may have different chrome/controls, but the logical battlefield remains the same 120×36 coordinate system.

## 3. Design principle: keep the arcade cabinet feel

Mobile Vaders should feel like the same game running on a tiny handheld cabinet:

- Same 120×36 game field.
- Same server-authoritative movement speed, shooting cooldown, wave pacing, sprites, colors, and multiplayer balance.
- Same one-screen intensity: no scrolling, no zoomed-in camera, no auto-aim, no simplified alien grid.
- Touch controls should emulate a 3-button arcade panel, not redesign the mechanics.

If a phone cannot show the battlefield and controls at a playable size, the app should say so rather than compromise the game.

## 4. Supported devices

### Required

- Modern iOS Safari and Chrome/Firefox on Android.
- Landscape orientation only for gameplay.
- Minimum effective viewport after browser chrome: **720×432 CSS px** for gameplay.
- Touch primary input (`pointer: coarse`, `hover: none`).

### Unsupported

- Portrait gameplay.
- Viewports too small to display the board plus controls.
- Split-screen/multitasking layouts that reduce the viewport below the minimum.
- Old browsers without WebSocket, Canvas, Pointer Events or Touch Events, and Web Audio.

Portrait launch/menu may be allowed, but entering gameplay shows a rotate-to-landscape interstitial.

## 5. UX flows

### Launch

Replace the hard block in `MobileGate` with `DeviceGate` states:

- Desktop/keyboard: current behavior.
- Mobile portrait: show launch menu but warn that gameplay requires landscape; or show rotate prompt before joining.
- Mobile landscape and large enough: allow Solo, Create Room, Join Room, and Matchmaking.
- Mobile too small: show a clear unsupported-device screen.

### Lobby

Use large touch targets:

- Ready / Unready button.
- Start Solo button when alone.
- Copy room link / share room link.
- Mute SFX / Mute Music.
- Quit.

Keyboard hints remain visible on desktop only; mobile gets touch labels.

### Gameplay

Layout in landscape:

```text
┌──────────────────────────────────────────┐
│              5:3 game canvas              │
│                                          │
├───────────────┬──────────────┬───────────┤
│ ◀ hold        │  FIRE        │ hold ▶    │
└───────────────┴──────────────┴───────────┘
```

Rules:

- Canvas stays centered and aspect-correct.
- Controls live outside the logical 120×36 battlefield; they never cover aliens, barriers, players, score, or lives.
- Fire is reachable by either thumb. If space permits, duplicate fire buttons near both left and right controls.
- Forfeit/Quit is hidden behind a pause/menu button to avoid accidental taps.

### Game over

Large buttons:

- Play Again
- Back to Menu
- Share Room / Copy Result optional

## 6. Touch input model

Implement `WebTouchInputAdapter` in `web/src/adapters/` and keep gesture interpretation testable in `client-core/`.

### Movement

- Left button `pointerdown` => `updateInput({ left: true, right: false })`.
- Right button `pointerdown` => `updateInput({ left: false, right: true })`.
- Releasing/canceling/leaving a button releases that direction.
- If both directions become active, latest pointer wins; never send `{ left: true, right: true }` from touch controls.
- `visibilitychange`, `blur`, `pagehide`, and lost pointer capture must release both directions.

### Shooting

- Fire button `pointerdown` sends one `shoot` message immediately.
- Holding fire may auto-repeat at the existing server cooldown cadence, but never faster than the server can accept.
- Use client-side throttling to avoid flooding the socket. Suggested: 1 send every 120ms while held; the server remains authoritative.

### Readiness/actions

- Ready, Solo, Mute, Pause, Forfeit, Quit are normal buttons, not hidden gestures.
- No swipe gestures for gameplay-critical actions.

### Browser behavior

Touch surfaces must set:

- `touch-action: none`
- `user-select: none`
- pointer capture on `pointerdown`

This prevents page scrolling, selection, double-tap zoom, and lost drags during play.

## 7. Reconnection requirement

Mobile support must include real rejoin.

### Server

Add a rejoin token issued on initial `join`:

- Server sends `playerId` and `rejoinToken` in the first `sync` or a dedicated `joined` message.
- DO persists a hash or opaque token mapping to `playerId` and room code.
- WebSocket attachment stores `{ playerId, rejoinTokenId }`.
- A new `rejoin` client message binds a new socket to an existing alive player if token is valid.
- During a grace window, disconnected players remain in the game and keep their slot.

Suggested grace windows:

- Lobby/countdown: 30s.
- Active game: 90s.
- Game over: no rejoin needed.

### Client

- All frontends implement the same rejoin semantics.
- Web/mobile store the rejoin token in `sessionStorage`, scoped to room code.
- TUI stores the token in process memory for the current run; optional local persistence may be added later.
- On reconnect, connect to the same room and send `rejoin` before `join`.
- If rejoin fails, show a clear error and return to menu.
- Release all held inputs before reconnecting.

## 8. Rendering and performance

- Keep Canvas rendering; do not introduce DOM entities for gameplay.
- Cap visual rendering at `requestAnimationFrame`; server sync remains 30Hz.
- Pause local animation work while hidden, but keep the connection heartbeat/reconnect logic alive as browser policy allows.
- Respect reduced motion for CRT/shake effects if it materially improves readability.
- Preload audio after the first user gesture; mobile audio must tolerate silent failure.

## 9. Implementation plan

1. Fix Worker hibernation/rejoin prerequisites.
2. Add `DeviceGate` to replace `MobileGate` without enabling gameplay yet.
3. Add mobile layout primitives and orientation/size detection.
4. Add `WebTouchInputAdapter` and tests for pointer down/up/cancel/blur/pagehide.
5. Add mobile lobby/game/game-over controls.
6. Add Playwright mobile tests for launch, solo start, movement, shooting, ready-up, reconnect, rotate prompt, too-small gate, and mixed TUI/desktop-web/mobile room compatibility.
7. Remove the README claim that mobile is not on the roadmap and document the supported-device matrix.

## 10. Acceptance criteria

- A phone in landscape can start a solo game, move both directions, shoot, die, and replay.
- Two mobile players can ready up and play in the same room.
- TUI, desktop web, and mobile players can all join the same room and play together with identical server state.
- Backgrounding a mobile browser and returning within the grace window rejoins the same player slot.
- Rotating to portrait releases inputs and shows a rotate prompt; rotating back resumes without stuck movement.
- Touch controls never obscure gameplay-critical canvas content.
- All existing TUI, web, shared, client-core, and worker tests pass.
