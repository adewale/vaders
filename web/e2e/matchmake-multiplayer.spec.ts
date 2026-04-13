import { test, expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

/**
 * Matchmaking + coop gameplay: N concurrent players matchmake, converge on
 * the same room, ready up, the countdown fires, and the game starts with
 * exactly N players visible in shared state.
 *
 * These run SERIALLY (not in parallel) because the matchmaker is a
 * single global Durable Object keyed by the literal name "global" — two
 * matchmaking tests running concurrently would stomp each other's
 * open-room registry and produce cross-test room collisions. Serialising
 * isolates them; between tests, once the earlier suite reaches
 * `countdown` / `playing` / `game_over`, its room is no longer `status:
 * waiting`, so the matchmaker skips it and the next test gets a fresh
 * room.
 *
 * Why not re-use `multiplayer-leaderboard.spec.ts`? That spec creates a
 * room explicitly via CREATE ROOM and has player 2 join by URL. It does
 * NOT exercise `/?matchmake=true` at all — which is the whole point of
 * this suite. Regressions in the matchmaker (stale-room expiry,
 * playerCount gating, 4-player fullness) would pass there and fail in
 * production.
 *
 * The player-1 → wait-for-lobby → others-join ordering is deliberate.
 * Matchmaker `/find` only returns rooms with `playerCount > 0` (stranded
 * empty rooms are not matchable — see Matchmaker.ts). So fully-parallel
 * `/matchmake` calls from cold would all fail to find an existing room
 * and each create a different new one. Waiting until player 1 appears
 * in the lobby (WS join → register with playerCount=1) guarantees
 * subsequent matchmakers observe a matchable room.
 */

test.describe.configure({ mode: 'serial' })

test.describe('Matchmake multiplayer', () => {
  // Each test: N contexts × (goto + WS connect + countdown 3s + game start).
  // Budget generously for the 4-player case since it's the most stressed.
  test.setTimeout(90000)

  test('matchmake 2 players -> game starts with 2', async ({ browser }) => {
    await runMatchmakeTest(browser, 2)
  })

  test('matchmake 3 players -> game starts with 3', async ({ browser }) => {
    await runMatchmakeTest(browser, 3)
  })

  test('matchmake 4 players -> game starts with 4', async ({ browser }) => {
    await runMatchmakeTest(browser, 4)
  })
})

async function runMatchmakeTest(browser: import('@playwright/test').Browser, n: 2 | 3 | 4) {
  // One browser context per player. Distinct contexts give each page its
  // own cookie jar / localStorage / WebSocket — exactly what "N separate
  // players" means. Sharing a context across pages would coalesce some
  // of that state and isn't representative of the real multi-device
  // flow.
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  for (let i = 0; i < n; i++) {
    const ctx = await browser.newContext()
    contexts.push(ctx)
    pages.push(await ctx.newPage())
  }

  try {
    // ── Player 1: matchmake, wait for lobby ───────────────────────────
    // See suite-level comment for why P1 lands first: matchmaker /find
    // excludes rooms with playerCount=0, so we need P1 registered before
    // P2..N start matchmaking if we want them to converge.
    await pages[0].goto('/?matchmake=true')
    await expect(pages[0].locator('[data-testid="lobby-player-row"]')).toHaveCount(1, {
      timeout: 20000,
    })
    const roomCode = await extractRoomCode(pages[0])

    // ── Players 2..N: matchmake in parallel ───────────────────────────
    // Once P1 is registered with playerCount=1, subsequent matchmakers
    // will /find it and all converge. Parallel goto keeps wall-clock
    // time reasonable — sequential goto would add ~1s per extra player.
    await Promise.all(pages.slice(1).map((p) => p.goto('/?matchmake=true')))

    // All N pages must see all N players in the lobby.
    for (const p of pages) {
      await expect(p.locator('[data-testid="lobby-player-row"]')).toHaveCount(n, {
        timeout: 20000,
      })
    }

    // All N must be in the SAME room. If the matchmaker handed out
    // different rooms to any players (the race condition that motivates
    // the staggered ordering above), this assertion catches it — an
    // N-player lobby in two different rooms would be an illusion.
    for (const p of pages) {
      const code = new URL(p.url()).pathname.match(/^\/room\/([A-Z0-9]{6})$/i)?.[1]
      expect(code?.toUpperCase()).toBe(roomCode)
    }

    // Lobby slot colours must be distinct: 1..N, one per player. The
    // server assigns slots 1..4 in join order, so this proves each
    // context got a fresh slot rather than a duplicate.
    const slots = await pages[0]
      .locator('[data-testid="lobby-player-row"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slot).sort())
    expect(slots).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)))

    // ── All players ready up ──────────────────────────────────────────
    // Clicking the Ready button mirrors the multiplayer-leaderboard
    // spec: unambiguous focus, no reliance on keyboard routing. Fire in
    // parallel — the server's `checkStartConditions` only triggers
    // countdown once readyCount === playerCount, so ordering doesn't
    // matter.
    await Promise.all(pages.map((p) => p.getByRole('button', { name: /^Ready$/ }).click()))

    // ── Countdown fires, game starts ──────────────────────────────────
    // Matchmaking + all-ready → server runs a ~3s countdown → `playing`.
    // We race "countdown visible" against "canvas visible" because the
    // countdown window is narrow: on a fast local worker the lobby
    // transitions out of `waiting` before Playwright evaluates the
    // ticker. Seeing either proves the server moved out of the
    // `waiting` state in response to ready-all.
    //
    // The lobby-ready-ticker text is inside LobbyScreen, which
    // unmounts once `state.status !== 'waiting'`. So a test that
    // asserts the ticker ALONE is inherently racy with the
    // `countdown → playing` transition. `.or()` lets us accept
    // either witness.
    const countdownOrCanvas = pages[0]
      .locator('[data-testid="lobby-ready-ticker"]')
      .or(pages[0].locator('[data-testid="game-canvas"]'))
    await countdownOrCanvas.first().waitFor({ state: 'visible', timeout: 15000 })

    // Canvas mount is the observable proxy for `status: 'playing'`
    // (App.tsx routes away from LobbyScreen once status != 'waiting').
    // Check every page so a single-player straggler would surface here.
    for (const p of pages) {
      await expect(p.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 25000 })
    }

    // Final sanity: the HUD `score` element is only rendered inside
    // GameScreen, and it's rendered for every player (not slot-gated).
    // Its presence on all N pages is a second, independent witness
    // that every player made it into `playing`.
    for (const p of pages) {
      await expect(p.locator('[data-testid="score"]')).toBeAttached({ timeout: 10000 })
    }

    // ── Bonus: leaderboard rows at game-over ─────────────────────────
    // Forfeit all players → server transitions to game_over → scoreboard
    // shows N rows, one per player, with distinct slot badges.
    //
    // Forfeit is `playableStatuses`-gated; sending it during countdown
    // is a no-op (see multiplayer-leaderboard.spec.ts comment). Wait for
    // the status to leave countdown before forfeiting. We poll on the
    // canvas having been mounted >3s to cover the worst case.
    await pages[0].waitForTimeout(3500)

    for (const p of pages) {
      await p.keyboard.press('x')
    }

    for (const p of pages) {
      await expect(p.locator('[data-testid="leaderboard-row"]')).toHaveCount(n, {
        timeout: 20000,
      })
    }

    // Leaderboard slots must match the lobby slots. If the server
    // mis-maps players → leaderboard rows, this assertion fires.
    const leaderboardSlots = await pages[0]
      .locator('[data-testid="leaderboard-row"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slot).sort())
    expect(leaderboardSlots).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)))
  } finally {
    // Close contexts in parallel — sequential close adds ~100ms/context
    // to every test run for no benefit.
    await Promise.all(contexts.map((c) => c.close()))
  }
}

/**
 * Wait for the address bar to look like `/room/ABC123` and return the
 * code. Lifted from multiplayer-leaderboard.spec.ts verbatim so both
 * suites share the same external-observer contract.
 */
async function extractRoomCode(page: Page): Promise<string> {
  await expect(async () => {
    const m = new URL(page.url()).pathname.match(/^\/room\/([A-Z0-9]{6})$/i)
    expect(m).not.toBeNull()
  }).toPass({ timeout: 20000 })
  const m = new URL(page.url()).pathname.match(/^\/room\/([A-Z0-9]{6})$/i)
  return m![1].toUpperCase()
}
