import { test, expect } from '@playwright/test'

test.describe('Game over', () => {
  // The game over flow tests that after a player loses all their lives,
  // the game transitions to the "game_over" status and displays a
  // game over screen with the final score and a replay option.

  test('game over screen shows after defeat', async ({ page }) => {
    // Start a solo game (solo mode gives the player 3 lives)
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')

    // Wait for the game to start rendering
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 10000 })

    // To trigger game over, the player must lose all 3 lives. This happens
    // when aliens reach the player's row or when the player is hit by
    // alien projectiles. In an E2E test, we can either:
    //   1. Wait for the AI aliens to naturally defeat an idle player
    //   2. Use a test-only API to fast-forward the game state
    //
    // Option 1 is more realistic but slow; option 2 requires server support.
    //
    // TODO: Implement one of the above strategies to reach game over state

    // Once game over triggers, verify the game over screen appears
    // TODO: await expect(page.locator('[data-testid="game-over"]')).toBeVisible({ timeout: 60000 })

    // Verify the final score is displayed
    // TODO: await expect(page.locator('[data-testid="final-score"]')).toBeVisible()

    // Verify there is a way to start a new game (replay button or key prompt)
    // TODO: await expect(page.locator('[data-testid="replay-button"]')).toBeVisible()
  })
})
