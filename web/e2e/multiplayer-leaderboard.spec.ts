import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Two-player leaderboard: create-room → join-via-URL → both ready up → both
 * forfeit → both see a scoreboard with two rows and distinct slot colours.
 *
 * Motivation: unit tests render GameOverScreen with a hand-crafted `players`
 * fixture. They cannot prove that a real second WebSocket client registers
 * against the same Durable Object, gets slot=2 assigned, and that both clients
 * see both rows when the match ends. That is what this test locks down.
 *
 * Runs against a local worker (wrangler dev). The DO is shared across the two
 * browser contexts because they hit the same room code.
 */

test.describe('Multiplayer leaderboard', () => {
  // Allow this flow a bit more time: two contexts, two WebSockets, a countdown
  // before play, plus the server-side game_over transition.
  test.setTimeout(60000)

  test('two players see a leaderboard with two rows after the match', async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    try {
      // ── Player 1: create a room ─────────────────────────────────────────
      await page1.goto('/')
      await page1.locator('text=SOLO GAME').waitFor({ state: 'visible' })
      // `page.click('body')` would land on the centred SOLO GAME button and
      // start a solo match — rely on the default keydown target being the
      // document body, which is all LaunchScreen's `window` listener needs.
      await page1.keyboard.press('2') // CREATE ROOM

      // Wait until the URL reflects the newly-minted room code.
      const roomCode = await extractRoomCode(page1)

      // Both pages should land in the lobby. The lobby renders a
      // `lobby-player-row` per occupied seat.
      await expect(page1.locator('[data-testid="lobby-player-row"]')).toHaveCount(1, { timeout: 15000 })

      // ── Player 2: join via the shared URL ───────────────────────────────
      await page2.goto(`/room/${roomCode}`)
      // Both clients should now see two rows. Query on either context.
      await expect(page1.locator('[data-testid="lobby-player-row"]')).toHaveCount(2, { timeout: 15000 })
      await expect(page2.locator('[data-testid="lobby-player-row"]')).toHaveCount(2, { timeout: 15000 })

      // The two rows must be distinct slots (cyan = 1, orange = 2) — this is
      // the invariant that proves the server assigned different player slots.
      const slots1 = await page1
        .locator('[data-testid="lobby-player-row"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slot).sort())
      expect(slots1).toEqual(['1', '2'])

      // ── Both players ready up ───────────────────────────────────────────
      // Clicking the "Ready" button is clearer than the Enter hotkey: it
      // removes any ambiguity about focus or key routing once the game canvas
      // has mounted. This is the same path a real player using a mouse takes.
      await page1.getByRole('button', { name: /^Ready$/ }).click()
      await page2.getByRole('button', { name: /^Ready$/ }).click()

      // Countdown → playing → we render the game canvas on both pages.
      await expect(page1.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 20000 })
      await expect(page2.locator('[data-testid="game-canvas"]')).toBeVisible({ timeout: 20000 })

      // The server guards `forfeit` with `playableStatuses`; during countdown
      // it's a no-op. Wait for countdown (~3s on the server) to finish before
      // issuing forfeit so we don't silently drop the message.
      await page1.waitForTimeout(3500)

      // ── Both players forfeit; server transitions to game_over ───────────
      await page1.keyboard.press('x')
      await page2.keyboard.press('x')

      // GameOverScreen renders one `leaderboard-row` per player. We need both
      // rows on both pages; the scoreboard is authoritative, not client-local.
      await expect(page1.locator('[data-testid="leaderboard-row"]')).toHaveCount(2, { timeout: 15000 })
      await expect(page2.locator('[data-testid="leaderboard-row"]')).toHaveCount(2, { timeout: 15000 })

      // Slots on the leaderboard must match the slots seen in the lobby.
      const leaderboardSlots1 = await page1
        .locator('[data-testid="leaderboard-row"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slot).sort())
      expect(leaderboardSlots1).toEqual(['1', '2'])
    } finally {
      await ctx1.close()
      await ctx2.close()
    }
  })
})

/**
 * Wait for the address bar to look like `/room/ABC123` and return the code.
 * This is the public, externally-observable way to discover the assigned
 * room — it's what a real user would copy/paste to a friend.
 */
async function extractRoomCode(page: Page): Promise<string> {
  await expect(async () => {
    const m = new URL(page.url()).pathname.match(/^\/room\/([A-Z0-9]{6})$/i)
    expect(m).not.toBeNull()
  }).toPass({ timeout: 15000 })
  const m = new URL(page.url()).pathname.match(/^\/room\/([A-Z0-9]{6})$/i)
  return m![1].toUpperCase()
}
