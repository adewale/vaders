// web/src/audio-parity.contract.test.ts
//
// Cross-frontend audio parity contract.
//
// **Why this exists**: the `shoot` audio drift is the lesson. The TUI's
// `client/src/hooks/useGameAudio.ts` plays `shoot` on every fire. The
// `WebAudioAdapter` has a synthesis branch for it, but nobody ever called
// `audio.play('shoot', …)` from `web/src/App.tsx`. Result: the web
// frontend was silent when you fired. No existing test caught it —
// because no existing test asserted that the TWO frontends emit the same
// set of sounds for the same user-visible events.
//
// This test does that, by scraping source. It reads:
//
//   - Every `audio.play('<sound>', …)` / `.play('<sound>')` in the TUI's
//     hook (`client/src/hooks/useGameAudio.ts`) — the *authoritative*
//     per-frontend audio list, because the TUI was built first.
//   - The `WebSoundEvent` union declared in `web/src/adapters/
//     WebAudioAdapter.ts` — the set of sounds the web CAN play.
//   - Every `audio.play('<sound>'`, or trigger `.sounds` entry, reachable
//     from `web/src/App.tsx` — the set of sounds the web DOES play.
//
// Asserts:
//   A. Every TUI-played sound has a case in `WebAudioAdapter.play`.
//   B. Every TUI-played sound is actually triggered somewhere in the web
//      frontend (directly in App.tsx, or via detectAudioTriggers in
//      client-core). If neither, it's drift and CI fails.
//
// A failing test is an instruction: either wire the sound up in the web,
// or explicitly add it to `TUI_ONLY_SOUNDS` below with a justification.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// web/src/audio-parity.contract.test.ts → repoRoot is two levels up.
const repoRoot = join(here, '..', '..')

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8')
}

/**
 * Extract every literal sound name passed to `.play('<sound>', …)` in the
 * given source. Covers:
 *   audio.play('shoot')
 *   audio.play('alien_killed', { panX: … })
 *   getAudio().play('menu_navigate')
 * Does NOT match dynamic calls like `audio.play(sound)` — those require
 * upstream enumeration and are handled separately.
 */
function extractPlayedSounds(source: string): Set<string> {
  const out = new Set<string>()
  const re = /\.play\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*[,)]/gi
  let m
  while ((m = re.exec(source)) !== null) out.add(m[1])
  return out
}

/**
 * Extract sound names emitted by the client-core trigger detector.
 * Scans `triggers.ts` for `sounds.push('<sound>')` literals.
 */
function extractTriggerSounds(source: string): Set<string> {
  const out = new Set<string>()
  // `sounds.push('X')` or `sounds.push("X")`
  const re = /\bsounds\.push\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/gi
  let m
  while ((m = re.exec(source)) !== null) out.add(m[1])
  return out
}

/**
 * Extract the `WebSoundEvent` union members. Handles:
 *   export type WebSoundEvent =
 *     | 'shoot'
 *     | 'alien_killed'
 *     | ...
 */
function extractWebSoundEventUnion(source: string): Set<string> {
  const out = new Set<string>()
  const match = source.match(/export\s+type\s+WebSoundEvent\s*=\s*([\s\S]*?)(?=\n\n|\nexport|\n\/\*|\nimport|\nclass)/)
  if (!match) return out
  const body = match[1]
  const re = /['"]([a-z_][a-z0-9_]*)['"]/gi
  let m
  while ((m = re.exec(body)) !== null) out.add(m[1])
  return out
}

// ─── Known intentional divergences ──────────────────────────────────────────
//
// A sound listed here is in the TUI but intentionally NOT on the web (or
// vice versa). Each entry needs a one-line reason so the test failure
// message points to *why* the divergence is legal.

const TUI_ONLY_SOUNDS: Record<string, string> = {
  // No current intentional gaps. If the TUI adds a sound that genuinely
  // doesn't make sense on web (e.g. terminal-bell-specific), record it here.
}

describe('cross-frontend audio parity', () => {
  const tuiHook = read('client/src/hooks/useGameAudio.ts')
  const tuiSounds = extractPlayedSounds(tuiHook)

  const webAdapter = read('web/src/adapters/WebAudioAdapter.ts')
  const webSoundEvents = extractWebSoundEventUnion(webAdapter)
  const webAdapterPlays = extractPlayedSounds(webAdapter) // internal `.play()` inside adapter

  const webApp = read('web/src/App.tsx')
  const webAppPlays = extractPlayedSounds(webApp)

  const triggers = read('client-core/src/audio/triggers.ts')
  const triggerSounds = extractTriggerSounds(triggers)

  /** Effective set of sounds the web actually plays, via any path. */
  const webReachable = new Set<string>([
    ...webAdapterPlays,
    ...webAppPlays,
    ...triggerSounds, // reachable because App.tsx iterates triggers.sounds
  ])

  it('baseline sanity: each extractor finds at least something', () => {
    // If the extractor regex breaks, every downstream assertion will
    // falsely pass. Pin non-emptiness so a broken regex fails loud.
    expect(tuiSounds.size).toBeGreaterThan(0)
    expect(webSoundEvents.size).toBeGreaterThan(0)
    expect(triggerSounds.size).toBeGreaterThan(0)
  })

  it('Contract A — every TUI-played sound has a case in WebAudioAdapter.play', () => {
    // WebAudioAdapter.play branches on a string that is either
    // `WebSoundEvent` union OR a raw string. The union IS the declared
    // contract; anything played by the TUI that's missing from the union
    // is unambiguous drift.
    const missing = [...tuiSounds].filter(
      (s) => !webSoundEvents.has(s) && !(s in TUI_ONLY_SOUNDS),
    )
    expect(missing).toEqual([])
  })

  it('Contract B — every TUI-played sound is actually triggered by the web frontend', () => {
    // This is the lesson from the `shoot` drift: the sound existed in
    // WebAudioAdapter but nobody called .play('shoot') from the web
    // input-handling layer. Assert that every TUI sound is reachable via
    // at least one of: App.tsx direct call, detectAudioTriggers emission,
    // or the adapter's own internal scheduling (music, countdown).
    const unreachable = [...tuiSounds].filter(
      (s) => !webReachable.has(s) && !(s in TUI_ONLY_SOUNDS),
    )
    expect(unreachable).toEqual([])
  })

  it('TUI_ONLY_SOUNDS allowlist entries actually exist in the TUI', () => {
    // Guard against stale allowlist entries. If a "TUI-only" sound was
    // removed from the TUI, the entry here is dead weight — fail so
    // we clean it up.
    for (const [sound, _reason] of Object.entries(TUI_ONLY_SOUNDS)) {
      expect(tuiSounds).toContain(sound)
    }
  })
})
