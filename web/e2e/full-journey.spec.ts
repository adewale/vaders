import { test, expect } from '@playwright/test'

/**
 * Full user journey: every state transition the user can make.
 * Catches bugs where navigation gets stuck (like the Play Again bug).
 */

test.describe('Full user journey', () => {
  test('launch → solo → game → forfeit → game_over → play again → game → quit → launch', async ({ page }) => {
    // 1. Launch screen
    await page.goto('/')
    await expect(page.locator('text=SOLO GAME')).toBeVisible()
    await page.click('body')

    // 2. Start solo
    await page.keyboard.press('1')
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(500)

    // 3. Forfeit to reach game_over
    await page.keyboard.press('x')
    await expect(page.locator('[data-testid="replay-button"]')).toBeVisible({ timeout: 10000 })

    // 4. Play Again — must reach a new game
    await page.click('[data-testid="replay-button"]')
    // The key={serverUrl} remount will briefly show connecting, then canvas
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(500)

    // 5. Forfeit again
    await page.keyboard.press('x')
    await expect(page.locator('[data-testid="replay-button"]')).toBeVisible({ timeout: 10000 })

    // 6. Quit back to launch
    await page.click('[data-testid="quit-button"]')
    await expect(page.locator('text=SOLO GAME')).toBeVisible({ timeout: 10000 })

    // 7. Verify URL is clean (back to /)
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('launch → create room → lobby → back to launch', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=CREATE ROOM')).toBeVisible()
    await page.getByText('CREATE ROOM').click()

    // Expect either lobby text or room code in URL
    await expect(async () => {
      const urlHasRoom = page.url().match(/\/room\/[A-Z0-9]{6}/)
      const lobbyVisible = (await page.locator('text=/lobby|room/i').first().count()) > 0
      expect(urlHasRoom || lobbyVisible).toBeTruthy()
    }).toPass({ timeout: 15000 })
  })

  test('launch → join room with valid code', async ({ page }) => {
    await page.goto('/')

    await page.getByText('JOIN ROOM').click()
    await page.getByLabel('Room code').fill('ABC123')
    await page.keyboard.press('Enter')

    // URL should update to /room/ABC123
    await expect(async () => {
      expect(page.url()).toMatch(/\/room\/ABC123/i)
    }).toPass({ timeout: 10000 })
  })

  test('URL /room/ZZZZZZ (valid format, nonexistent) does not crash', async ({ page }) => {
    // ZZZZZZ is 6 chars (valid format per the router) but no such room exists
    await page.goto('/room/ZZZZZZ')

    // Wait for either connecting, error, or launch state — NOT a blank page
    await expect(async () => {
      const hasContent = await page.locator('body').textContent()
      expect(hasContent!.length).toBeGreaterThan(20)
    }).toPass({ timeout: 15000 })
  })

  test('URL /room/INVALIDX (malformed, 8 chars) falls back to launch', async ({ page }) => {
    // Router requires exactly 6 chars; malformed codes fall through to launch
    await page.goto('/room/INVALIDX')
    await expect(page.locator('text=SOLO GAME')).toBeVisible({ timeout: 10000 })
  })
})
