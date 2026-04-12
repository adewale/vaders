import { test, expect } from '@playwright/test'

/**
 * Launch-screen keyboard shortcuts. These were wired up in the current
 * iteration and need end-to-end proof that the event listener chain is
 * actually attached (jsdom unit tests exercise the handlers in isolation
 * but not the full `window.addEventListener` + React render path).
 *
 *   M — toggle SFX mute (silent UI)
 *   N — toggle music mute (silent UI)
 *   ? — open the controls cheatsheet; ? again closes it
 *   1 — start a solo game
 */

test.describe('Launch screen shortcuts', () => {
  test('M, N, ?, 1 all reach functional UI states without crashing', async ({ page }) => {
    // ── Error capture ─────────────────────────────────────────────────────
    // Any pageerror during this test means one of the shortcuts threw.
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')
    await page.locator('text=SOLO GAME').waitFor({ state: 'visible' })
    // Do NOT use `page.click('body')` here. The launch menu fills the viewport
    // centre, so clicking body lands on the SOLO GAME button and starts a game
    // before we've tested anything. page.keyboard.press targets the focused
    // element — after goto, focus defaults to the document body, so the
    // LaunchScreen's `window` keydown listener receives the event. No focus
    // stealing required.

    // The cheatsheet is mounted but hidden by default (`open` state = false).
    await expect(page.locator('[data-testid="controls-cheatsheet"]')).toHaveCount(0)

    // ── M: mute SFX ───────────────────────────────────────────────────────
    // The launch screen has no visible "muted" indicator (deliberate — matches
    // the TUI). The observable invariant is that pressing M doesn't crash
    // and leaves the launch menu still interactive.
    await page.keyboard.press('m')
    await expect(page.locator('text=SOLO GAME')).toBeVisible()

    // ── N: mute music ─────────────────────────────────────────────────────
    await page.keyboard.press('n')
    await expect(page.locator('text=SOLO GAME')).toBeVisible()

    // ── ?: open the cheatsheet ────────────────────────────────────────────
    // Shift+/ on a US keyboard produces `?`. Playwright accepts the literal
    // key string.
    await page.keyboard.press('?')
    await expect(page.locator('[data-testid="controls-cheatsheet"]')).toBeVisible({ timeout: 2000 })

    // The cheatsheet should document the shortcuts we just exercised — this
    // protects against a regression where someone removes one of the rows.
    const cheatsheet = page.locator('[data-testid="controls-cheatsheet"]')
    await expect(cheatsheet).toContainText('Mute SFX')
    await expect(cheatsheet).toContainText('Mute music')
    await expect(cheatsheet).toContainText('Toggle help')

    // ── ?: close the cheatsheet ───────────────────────────────────────────
    await page.keyboard.press('?')
    await expect(page.locator('[data-testid="controls-cheatsheet"]')).toHaveCount(0, { timeout: 2000 })

    // ── 1: start solo ─────────────────────────────────────────────────────
    // Proves the menu still processes hotkeys after all the prior toggles.
    await page.keyboard.press('1')
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 15000 })

    // Final check: no JS errors happened along the way.
    expect(pageErrors.map((e) => e.message)).toEqual([])
  })
})
