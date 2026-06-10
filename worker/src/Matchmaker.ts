// worker/src/Matchmaker.ts
// Matchmaker Durable Object - in-memory room registry

import type { DurableObjectState } from '@cloudflare/workers-types'
import { logEvent } from './logger'

const REQUEST_ID_HEADER = 'x-vaders-request-id'

/** A room untouched for this long is presumed dead and swept from the registry. */
const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes
/** A `waiting` room that hasn't made status progress for this long is phantom-trapped. */
const PROGRESS_STALE_THRESHOLD = 10 * 60 * 1000 // 10 minutes

/**
 * Hard ceiling on tracked rooms. The registry persists as a SINGLE storage
 * value (`put('rooms', …)`). This DO is KV-backed (migration `new_classes`,
 * async `storage.get/put`), so that value is subject to Cloudflare's **128 KiB
 * KV value limit** — NOT the 2 MB SQLite row limit. Each room record is
 * ~130 bytes worst case, so 500 rooms (~65 KB) stays well under 128 KiB with
 * margin. The cap makes storage structurally bounded even under a burst of
 * room creation — past this, new-room registration is refused (the Worker
 * surfaces a 503) rather than letting the value grow until `put` throws and
 * matchmaking breaks for everyone.
 *
 * Longer term, the registry should move to per-room SQLite rows (one
 * `INSERT OR REPLACE` per room) to remove both the value-size ceiling and the
 * whole-blob rewrite on every `/register`. That needs a storage-backend
 * migration; the cap + sweep is the correct bounded fix until then.
 */
export const MAX_TRACKED_ROOMS = 500

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

  /**
   * Remove every room whose last update is older than STALE_THRESHOLD from
   * both the registry and the open-rooms set. This is the structural bound on
   * registry size: any room that stops registering — created-and-abandoned,
   * crashed, or evicted without cleanup — disappears within STALE_THRESHOLD of
   * its last touch, instead of living in the single-value `rooms` blob forever.
   * Does not persist; callers persist once after their own writes.
   */
  private sweepStaleRooms(now: number): number {
    let swept = 0
    for (const [roomCode, info] of Object.entries(this.rooms)) {
      if (now - info.updatedAt > STALE_THRESHOLD) {
        delete this.rooms[roomCode]
        this.openRooms.delete(roomCode)
        swept++
      }
    }
    return swept
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
      const now = Date.now()

      // Terminal games are not matchable and only consume space. Treat a
      // game_over registration as an unregister so finished rooms don't linger
      // in the registry (one of the unbounded-growth paths).
      if (status === 'game_over') {
        const wasKnown = roomCode in this.rooms
        delete this.rooms[roomCode]
        this.openRooms.delete(roomCode)
        await this.state.storage.put('rooms', this.rooms)
        logEvent('mm_register', {
          requestId,
          roomCode,
          playerCount,
          status,
          openTransition: wasKnown ? 'closed→closed' : 'no-change',
          openRoomsCount: this.openRooms.size,
        })
        return new Response('OK')
      }

      // Capacity guard: never let the single-value registry grow past the cap.
      // For a brand-new room, try to free space by sweeping stale entries
      // first; if still full, refuse so `put('rooms', …)` can't exceed 2MB.
      const isNewRoom = !(roomCode in this.rooms)
      if (isNewRoom && Object.keys(this.rooms).length >= MAX_TRACKED_ROOMS) {
        this.sweepStaleRooms(now)
        if (Object.keys(this.rooms).length >= MAX_TRACKED_ROOMS) {
          await this.state.storage.put('rooms', this.rooms)
          logEvent('mm_register_rejected_at_capacity', {
            requestId,
            roomCode,
            trackedRooms: Object.keys(this.rooms).length,
            cap: MAX_TRACKED_ROOMS,
          })
          return new Response(JSON.stringify({ code: 'matchmaker_full', message: 'Too many active rooms' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      const wasOpen = this.openRooms.has(roomCode)
      const prev = this.rooms[roomCode]
      const statusChanged = !prev || prev.status !== status
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
      const now = Date.now()

      // Bound the registry: sweep EVERY room whose last update is older than
      // STALE_THRESHOLD, not just the ones in openRooms. Created-but-never-
      // joined rooms (playerCount 0) and any other entry that fell out of
      // openRooms previously lived forever because the loop below only scans
      // openRooms. Sweeping all of this.rooms here makes the registry size
      // O(rooms active in the last 5 minutes). PROGRESS_STALE_THRESHOLD (the
      // phantom-trap prune) is handled per-open-room in the loop below.
      // Persist immediately so the sweep is durable even when /find returns a
      // hit early (the miss path persists too, but hits would otherwise skip it).
      if (this.sweepStaleRooms(now) > 0) {
        await this.state.storage.put('rooms', this.rooms)
      }

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
