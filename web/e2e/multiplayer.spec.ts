import { test } from '@playwright/test'

test.describe('Multiplayer flow', () => {
  // Multiplayer tests use two browser pages to simulate two players
  // connecting to the same game room via the Cloudflare Durable Object.

  test('two players join same room', async ({ browser }) => {
    // Player 1 opens the launch screen and creates a new room
    const page1 = await browser.newPage()
    await page1.goto('/')

    // Press '2' to select "Create Room" from the launch menu
    await page1.keyboard.press('2')

    // After room creation, the UI should display a room code (e.g. "ABC123")
    // that Player 2 can use to join. The room code may appear in the URL
    // (e.g. /room/ABC123) or in a visible element on screen.
    //
    // TODO: Extract the room code from the page:
    // const roomCode = await page1.locator('[data-testid="room-code"]').textContent()

    // Player 2 opens a second browser tab and joins with the room code
    const page2 = await browser.newPage()
    // TODO: Navigate to the room URL once we know the code format:
    // await page2.goto(`/room/${roomCode}`)

    // Both players should see a lobby or game screen showing 2 connected players.
    // The player count or player list should reflect both participants.
    //
    // TODO: Assert player count:
    // await expect(page1.locator('[data-testid="player-count"]')).toContainText('2')
    // await expect(page2.locator('[data-testid="player-count"]')).toContainText('2')

    // Cleanup
    await page1.close()
    await page2.close()
  })
})
