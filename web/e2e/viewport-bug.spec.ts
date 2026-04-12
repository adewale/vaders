import { test, expect } from '@playwright/test'

/**
 * REGRESSION: user reported "only see the top-left quadrant of the screen."
 *
 * Root cause hypothesis: GameScreen applies `transform: scale(N)` with
 * `transformOrigin: 'top left'` on a div inside a flex-centered container.
 * Flex centering positions the unscaled 960x576 box, then the transform
 * scales from top-left, pushing content off-screen bottom-right.
 *
 * Expected: the canvas visual bounds must fit within the viewport.
 */

test.describe('Viewport fit', () => {
  test('entire canvas is visible within viewport at default size', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')

    const canvas = page.locator('[data-testid="game-canvas"]')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    // Measure the canvas's actual rendered bounding box in the viewport
    const box = await canvas.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()

    // The canvas's bounding box must fit entirely within the viewport
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
  })

  test('canvas preserves 5:3 aspect ratio', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')

    const canvas = page.locator('[data-testid="game-canvas"]')
    await expect(canvas).toBeVisible({ timeout: 15000 })
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    // Aspect ratio tolerance: 960/576 = 1.6667
    const aspect = box!.width / box!.height
    expect(aspect).toBeCloseTo(1.6667, 1)
  })

  test('bottom-right corner of canvas is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    await page.click('body')
    await page.keyboard.press('1')

    const canvas = page.locator('[data-testid="game-canvas"]')
    await expect(canvas).toBeVisible({ timeout: 15000 })
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    // The bottom-right corner must be inside the viewport
    const viewport = page.viewportSize()!
    const bottomRightX = box!.x + box!.width
    const bottomRightY = box!.y + box!.height
    expect(bottomRightX).toBeLessThanOrEqual(viewport.width)
    expect(bottomRightY).toBeLessThanOrEqual(viewport.height)
  })
})
