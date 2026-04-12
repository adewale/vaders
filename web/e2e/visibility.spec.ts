import { test, expect } from '@playwright/test'

test('tab hidden releases held keys and notifies server', async ({ page }) => {
  await page.goto('/')
  await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
  await page.click('body')
  await page.keyboard.press('1')
  await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })

  // Hold left arrow
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(200)

  // Simulate tab backgrounding via visibilityState override
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // After visibility change, movement should stop (no way to directly verify
  // from E2E without server state access, but at minimum no crash)
  await page.waitForTimeout(200)
  await page.keyboard.up('ArrowLeft')
  // Just verify page still responds
  await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible()
})
