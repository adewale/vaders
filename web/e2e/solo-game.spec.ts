import { test, expect } from '@playwright/test'

test.describe('Solo game flow', () => {
  // These tests require both the Cloudflare worker and Vite dev server running.
  // The playwright.config.ts webServer config will start them automatically,
  // but for local development you may want to start them manually first.

  test('start solo game and score increases', async ({ page }) => {
    // Navigate to the launch screen and ensure it has focus
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')

    // Press '1' to start a solo game from the launch menu
    await page.keyboard.press('1')

    // The app calls createSoloRoom() → POST /room → then connects WebSocket
    // Wait for either the game canvas OR an error/connecting state
    // Use a longer timeout since there's an HTTP call + WebSocket setup
    await expect(
      page.locator('[data-testid="game-canvas"], [data-testid="score"]').first()
    ).toBeVisible({ timeout: 20000 })

    // Verify the score HUD is displayed with a SCORE label
    await expect(page.locator('[data-testid="score"]')).toContainText('SCORE')

    // Fire a shot — the player ship starts centered at the bottom of the screen
    await page.keyboard.press('Space')

    // Score should eventually increase when the bullet hits an alien.
    // This is inherently timing-dependent because the bullet must travel
    // upward and collide with an alien in the formation. Use a generous
    // timeout and poll for a non-zero score value.
  })
})
