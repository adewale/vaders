import { test, expect } from '@playwright/test'

test.describe('URL routing', () => {
  // The web frontend uses client-side routing to support direct URLs
  // for different game modes. This allows players to share links to
  // specific rooms and bookmark common actions.

  test('/ shows launch screen', async ({ page }) => {
    await page.goto('/')

    // The root URL should display the launch screen with all four
    // game mode options, matching the TUI client's launch menu
    await expect(page.locator('text=SOLO GAME')).toBeVisible()
    await expect(page.locator('text=CREATE ROOM')).toBeVisible()
    await expect(page.locator('text=JOIN ROOM')).toBeVisible()
    await expect(page.locator('text=MATCHMAKING')).toBeVisible()
  })

  test('/solo starts solo game directly', async ({ page }) => {
    // Navigating directly to /solo should bypass the launch screen
    // and immediately begin connecting to the server in solo mode
    await page.goto('/solo')

    // The page should either show a "connecting" state or jump
    // directly into the game canvas, but NOT show the launch menu
    //
    // TODO: Assert that the launch menu is NOT visible:
    // await expect(page.locator('text=SOLO GAME')).not.toBeVisible()
    //
    // TODO: Assert that the game or a connecting state is shown:
    // await expect(page.locator('[data-testid="game-canvas"], [data-testid="connecting"]'))
    //   .toBeVisible({ timeout: 10000 })
  })

  test('/room/INVALID shows error', async ({ page }) => {
    // Navigating to a room URL with a non-existent room code should
    // show a user-friendly error rather than a blank screen or crash
    await page.goto('/room/INVALID')

    // The client will attempt to connect via WebSocket to the room.
    // Since "INVALID" is not a real room code, it should either:
    //   - Receive an error message from the server
    //   - Time out and show a connection error
    //
    // TODO: Assert error state is displayed:
    // await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 15000 })
  })
})
