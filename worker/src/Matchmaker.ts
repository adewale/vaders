// worker/src/Matchmaker.ts
// Matchmaker Durable Object - in-memory room registry.
//
// Exposes typed RPC methods (register / unregister / find / getRoomInfo) as the
// primary API — callers (the Worker entry and each GameRoom) invoke these
// directly on the stub, with no manual HTTP routing or JSON parsing. A thin
// `fetch` adapter is retained only so the existing unit tests and PBT harnesses
// can drive the same logic over a Request; production never uses it.

import { DurableObject } from 'cloudflare:workers'
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
 * whole-blob rewrite on every register. That needs a storage-backend
 * migration; the cap + sweep is the correct bounded fix until then.
 * See docs/TODO.md "Matchmaker scaling".
 */
export const MAX_TRACKED_ROOMS = 500

/** Correlation context threaded from the caller for wide-event logging. */
export interface MatchmakerLogContext {
  requestId?: string
  region?: string
}

/** Result of a register attempt — `matchmaker_full` when the cap is hit. */
export type RegisterResult = { ok: true } | { ok: false; code: 'matchmaker_full' }

function getRequestId(request?: Request): string | undefined {
  return request?.headers.get(REQUEST_ID_HEADER) ?? undefined
}

// lastStatusChangeAt is the timestamp of the most recent status
// transition (waiting → countdown, waiting → playing, etc.). Unlike
// updatedAt — which refreshes on every register, including pure
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

