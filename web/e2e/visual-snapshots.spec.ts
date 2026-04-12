import { test, expect } from '@playwright/test'

test.describe('Visual snapshots', () => {
  // Visual tests are brittle across OSes due to font rendering. Run locally only.
  test.skip(!!process.env.CI, 'Visual snapshots skipped in CI (font rendering differences)')

  test('launch screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    // Generous tolerance for anti-aliasing differences
    await expect(page).toHaveScreenshot('launch.png', {
      maxDiffPixelRatio: 0.05,
      animations: 'disabled',
    })
  })

  test('game canvas at wave 1', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })
    // Wait for stable frame (no transient particles)
    await page.waitForTimeout(3000)
    const canvas = page.locator('[data-testid="game-canvas"]')
    await expect(canvas).toHaveScreenshot('game-canvas.png', {
      maxDiffPixelRatio: 0.1, // Allow 10% diff for alien animation frames + starfield
    })
  })

  test('game over screen (forfeit)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(500)
    await page.keyboard.press('x')
    await page.locator('text=/game over|victory/i').waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('game-over.png', {
      maxDiffPixelRatio: 0.05,
    })
  })
})
