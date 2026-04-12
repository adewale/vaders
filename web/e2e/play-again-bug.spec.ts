import { test, expect } from '@playwright/test'

/**
 * REGRESSION: user reported "Play Again button doesn't work"
 * Root cause hypothesis: onReplay sends { type: 'ready' } to a server that is
 * in game_over state, which ignores it. The user stays stuck on the game_over screen.
 *
 * Expected: clicking Play Again returns the user to a playable state — either
 * a new game starting or back to the launch screen.
 */

test.describe('Play Again flow', () => {
  test('clicking Play Again after forfeit returns to a playable state', async ({ page }) => {
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1000)

    // Trigger game over via forfeit
    await page.keyboard.press('x')
    await expect(page.locator('[data-testid="replay-button"]')).toBeVisible({ timeout: 10000 })

    // Click Play Again
    await page.click('[data-testid="replay-button"]')

    // After clicking, within 15 seconds we should either be:
    // (a) back on the launch screen (text "SOLO GAME" visible), OR
    // (b) in a new game (canvas visible AND no game_over screen)
    // Either is "playable"; staying on game_over is NOT acceptable.
    await expect(async () => {
      const onLaunch = await page.locator('text=SOLO GAME').count() > 0
      const onGame = await page.locator('[data-testid="game-canvas"]').count() > 0
      const onGameOver = await page.locator('[data-testid="replay-button"]').count() > 0
      expect(onLaunch || (onGame && !onGameOver)).toBe(true)
    }).toPass({ timeout: 15000 })
  })
})
