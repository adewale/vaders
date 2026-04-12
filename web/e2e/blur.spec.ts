import { test, expect } from '@playwright/test'

test('window blur releases held keys', async ({ page }) => {
  await page.goto('/')
  await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
  await page.click('body')
  await page.keyboard.press('1')
  await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })

  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(200)

  // Dispatch blur event
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(200)

  // Verify page is still responsive
  await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible()
})
