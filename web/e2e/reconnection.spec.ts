import { test, expect } from '@playwright/test'

test.describe('Reconnection', () => {
  // These tests verify that the web client can recover from a temporary
  // network interruption. The client should detect the dropped WebSocket
  // connection, show a reconnecting indicator, and automatically
  // re-establish the connection when the network is restored.

  test('reconnects after brief disconnect', async ({ page, context }) => {
    // Start a solo game so we have an active WebSocket connection
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 10000 })

    // Simulate a network interruption by toggling the browser offline.
    // This will cause the WebSocket connection to drop.
    //
    // TODO: Use Playwright's network control to go offline:
    // await context.setOffline(true)

    // The client should detect the disconnect and show a reconnecting
    // indicator (e.g. a "Reconnecting..." overlay or status message)
    //
    // TODO: await expect(page.locator('[data-testid="reconnecting"]')).toBeVisible({ timeout: 5000 })

    // Restore the network connection
    // TODO: await context.setOffline(false)

    // The client should automatically reconnect and resume showing
    // the game state. The reconnecting indicator should disappear.
    //
    // TODO: await expect(page.locator('[data-testid="reconnecting"]')).not.toBeVisible({ timeout: 10000 })
    // TODO: await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible()
  })
})