export class Matchmaker extends DurableObject {
  private rooms: Record<string, RoomInfo> = {}
  private openRooms: Set<string> = new Set()

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never)
    // Restore from storage on cold start
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<Record<string, RoomInfo>>('rooms')
      let totalRooms = 0
      let openRooms = 0
      if (stored) {
        this.rooms = stored
        // Rebuild openRooms set. Require playerCount > 0 so stranded
        // empty rooms (creator abandoned, room never unregistered)
        // don't become matchmaking targets and trap later joiners.
        for (const [roomCode, info] of Object.entries(stored)) {
          totalRooms++
          // Backfill lastStatusChangeAt on old persisted records — use
          // updatedAt as a conservative proxy so legacy entries aren't aged
          // out immediately.
          if (typeof info.lastStatusChangeAt !== 'number') {
            info.lastStatusChangeAt = info.updatedAt ?? Date.now()
          }
          if (info.status === 'waiting' && info.playerCount > 0 && info.playerCount < 4) {
            this.openRooms.add(roomCode)
            openRooms++
          }
        }
      }
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

  // ─── RPC methods (primary API) ────────────────────────────────────────────

  /** Register or update a room. Returns `matchmaker_full` if the cap is hit. */
  async register(
    roomCode: string,
    playerCount: number,
    status: string,
    log: MatchmakerLogContext = {},
  ): Promise<RegisterResult> {
    const { requestId, region } = log
    const now = Date.now()

    // Terminal games are not matchable and only consume space. Treat a
    // game_over registration as an unregister so finished rooms don't linger
    // in the registry (one of the unbounded-growth paths).
    if (status === 'game_over') {
      const wasKnown = roomCode in this.rooms
      delete this.rooms[roomCode]
      this.openRooms.delete(roomCode)
      await this.ctx.storage.put('rooms', this.rooms)
      logEvent('mm_register', {
        requestId,
        region,
        roomCode,
        playerCount,
        status,
        openTransition: wasKnown ? 'closed→closed' : 'no-change',
        openRoomsCount: this.openRooms.size,
      })
      return { ok: true }
    }

    // Capacity guard: never let the single-value registry grow past the cap.
    // For a brand-new room, try to free space by sweeping stale entries first;
    // if still full, refuse so `put('rooms', …)` can't exceed the 128 KiB limit.
    const isNewRoom = !(roomCode in this.rooms)
    if (isNewRoom && Object.keys(this.rooms).length >= MAX_TRACKED_ROOMS) {
      this.sweepStaleRooms(now)
      if (Object.keys(this.rooms).length >= MAX_TRACKED_ROOMS) {
        await this.ctx.storage.put('rooms', this.rooms)
        logEvent('mm_register_rejected_at_capacity', {
          requestId,
          region,
          roomCode,
          trackedRooms: Object.keys(this.rooms).length,
          cap: MAX_TRACKED_ROOMS,
        })
        return { ok: false, code: 'matchmaker_full' }
      }
    }

    const wasOpen = this.openRooms.has(roomCode)
    const prev = this.rooms[roomCode]
    const statusChanged = !prev || prev.status !== status
    this.rooms[roomCode] = {
      playerCount,
      status,
      updatedAt: now,
      // Refresh only on status transitions (Option C). Plain playerCount churn
      // — the signature of phantom-trapped rooms where new victims join/leave
      // without ever readying — must NOT refresh this, or the progress-stale
      // prune can't fire.
      lastStatusChangeAt: statusChanged ? now : prev.lastStatusChangeAt,
    }

    // Require playerCount > 0 to avoid returning empty rooms from find() — a
    // creator who abandons before anyone joins would otherwise strand the next
    // matchmaker alone for the full STALE_THRESHOLD.
    const nowOpen = status === 'waiting' && playerCount > 0 && playerCount < 4
    if (nowOpen) {
      this.openRooms.add(roomCode)
    } else {
      this.openRooms.delete(roomCode)
    }

    await this.ctx.storage.put('rooms', this.rooms)
    logEvent('mm_register', {
      requestId,
      region,
      roomCode,
      playerCount,
      status,
      openTransition: wasOpen === nowOpen ? 'no-change' : wasOpen ? 'opened→closed' : 'closed→opened',
      openRoomsCount: this.openRooms.size,
    })
    return { ok: true }
  }

  /** Remove a room from the registry. */
  async unregister(roomCode: string, log: MatchmakerLogContext = {}): Promise<void> {
    const wasKnown = roomCode in this.rooms
    delete this.rooms[roomCode]
    this.openRooms.delete(roomCode)
    await this.ctx.storage.put('rooms', this.rooms)
    logEvent('mm_unregister', {
      requestId: log.requestId,
      region: log.region,
      roomCode,
      wasKnown,
      openRoomsCount: this.openRooms.size,
    })
  }

  /** Find an open room to join, or null if none. Sweeps stale entries first. */
  async find(log: MatchmakerLogContext = {}): Promise<string | null> {
    const { requestId, region } = log
    const now = Date.now()

    // Bound the registry: sweep EVERY room whose last update is older than
    // STALE_THRESHOLD, not just the ones in openRooms. Created-but-never-joined
    // rooms (playerCount 0) and any other entry that fell out of openRooms
    // previously lived forever because the loop below only scans openRooms.
    // Sweeping all of this.rooms here makes the registry size O(rooms active in
    // the last 5 minutes). Persist immediately so the sweep is durable even
    // when find() returns a hit early.
    if (this.sweepStaleRooms(now) > 0) {
      await this.ctx.storage.put('rooms', this.rooms)
    }

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
      // Progress-stale: the room IS active (updatedAt recent) but hasn't made
      // any status progress for >10 min. Phantom-trapped rooms look exactly
      // like this. Prune the registry entry so matchmakers stop sending victims.
      if (info.status === 'waiting' && now - info.lastStatusChangeAt > PROGRESS_STALE_THRESHOLD) {
        logEvent('mm_prune_stale_by_progress', {
          requestId,
          region,
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
      // Read-through guard — defends against openRooms drifting out of sync.
      if (info.status !== 'waiting' || info.playerCount <= 0 || info.playerCount >= 4) {
        this.openRooms.delete(roomCode)
        prunedFiltered++
        continue
      }
      logEvent('mm_find_result', {
        requestId,
        region,
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
      return roomCode
    }

    await this.ctx.storage.put('rooms', this.rooms)
    logEvent('mm_find_result', {
      requestId,
      region,
      result: 'miss',
      roomCode: null,
      openRoomsScanned: scanned,
      prunedMissing,
      prunedStale,
      prunedProgressStale,
      prunedFiltered,
      openRoomsRemaining: this.openRooms.size,
    })
    return null
  }

  /** Look up a single room's registry entry, or null if unknown. */
  async getRoomInfo(roomCode: string): Promise<({ roomCode: string } & RoomInfo) | null> {
    const info = this.rooms[roomCode]
    if (!info) return null
    return { roomCode, ...info }
  }

  // ─── fetch adapter (test/harness compatibility only) ──────────────────────
  // Thin shim delegating to the RPC methods above so existing tests that drive
  // the Matchmaker over a Request keep working. Production code uses RPC.

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const log: MatchmakerLogContext = { requestId: getRequestId(request) }
    const json = { 'Content-Type': 'application/json' }

    if (url.pathname === '/register' && request.method === 'POST') {
      const { roomCode, playerCount, status } = (await request.json()) as {
        roomCode: string
        playerCount: number
        status: string
      }
      const result = await this.register(roomCode, playerCount, status, log)
      if (!result.ok) {
        return new Response(JSON.stringify({ code: result.code, message: 'Too many active rooms' }), {
          status: 503,
          headers: json,
        })
      }
      return new Response('OK')
    }

    if (url.pathname === '/unregister' && request.method === 'POST') {
      const { roomCode } = (await request.json()) as { roomCode: string }
      await this.unregister(roomCode, log)
      return new Response('OK')
    }

    if (url.pathname === '/find') {
      const roomCode = await this.find(log)
      return new Response(JSON.stringify({ roomCode }), { headers: json })
    }

    const infoMatch = url.pathname.match(/^\/info\/([A-Z0-9]{6})$/)
    if (infoMatch) {
      const info = await this.getRoomInfo(infoMatch[1])
      if (!info) return new Response('Not found', { status: 404 })
      return new Response(JSON.stringify(info), { headers: json })
    }

    return new Response('Not found', { status: 404 })
  }
}
