// worker/src/Matchmaker.ts
// Matchmaker Durable Object - in-memory room registry

import type { DurableObjectState } from '@cloudflare/workers-types'
import { logEvent } from './logger'

const REQUEST_ID_HEADER = 'x-vaders-request-id'

function getRequestId(request?: Request): string | undefined {
  return request?.headers.get(REQUEST_ID_HEADER) ?? undefined
}

// lastStatusChangeAt is the timestamp of the most recent status
// transition (waiting → countdown, waiting → playing, etc.). Unlike
// updatedAt — which refreshes on every /register, including pure
// playerCount churn — it only moves when productive progress happens.
// A room that stays in `waiting` forever (because phantoms trap each
// new victim in an endless "0/N ready" cycle) will have a frozen
// lastStatusChangeAt and a fresh updatedAt. Option C prunes those.
type RoomInfo = {
  playerCount: number
  status: string
  updatedAt: number
  lastStatusChangeAt: number
}

export class Matchmaker {
  private rooms: Record<string, RoomInfo> = {}
  private openRooms: Set<string> = new Set()

  constructor(private state: DurableObjectState) {
    // Restore from storage on cold start
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Record<string, RoomInfo>>('rooms')
      let totalRooms = 0
      let openRooms = 0
      if (stored) {
        this.rooms = stored
        // Rebuild openRooms set. Require playerCount > 0 so stranded
        // empty rooms (creator abandoned, room never unregistered)
        // don't become matchmaking targets and trap later joiners.
        // PBT finding — see state-machine.pbt.test.ts FOUND BUG (LOW).
        for (const [roomCode, info] of Object.entries(stored)) {
          totalRooms++
          // Backfill lastStatusChangeAt on old persisted records —
          // added alongside Option C. Use updatedAt as a conservative
          // proxy; legacy entries aren't aged out immediately.
          if (typeof info.lastStatusChangeAt !== 'number') {
            info.lastStatusChangeAt = info.updatedAt ?? Date.now()
          }
          if (info.status === 'waiting' && info.playerCount > 0 && info.playerCount < 4) {
            this.openRooms.add(roomCode)
            openRooms++
          }
        }
      }
      // Wide event on DO cold-start rehydration so we can see how the
      // matchmaker warmed up — useful for diagnosing "nobody found my
      // room" cases where storage hydration might have stripped stale
      // entries.
      logEvent('mm_rehydrate', {
        totalRoomsStored: totalRooms,
        openRoomsRebuilt: openRooms,
      })
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const requestId = getRequestId(request)

    // POST /register - Room registers/updates itself
    if (url.pathname === '/register' && request.method === 'POST') {
      const { roomCode, playerCount, status } = (await request.json()) as {
        roomCode: string
        playerCount: number
        status: string
      }
      const wasOpen = this.openRooms.has(roomCode)
      const prev = this.rooms[roomCode]
      const statusChanged = !prev || prev.status !== status
      const now = Date.now()
      this.rooms[roomCode] = {
        playerCount,
        status,
        updatedAt: now,
        // Refresh only on status transitions (Option C). Plain
        // playerCount churn — the signature of phantom-trapped rooms
        // where new victims join/leave without ever readying — must
        // NOT refresh this, or the progress-stale prune can't fire.
        lastStatusChangeAt: statusChanged ? now : prev.lastStatusChangeAt,
      }

      // Update openRooms set. Require playerCount > 0 to avoid
      // returning empty rooms from /find — a player who creates a
      // room then abandons it before anyone joins would otherwise
      // strand the next matchmaker alone in a dead room for the
      // full STALE_THRESHOLD (5 min). Once someone joins,
      // playerCount > 0 and the room becomes matchable.
      const nowOpen = status === 'waiting' && playerCount > 0 && playerCount < 4
      if (nowOpen) {
        this.openRooms.add(roomCode)
      } else {
        this.openRooms.delete(roomCode)
      }

      await this.state.storage.put('rooms', this.rooms)
      // Wide event on every registration. Includes the transition so
      // diagnostic queries like "which rooms flipped open ↔ closed
      // around t?" are one filter. openRoomsCount is the post-update
      // size of the matchable pool.
      logEvent('mm_register', {
        requestId,
        roomCode,
        playerCount,
        status,
        openTransition: wasOpen === nowOpen ? 'no-change' : wasOpen ? 'opened→closed' : 'closed→opened',
        openRoomsCount: this.openRooms.size,
      })
      return new Response('OK')
    }

    // POST /unregister - Room removes itself
    if (url.pathname === '/unregister' && request.method === 'POST') {
      const { roomCode } = (await request.json()) as { roomCode: string }
      const wasKnown = roomCode in this.rooms
      delete this.rooms[roomCode]
      this.openRooms.delete(roomCode)
      await this.state.storage.put('rooms', this.rooms)
      logEvent('mm_unregister', {
        requestId,
        roomCode,
        wasKnown,
        openRoomsCount: this.openRooms.size,
      })
      return new Response('OK')
    }

    // GET /find - Find an open room.
    //
    // Read-through verification: openRooms is maintained on every
    // /register, but it's possible (for instance, on cold-start race with
    // an in-flight update, or a register/unregister out-of-order) for
    // the set to contain a room whose current info no longer satisfies
    // the open criteria. Rather than trust set-membership, we re-verify
    // status + playerCount against this.rooms before returning the
    // roomCode. Stale entries are pruned on-the-fly.
    if (url.pathname === '/find') {
      const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes
      // Option C: a room that's been in `waiting` for more than this
      // threshold without any status transition is presumed stuck
      // (e.g. phantom-trapped: new victims cycle through without
      // readying, keeping updatedAt fresh but lastStatusChangeAt
      // frozen). Force-prune it from the matchmaker so the next
      // matchmaker sees a fresh pool.
      const PROGRESS_STALE_THRESHOLD = 10 * 60 * 1000 // 10 minutes
      const now = Date.now()

      // Track pruning reasons so the wide event can explain WHY /find
      // returned null in any given call. Helpful for the "I matchmaked
      // but ended up alone" report — shows whether the pool was empty,
      // populated-but-stale, or populated-but-all-filtered.
      const scanned = this.openRooms.size
      let prunedMissing = 0
      let prunedStale = 0
      let prunedProgressStale = 0
      let prunedFiltered = 0

      for (const roomCode of this.openRooms) {
        const info = this.rooms[roomCode]
        if (!info) {
          this.openRooms.delete(roomCode)
          prunedMissing++
          continue
        }
        if (now - info.updatedAt > STALE_THRESHOLD) {
          delete this.rooms[roomCode]
          this.openRooms.delete(roomCode)
          prunedStale++
          continue
        }
        // Progress-stale: the room IS active (updatedAt recent) but
        // hasn't made any status progress for >10 min. Phantom-trapped
        // rooms look exactly like this. Prune the registry entry
        // entirely — the GameRoom DO remains, but matchmakers stop
        // sending new victims. Next DO wake will fire Option A's
        // reconciliation, cleaning the phantoms. Meanwhile, the next
        // matchmaker gets a fresh room rather than joining the trap.
        if (info.status === 'waiting' && now - info.lastStatusChangeAt > PROGRESS_STALE_THRESHOLD) {
          logEvent('mm_prune_stale_by_progress', {
            requestId,
            roomCode,
            playerCount: info.playerCount,
            status: info.status,
            msSinceStatusChange: now - info.lastStatusChangeAt,
            msSinceLastUpdate: now - info.updatedAt,
            progressThresholdMs: PROGRESS_STALE_THRESHOLD,
          })
          delete this.rooms[roomCode]
          this.openRooms.delete(roomCode)
          prunedProgressStale++
          continue
        }
        // Read-through guard — defends against `openRooms` drifting out
        // of sync with `rooms`. A room that started in `waiting` and
        // flipped to `countdown`/`playing` via a re-register that came
        // in between set updates would otherwise be briefly findable.
        if (info.status !== 'waiting' || info.playerCount <= 0 || info.playerCount >= 4) {
          this.openRooms.delete(roomCode)
          prunedFiltered++
          continue
        }
        logEvent('mm_find_result', {
          requestId,
          result: 'hit',
          roomCode,
          playerCount: info.playerCount,
          status: info.status,
          openRoomsScanned: scanned,
          prunedMissing,
          prunedStale,
          prunedProgressStale,
          prunedFiltered,
        })
        return new Response(JSON.stringify({ roomCode }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      await this.state.storage.put('rooms', this.rooms)

      logEvent('mm_find_result', {
        requestId,
        result: 'miss',
        roomCode: null,
        openRoomsScanned: scanned,
        prunedMissing,
        prunedStale,
        prunedProgressStale,
        prunedFiltered,
        openRoomsRemaining: this.openRooms.size,
      })
      return new Response(JSON.stringify({ roomCode: null }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // GET /info/:roomCode - Get room info
    const infoMatch = url.pathname.match(/^\/info\/([A-Z0-9]{6})$/)
    if (infoMatch) {
      const roomCode = infoMatch[1]
      const info = this.rooms[roomCode]
      if (!info) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(JSON.stringify({ roomCode, ...info }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404 })
  }
}
