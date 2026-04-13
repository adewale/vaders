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

  /**
   * Step-by-step walkthrough of the 8-step human flow for a 2-player
   * matchmaking game. Each `test.step()` block corresponds to one
   * action a human player would take. A failure here names the exact
   * step that broke — which maps 1:1 to the step a human would be
   * stuck on.
   *
   * Lives in this file (not a sibling) so it shares the same serial
   * describe and doesn't collide with the N-player tests above; the
   * global Matchmaker DO can't be fragmented across spec files.
   */
  test('Alice and Bob get a successful 2-player matchmaking game via the 8-step flow', async ({ browser }) => {
    const aliceCtx = await browser.newContext()
    const bobCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const bob = await bobCtx.newPage()
    let roomCode: string | null = null

    try {
      await test.step('Step 1 — Alice opens the URL and the launch screen loads', async () => {
        await alice.goto('/')
        await expect(alice.getByTestId('vaders-logo')).toBeVisible()
        await expect(alice.locator('[data-testid="homepage-footer"]').first()).toBeVisible()
      })

      await test.step('Step 2 — Alice presses 4 → lobby opens, she is alone, ticker says "Waiting for another player"', async () => {
        await alice.keyboard.press('4')
        await alice.waitForURL(/\/room\/[A-Z0-9]{6}(?:\/.*)?$/, { timeout: 10000 })
        const match = alice.url().match(/\/room\/([A-Z0-9]{6})/)
        expect(match, 'room code should appear in Alice\'s URL').not.toBeNull()
        roomCode = match![1]

        const ticker = alice.getByTestId('lobby-ready-ticker')
        await expect(ticker).toBeVisible({ timeout: 10000 })
        await expect(ticker).toContainText(/waiting for another player/i)
        // Regression guard on the "N/4 ready" misread — denominator
        // must NOT claim 4 players are needed.
        await expect(ticker).not.toContainText(/\d\/\d ready/)
        await expect(alice.getByTestId('lobby-player-row')).toHaveCount(1)
      })

      await test.step('Step 3 — Bob opens the URL → launch screen loads', async () => {
        await bob.goto('/')
        await expect(bob.getByTestId('vaders-logo')).toBeVisible()
      })

      await test.step('Step 4 — Bob presses 4 → matchmaker hands him Alice\'s room → both see 2 players in distinct slot colours', async () => {
        await bob.keyboard.press('4')
        await bob.waitForURL(/\/room\/[A-Z0-9]{6}(?:\/.*)?$/, { timeout: 10000 })
        const bobMatch = bob.url().match(/\/room\/([A-Z0-9]{6})/)
        expect(bobMatch, 'room code should appear in Bob\'s URL').not.toBeNull()
        // Critical: Bob converged on Alice's room (not a freshly created
        // one). If this fails, the matchmaker's /find returned null
        // instead of Alice's roomCode.
        expect(bobMatch![1]).toBe(roomCode)

        await expect(alice.getByTestId('lobby-player-row')).toHaveCount(2, { timeout: 10000 })
        await expect(bob.getByTestId('lobby-player-row')).toHaveCount(2, { timeout: 10000 })

        const aliceSlots = await alice
          .getByTestId('lobby-player-row')
          .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-slot')))
        const bobSlots = await bob
          .getByTestId('lobby-player-row')
          .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-slot')))
        expect(new Set(aliceSlots).size, 'both players have distinct slots').toBe(2)
        expect(new Set(bobSlots)).toEqual(new Set(aliceSlots))
      })

      await test.step('Step 5 — Both see "0/2 ready — starting when all ready"', async () => {
        await expect(alice.getByTestId('lobby-ready-ticker')).toContainText('0/2 ready', { timeout: 5000 })
        await expect(bob.getByTestId('lobby-ready-ticker')).toContainText('0/2 ready', { timeout: 5000 })
        await expect(alice.getByTestId('lobby-ready-ticker')).not.toContainText('/4 ready')
      })

      await test.step('Step 6 — Alice presses Enter → both see "1/2 ready"', async () => {
        await alice.keyboard.press('Enter')
        await expect(alice.getByTestId('lobby-ready-ticker')).toContainText('1/2 ready', { timeout: 5000 })
        await expect(bob.getByTestId('lobby-ready-ticker')).toContainText('1/2 ready', { timeout: 5000 })
      })

      await test.step('Step 7 — Bob presses Enter → countdown starts', async () => {
        await bob.keyboard.press('Enter')
        // Countdown ticker OR game-canvas (fast-transition race) is fine.
        await expect(
          alice
            .getByTestId('lobby-ready-ticker')
            .filter({ hasText: /starting in \d/i })
            .or(alice.getByTestId('game-canvas')),
        ).toBeVisible({ timeout: 5000 })
        await expect(
          bob
            .getByTestId('lobby-ready-ticker')
            .filter({ hasText: /starting in \d/i })
            .or(bob.getByTestId('game-canvas')),
        ).toBeVisible({ timeout: 5000 })
      })

      await test.step('Step 8 — Game canvas visible for both; gameplay keys accepted without crashing', async () => {
        await expect(alice.getByTestId('game-canvas')).toBeVisible({ timeout: 10000 })
        await expect(bob.getByTestId('game-canvas')).toBeVisible({ timeout: 10000 })

        // No ErrorBoundary fallback. No error toast. No crash.
        await expect(alice.getByRole('button', { name: /reload/i })).not.toBeVisible()
        await expect(bob.getByRole('button', { name: /reload/i })).not.toBeVisible()
        await expect(alice.getByTestId('in-game-error-toast')).not.toBeVisible()
        await expect(bob.getByTestId('in-game-error-toast')).not.toBeVisible()
      })

      await test.step('Step 9 — The game is actually PLAYABLE: server ticks advance, shooting spawns bullets, both clients are in sync', async () => {
        // Reads the dev-only __VADERS_STATE__ hook exposed by GameContainer.
        // If this assertion fails, the game screen is visible but the
        // simulation isn't running — which is precisely the "canvas is
        // visible but nothing happens" failure mode that Step 8's
        // `.toBeVisible()` misses.

        // Wait for aliens to exist on both sides (they appear at the end
        // of wipe_reveal, a few hundred ms after wipe_hold).
        await expect
          .poll(
            async () => {
              const aliens = await alice.evaluate(() => {
                const s = (window as { __VADERS_STATE__?: { entities?: { kind: string }[] } }).__VADERS_STATE__
                return s?.entities?.filter((e) => e.kind === 'alien').length ?? 0
              })
              return aliens
            },
            { timeout: 10000, message: 'aliens should populate after wipe_reveal' },
          )
          .toBeGreaterThan(0)

        // Capture the tick count on both sides; wait briefly; assert it
        // advanced — proves the server loop is running and broadcasting.
        const aliceTickBefore = await alice.evaluate(
          () => (window as { __VADERS_STATE__?: { tick?: number } }).__VADERS_STATE__?.tick ?? 0,
        )
        const bobTickBefore = await bob.evaluate(
          () => (window as { __VADERS_STATE__?: { tick?: number } }).__VADERS_STATE__?.tick ?? 0,
        )
        await alice.waitForTimeout(400)
        const aliceTickAfter = await alice.evaluate(
          () => (window as { __VADERS_STATE__?: { tick?: number } }).__VADERS_STATE__?.tick ?? 0,
        )
        const bobTickAfter = await bob.evaluate(
          () => (window as { __VADERS_STATE__?: { tick?: number } }).__VADERS_STATE__?.tick ?? 0,
        )
        expect(aliceTickAfter, 'Alice\'s tick advanced').toBeGreaterThan(aliceTickBefore)
        expect(bobTickAfter, 'Bob\'s tick advanced').toBeGreaterThan(bobTickBefore)

        // Alice shoots. The bullet must appear in BOTH clients' state
        // (proves the server broadcasts reach both WebSockets).
        await alice.keyboard.press('Space')
        await expect
          .poll(
            async () => {
              const n = await alice.evaluate(() => {
                const s = (window as { __VADERS_STATE__?: { entities?: { kind: string }[] } }).__VADERS_STATE__
                return s?.entities?.filter((e) => e.kind === 'bullet').length ?? 0
              })
              return n
            },
            { timeout: 3000, message: 'Alice\'s shoot should spawn a bullet in her state' },
          )
          .toBeGreaterThan(0)
        await expect
          .poll(
            async () => {
              const n = await bob.evaluate(() => {
                const s = (window as { __VADERS_STATE__?: { entities?: { kind: string }[] } }).__VADERS_STATE__
                return s?.entities?.filter((e) => e.kind === 'bullet').length ?? 0
              })
              return n
            },
            { timeout: 3000, message: 'Alice\'s bullet should also appear in Bob\'s state (coop sync)' },
          )
          .toBeGreaterThan(0)

        // Bob moves. His player.x in BOTH his own and Alice's view should
        // eventually differ from the starting position.
        const bobId = await bob.evaluate(
          () => (window as { __VADERS_PLAYER_ID__?: string | null }).__VADERS_PLAYER_ID__,
        )
        expect(bobId, 'Bob\'s playerId is known').toBeTruthy()
        const bobXBefore = await bob.evaluate((id: string) => {
          const s = (window as { __VADERS_STATE__?: { players?: Record<string, { x: number }> } }).__VADERS_STATE__
          return s?.players?.[id]?.x ?? 0
        }, bobId as string)
        await bob.keyboard.down('ArrowLeft')
        await bob.waitForTimeout(500)
        await bob.keyboard.up('ArrowLeft')
        const bobXAfterSelf = await bob.evaluate((id: string) => {
          const s = (window as { __VADERS_STATE__?: { players?: Record<string, { x: number }> } }).__VADERS_STATE__
          return s?.players?.[id]?.x ?? 0
        }, bobId as string)
        const bobXAfterAlice = await alice.evaluate((id: string) => {
          const s = (window as { __VADERS_STATE__?: { players?: Record<string, { x: number }> } }).__VADERS_STATE__
          return s?.players?.[id]?.x ?? 0
        }, bobId as string)
        expect(bobXAfterSelf, 'Bob\'s own view: his x changed').not.toBe(bobXBefore)
        expect(
          bobXAfterAlice,
          'Alice\'s view of Bob: his x changed (sync). Exact equality not asserted — broadcast latency means Alice may be one tick behind Bob\'s local read.',
        ).not.toBe(bobXBefore)
        // Tolerance: Alice and Bob are within a few ticks of each other.
        // At 30Hz ticks and 1 cell/tick movement speed, a broadcast lag
        // of ≤ 3 ticks is normal.
        expect(Math.abs(bobXAfterAlice - bobXAfterSelf)).toBeLessThanOrEqual(3)
      })

      await test.step('Step 10 — Canvas is actually painting (non-zero pixel variety)', async () => {
        // toBeVisible() only checks element presence + non-zero size. A
        // black canvas passes that. This step reads pixel data and
        // asserts there's visible variety — i.e., something was drawn.
        // The mid-game screen has starfield + HUD + aliens + ship, which
        // produces many distinct colour values; a broken renderer would
        // produce ≤ 2 (black + one accent or all black).
        const uniqueColours = await alice.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]')
          if (!canvas) return 0
          const ctx = canvas.getContext('2d')
          if (!ctx) return 0
          // Sample a small strip from the middle of the canvas.
          const data = ctx.getImageData(0, canvas.height / 2, canvas.width, 4).data
          const seen = new Set<number>()
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            seen.add((r << 16) | (g << 8) | b)
          }
          return seen.size
        })
        expect(uniqueColours, 'canvas has drawn pixels (not all one colour)').toBeGreaterThan(5)
      })
    } finally {
      await aliceCtx.close()
      await bobCtx.close()
    }
  })

  /**
   * Visual-regression golden files for the 2-player matchmake flow.
   *
   * Once the matchmake → lobby → countdown → game path is known to
   * work (Step 9 proves the simulation runs; Step 10 proves the canvas
   * paints), these snapshots become the "it still LOOKS right"
   * regression guard. A pixel diff against the golden image catches
   * silent CSS / layout drift that DOM assertions miss — e.g. a
   * stacking-context change that hides the ticker behind the QR code.
   *
   * Skipped in CI — font anti-aliasing and GPU raster diffs across
   * platforms produce false positives. Run locally before releases
   * to regenerate / verify; matches the pattern in
   * `visual-snapshots.spec.ts`.
   *
   * To update the golden files after a legitimate visual change:
   *   cd web && ./node_modules/.bin/playwright test matchmake-multiplayer \
   *     --grep "visual snapshots" --project=chromium --update-snapshots
   *
   * Lives in THIS file (not a sibling spec) so it shares the serial
   * describe mode with the matchmake N-player tests — Playwright's
   * `fullyParallel: true` would otherwise run it concurrently in its
   * own worker and collide with our 2/3/4-player tests on the single
   * global Matchmaker DO.
   */
  test('visual snapshots at each key moment of the 2-player flow', async ({ browser }) => {
    test.skip(!!process.env.CI, 'Visual snapshots skipped in CI (font rendering + GPU raster differences)')

    const aliceCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const bobCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const alice = await aliceCtx.newPage()
    const bob = await bobCtx.newPage()

    try {
      // ── Moment 1: launch screen (Alice, pre-matchmake) ─────────────
      await alice.goto('/')
      await expect(alice.getByTestId('vaders-logo')).toBeVisible()
      await alice.waitForTimeout(400)
      await expect(alice).toHaveScreenshot('matchmake-1-launch.png', {
        maxDiffPixelRatio: 0.05,
        animations: 'disabled',
      })

      // ── Moment 2: Alice alone in lobby ("Waiting for another player") ─
      await alice.keyboard.press('4')
      await alice.waitForURL(/\/room\/[A-Z0-9]{6}(?:\/.*)?$/, { timeout: 10000 })
      await expect(alice.getByTestId('lobby-ready-ticker')).toContainText(/waiting for another player/i)
      await alice.waitForTimeout(300)
      await expect(alice).toHaveScreenshot('matchmake-2-lobby-alone.png', {
        maxDiffPixelRatio: 0.05,
        animations: 'disabled',
        // Mask the QR code (changes with room code) and the footer (changes per deploy).
        mask: [alice.getByTestId('room-qr'), alice.locator('[data-testid="homepage-footer"]')],
      })

      // ── Moment 3: Bob joined, both in lobby with "0/2 ready" ───────
      await bob.goto('/')
      await expect(bob.getByTestId('vaders-logo')).toBeVisible()
      await bob.keyboard.press('4')
      await bob.waitForURL(/\/room\/[A-Z0-9]{6}(?:\/.*)?$/, { timeout: 10000 })
      await expect(alice.getByTestId('lobby-player-row')).toHaveCount(2, { timeout: 10000 })
      await expect(alice.getByTestId('lobby-ready-ticker')).toContainText('0/2 ready')
      await alice.waitForTimeout(300)
      await expect(alice).toHaveScreenshot('matchmake-3-lobby-two-players.png', {
        maxDiffPixelRatio: 0.05,
        animations: 'disabled',
        mask: [alice.getByTestId('room-qr'), alice.locator('[data-testid="homepage-footer"]')],
      })

      // ── Moment 4: mid-countdown (after both readied) ───────────────
      await alice.keyboard.press('Enter')
      await bob.keyboard.press('Enter')
      await expect(
        alice
          .getByTestId('lobby-ready-ticker')
          .filter({ hasText: /starting in \d/i })
          .or(alice.getByTestId('game-canvas')),
      ).toBeVisible({ timeout: 5000 })
      const countdownVisible = await alice
        .getByTestId('lobby-ready-ticker')
        .filter({ hasText: /starting in \d/i })
        .isVisible()
        .catch(() => false)
      if (countdownVisible) {
        await expect(alice).toHaveScreenshot('matchmake-4-countdown.png', {
          maxDiffPixelRatio: 0.08, // countdown number changes across the window
          animations: 'disabled',
          mask: [alice.getByTestId('room-qr'), alice.locator('[data-testid="homepage-footer"]')],
        })
      }

      // ── Moment 5: mid-game (aliens visible, ships visible) ─────────
      await expect(alice.getByTestId('game-canvas')).toBeVisible({ timeout: 10000 })
      await alice.waitForTimeout(800)
      await expect(alice.getByTestId('game-canvas')).toHaveScreenshot('matchmake-5-gameplay.png', {
        maxDiffPixelRatio: 0.15, // generous — aliens animate, UFO may appear
        animations: 'disabled',
      })
    } finally {
      await aliceCtx.close()
      await bobCtx.close()
    }
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
