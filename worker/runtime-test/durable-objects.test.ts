// Durable Object behaviour checked against the real Workers runtime (workerd),
// for the platform features the unit tests can only reach through the
// hand-rolled mock in src/mocks/cloudflare-workers.ts.
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import type { GameRoom } from '../src/GameRoom'

const PING = JSON.stringify({ type: 'ping' })
const PONG = JSON.stringify({ type: 'pong' })

interface RuntimeEnv {
  GAME_ROOM: DurableObjectNamespace<GameRoom>
}

function gameRoom(name: string): DurableObjectStub<GameRoom> {
  const ns = (env as unknown as RuntimeEnv).GAME_ROOM
  return ns.get(ns.idFromName(name))
}

// scheduleWakeNoLaterThan is private; reach it the way the DO itself does.
function scheduleWake(instance: GameRoom, when: number): Promise<void> {
  return (instance as unknown as { scheduleWakeNoLaterThan(when: number): Promise<void> }).scheduleWakeNoLaterThan(when)
}

describe('GameRoom on the real Workers runtime', () => {
  it('min-merges soft deadlines into the single alarm (real storage.getAlarm/setAlarm)', async () => {
    await runInDurableObject(gameRoom('alarm-min-merge'), async (instance, state) => {
      const now = Date.now()
      // No alarm yet: the real getAlarm() reports null.
      expect(await state.storage.getAlarm()).toBeNull()

      await scheduleWake(instance, now + 10_000)
      expect(await state.storage.getAlarm()).toBe(now + 10_000)

      // A later deadline must not push out the sooner pending alarm...
      await scheduleWake(instance, now + 60_000)
      expect(await state.storage.getAlarm()).toBe(now + 10_000)

      // ...and a sooner one must pull it in.
      await scheduleWake(instance, now + 5_000)
      expect(await state.storage.getAlarm()).toBe(now + 5_000)

      await state.storage.deleteAlarm()
    })
  })

  it('answers the heartbeat ping in the runtime without waking webSocketMessage', async () => {
    const stub = gameRoom('auto-response')
    const init = await stub.fetch('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode: 'AUTO01' }),
    })
    expect(init.status).toBe(200)

    // Replace the handler on this instance so we can see what reaches it.
    const received: string[] = []
    await runInDurableObject(stub, (instance) => {
      instance.webSocketMessage = vi.fn(async (_ws: WebSocket, message: string | ArrayBuffer) => {
        received.push(String(message))
      })
    })

    const upgrade = await stub.fetch('https://internal/ws', { headers: { Upgrade: 'websocket' } })
    expect(upgrade.status).toBe(101)
    const ws = upgrade.webSocket
    if (!ws) throw new Error('expected a WebSocket in the 101 response')
    ws.accept()
    const nextMessage = (what: string) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${what} within 2s`)), 2_000)
        ws.addEventListener(
          'message',
          (event) => {
            clearTimeout(timer)
            resolve(String(event.data))
          },
          { once: true },
        )
      })

    // The runtime answers the exact ping body itself...
    const pong = nextMessage('pong (the runtime did not auto-respond to the ping)')
    ws.send(PING)
    expect(await pong).toBe(PONG)

    // ...stamps the socket's last auto-response (the phantom-reap reads it)...
    const stamped = await runInDurableObject(stub, (_instance, state) => {
      const [server] = state.getWebSockets()
      return state.getWebSocketAutoResponseTimestamp(server)?.getTime() ?? null
    })
    expect(stamped).not.toBeNull()

    // ...and never delivers it to webSocketMessage, while other messages are
    // delivered (so the spy above is really wired to the handler).
    ws.send('not-a-ping')
    await vi.waitFor(() => expect(received).toEqual(['not-a-ping']))

    ws.close()
  })
})
