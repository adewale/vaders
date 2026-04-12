import { test, expect } from '@playwright/test'

/**
 * Solo replay flow: start → forfeit → Play Again must produce a fresh match.
 *
 * Motivation: unit tests can assert `resetEffects()` is called when GameScreen
 * unmounts, but only an end-to-end run proves the WebSocket replay path
 * actually re-issues `start_solo` against the server, receives a new sync with
 * score=0 / lives=3, and clears any leftover canvas-effect state. This exercises
 * the App-level key={serverUrl} remount pattern plus the tick-rewind cleanup.
 */

test.describe('Solo replay', () => {
  test('Play Again after forfeit starts a clean match (score=0, fresh canvas)', async ({ page }) => {
    // ── First match ───────────────────────────────────────────────────────
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })

    // Let a few sync ticks arrive so the renderer has real state to work with.
    await page.waitForTimeout(500)

    // Shoot a handful of times so there's a reasonable chance the first match
    // logs a non-zero score. We *don't* assert the score is >0 — that would be
    // flaky. We only need to prove the reset works on Play Again.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Space')
      await page.waitForTimeout(60)
    }

    // Forfeit to reach game_over quickly and deterministically.
    await page.keyboard.press('x')
    await expect(page.locator('[data-testid="replay-button"]')).toBeVisible({ timeout: 10000 })

    // ── Second match via Play Again ──────────────────────────────────────
    await page.click('[data-testid="replay-button"]')

    // The GameContainer is keyed by serverUrl, so a new room URL means a full
    // remount (new canvas, new tracker, fresh effect state). The launch screen
    // should not appear — we go straight back into solo gameplay.
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })
    // The replay button from the previous screen must be gone.
    await expect(page.locator('[data-testid="replay-button"]')).toHaveCount(0)

    // Give the server time to emit a fresh sync for the new room (solo starts
    // in `waiting` → `countdown` → `playing`; we just need the hidden score
    // element to reflect the new state).
    const score = page.locator('[data-testid="score"]')
    await score.waitFor({ state: 'attached', timeout: 15000 })

    // Score must reset: a fresh solo match begins at 0. If the previous
    // match's score leaked through, this assertion catches it.
    await expect(async () => {
      const text = (await score.textContent()) ?? ''
      expect(text).toContain('SCORE: 0')
    }).toPass({ timeout: 10000 })

    // Sanity: forfeit still works on the replayed match → proves the input
    // pipeline is fully wired to the new WebSocket, not an orphan from round 1.
    await page.keyboard.press('x')
    await expect(page.locator('[data-testid="replay-button"]')).toBeVisible({ timeout: 10000 })
  })
})
