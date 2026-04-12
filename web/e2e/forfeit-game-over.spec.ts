import { test, expect } from '@playwright/test'

test('forfeit (X key) triggers game over screen', async ({ page }) => {
  await page.goto('/')
  await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
  await page.click('body')
  await page.keyboard.press('1')
  await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1000)

  // Press X to forfeit
  await page.keyboard.press('x')

  // Game over screen should appear
  await expect(page.locator('text=/game over|victory/i')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid="replay-button"]')).toBeVisible()
  await expect(page.locator('[data-testid="quit-button"]')).toBeVisible()
})
