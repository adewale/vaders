// web/src/keyboard-parity.contract.test.ts
//
// Cross-surface keyboard parity contract.
//
// **Why this exists**: the project has two loosely-coupled "surfaces" that
// describe which keys do what:
//
//   1. Documentation surfaces — `ControlsCheatsheet` SECTIONS, each screen's
//      `HintsBar` literal `hints={[…]}` arrays, and the README Controls
//      table.
//   2. Handler surfaces — `WebInputAdapter.KEY_MAP` (raw browser keys →
//      abstract VadersKey actions), plus per-screen `handleKeyDown`
//      functions that inspect raw `e.key` directly (`LaunchScreen`,
//      `GameOverScreen`, `ControlsCheatsheet`).
//
// App.tsx dispatches on the MAPPED VadersKey (e.g. `if (key === 'shoot')`)
// rather than the raw browser key — the raw-key vocabulary is owned by
// KEY_MAP + the per-screen direct handlers. So "is this raw key handled?"
// reduces to "is it in KEY_MAP OR does a screen handler inspect it?".
//
// Drift in this repo has historically come from docs and handlers falling
// out of alignment: a key gets renamed in KEY_MAP but the README still
// lists the old binding; a hint in the GAME HintsBar references a key the
// GAME screen never plumbs. No per-file unit test notices because the
// mismatch lives across files. This contract test scrapes both sides and
// fails fast on asymmetry.
//
// If a contract fails, either (a) fix the doc / handler drift, or (b)
// add the key to one of the in-file allowlists with a written reason.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8')
}

// ─── Normalisation ──────────────────────────────────────────────────────────
//
// Doc surfaces render human-friendly labels (`← →`, `SPACE`, `R / ENTER`),
// whereas handler surfaces deal in KeyboardEvent.key values (`ArrowLeft`,
// ` `, `r`, `Enter`). `canonicalise` maps both sides onto the same vocabulary
// so the sets can be intersected.

/** Map one label token onto the canonical key name. */
function canonicaliseToken(raw: string): string[] {
  // Handle raw " " (literal space character from KEY_MAP) BEFORE trim —
  // otherwise .trim() eats it and canonicalisation silently drops SPACE.
  if (raw === ' ') return ['SPACE']
  const t = raw.trim().toUpperCase()
  if (!t) return []
  // Arrow glyphs / words.
  if (t === '←' || t === 'LEFT' || t === 'ARROWLEFT') return ['ARROWLEFT']
  if (t === '→' || t === 'RIGHT' || t === 'ARROWRIGHT') return ['ARROWRIGHT']
  if (t === '↑' || t === 'UP' || t === 'ARROWUP') return ['ARROWUP']
  if (t === '↓' || t === 'DOWN' || t === 'ARROWDOWN') return ['ARROWDOWN']
  // Whitespace-separated glyph runs: `← →` → LEFT+RIGHT, `↑ ↓` → UP+DOWN.
  // Split on any whitespace run and recurse.
  if (/\s/.test(t)) {
    return t.split(/\s+/).flatMap(canonicaliseToken)
  }
  if (t === 'SPACE' || t === ' ') return ['SPACE']
  if (t === 'ENTER' || t === 'RETURN') return ['ENTER']
  if (t === 'ESC' || t === 'ESCAPE') return ['ESCAPE']
  if (t === 'BACKSPACE') return ['BACKSPACE']
  if (t === 'TAB') return ['TAB']
  // Ranges like "1-4": expand to individual digits.
  const rangeMatch = t.match(/^(\d)-(\d)$/)
  if (rangeMatch) {
    const out: string[] = []
    for (let d = Number(rangeMatch[1]); d <= Number(rangeMatch[2]); d++) {
      out.push(String(d))
    }
    return out
  }
  // Single printable character.
  if (t.length === 1) return [t]
  return [t]
}

/** Split a label like "R / ENTER" or "ESC / Q" into individual tokens,
 *  then canonicalise each. Returns flat array of canonical keys. */
function canonicaliseLabel(label: string): string[] {
  return label.split(/\s*(?:\/|,|\||\s+OR\s+)\s*/i).flatMap(canonicaliseToken)
}

function canonicaliseAll(raw: string[]): Set<string> {
  const out = new Set<string>()
  for (const r of raw) for (const c of canonicaliseLabel(r)) out.add(c)
  return out
}

// ─── Doc-surface scraping ───────────────────────────────────────────────────

/** Extract sections from ControlsCheatsheet: title → array of raw labels. */
function scrapeControlsCheatsheet(src: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const sectionRe = /title:\s*'([^']+)'\s*,\s*rows:\s*\[([\s\S]*?)\]\s*,?\s*\}/g
  let sm: RegExpExecArray | null
  while ((sm = sectionRe.exec(src)) !== null) {
    const title = sm[1]
    const body = sm[2]
    const tupleRe = /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g
    const keys: string[] = []
    let tm: RegExpExecArray | null
    while ((tm = tupleRe.exec(body)) !== null) keys.push(tm[1])
    result.set(title, keys)
  }
  return result
}

/** Extract labels from any `[KEY, DESC]` tuples in a HintsBar-carrying file. */
function scrapeHintsTuples(src: string): string[] {
  const out: string[] = []
  const re = /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

/** README Controls table — every left-column cell. */
function scrapeReadmeControls(src: string): string[] {
  const out: string[] = []
  const sec = src.split(/^##\s+Controls\s*$/m)[1]
  if (!sec) return out
  const sectionBody = sec.split(/^##\s/m)[0]
  const rowRe = /^\|\s*([^|]+?)\s*\|\s*[^|]+?\s*\|\s*[^|]+?\s*\|$/gm
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(sectionBody)) !== null) {
    const cell = rm[1].trim()
    if (!cell || /^-+$/.test(cell) || cell.toLowerCase() === 'key') continue
    out.push(cell)
  }
  return out
}

// ─── Handler-surface scraping ───────────────────────────────────────────────

/** Extract raw browser keys (the KEYS of KEY_MAP) from WebInputAdapter.ts. */
function scrapeKeyMap(src: string): string[] {
  const out: string[] = []
  const match = src.match(/const\s+KEY_MAP\s*:\s*Record[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!match) return out
  const body = match[1]
  // Line shape: either `ArrowLeft: 'left',` (bare identifier) or
  // `' ': 'shoot',` / `'1': '1',` (quoted key).
  const re = /^\s*(?:'([^']+)'|([A-Za-z0-9_]+))\s*:\s*'[^']+'/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    out.push(m[1] ?? m[2])
  }
  return out
}

/** Scrape literal `e.key === '…'` / `key === '…'` comparisons. */
function scrapeKeyEquals(src: string): string[] {
  const out: string[] = []
  const re = /(?:\.|^|\s)key\s*===\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

/** Scrape switch `case 'X':` literals. */
function scrapeCaseLiterals(src: string): string[] {
  const out: string[] = []
  const re = /\bcase\s+'([^']+)'\s*:/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

/** Scrape values compared against a lowercased key, e.g.
 *  `lowered === 'm'` — captures post-normalisation key handling. */
function scrapeLoweredEquals(src: string): string[] {
  const out: string[] = []
  const re = /\blowered\s*===\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

// ─── Known intentional divergences ──────────────────────────────────────────
//
// Every entry has a one-line reason so a future failure message points at
// "why this is legal", not just "it's legal".

/** Doc labels that intentionally have no one-to-one raw-key handler. */
const KNOWN_DOC_ONLY_KEYS: Record<string, string> = {
  // (No current known cases. If a doc label has no corresponding raw-key
  // handler and is deliberately a higher-level label, document it here.)
}

/** Raw handler keys that intentionally don't appear in any doc. */
const KNOWN_HANDLER_ONLY_KEYS: Record<string, string> = {
  // ArrowUp/ArrowDown are aliased to left/right in KEY_MAP — a muscle-memory
  // escape hatch for shooters that use up/down as strafes. Docs only use
  // ↑ ↓ for MENU navigation (which LaunchScreen handles directly), so the
  // alias is deliberately undocumented to avoid confusing new players.
  ARROWUP: 'KEY_MAP alias: up behaves as left; undocumented on purpose',
  ARROWDOWN: 'KEY_MAP alias: down behaves as right; undocumented on purpose',
  // Backspace edits the room-code input in LaunchScreen — a text-field
  // implementation detail rather than a game control.
  BACKSPACE: 'room-code input editing; not a game control',
  // `R`/`r` (single literal) — the GameOverScreen handler checks both
  // lowercase and uppercase; docs expose it as "R / ENTER".
  // (Handled correctly via canonicalisation — no allowlist needed.)
}

describe('cross-surface keyboard parity', () => {
  // ── Documentation surfaces ──
  const cheatsheetSrc = read('web/src/components/ControlsCheatsheet.tsx')
  const cheatSections = scrapeControlsCheatsheet(cheatsheetSrc)
  const cheatAllKeys: string[] = []
  for (const keys of cheatSections.values()) cheatAllKeys.push(...keys)

  const lobbySrc = read('web/src/components/LobbyScreen.tsx')
  const gameSrc = read('web/src/components/GameScreen.tsx')
  const gameOverSrc = read('web/src/components/GameOverScreen.tsx')
  const hintsKeys = [...scrapeHintsTuples(lobbySrc), ...scrapeHintsTuples(gameSrc), ...scrapeHintsTuples(gameOverSrc)]

  const readmeSrc = read('README.md')
  const readmeKeys = scrapeReadmeControls(readmeSrc)

  const docKeys = canonicaliseAll([...cheatAllKeys, ...hintsKeys, ...readmeKeys])

  // ── Handler surfaces (raw browser keys only) ──
  const adapterSrc = read('web/src/adapters/WebInputAdapter.ts')
  const keyMap = scrapeKeyMap(adapterSrc)

  const launchSrc = read('web/src/components/LaunchScreen.tsx')
  const launchKeyEquals = scrapeKeyEquals(launchSrc)
  const launchCases = scrapeCaseLiterals(launchSrc)
  const launchLowered = scrapeLoweredEquals(launchSrc)

  const gameOverKeyEquals = scrapeKeyEquals(gameOverSrc)

  const cheatsheetKeyEquals = scrapeKeyEquals(cheatsheetSrc)

  // IMPORTANT: App.tsx dispatches on mapped VadersKey (`key === 'shoot'`),
  // NOT raw browser keys — so we do NOT scrape it. The raw-key vocabulary
  // lives in KEY_MAP + per-screen direct handlers.
  const rawHandlerKeys = canonicaliseAll([
    ...keyMap,
    ...launchKeyEquals,
    ...launchCases,
    ...launchLowered,
    ...gameOverKeyEquals,
    ...cheatsheetKeyEquals,
  ])

  it('baseline sanity: each scraper finds at least something', () => {
    // If a regex breaks, downstream assertions falsely pass.
    expect(cheatSections.size).toBeGreaterThan(0)
    expect(cheatAllKeys.length).toBeGreaterThan(0)
    expect(hintsKeys.length).toBeGreaterThan(0)
    expect(readmeKeys.length).toBeGreaterThan(0)
    expect(keyMap.length).toBeGreaterThan(0)
    expect(launchCases.length).toBeGreaterThan(0)
    expect(docKeys.size).toBeGreaterThan(0)
    expect(rawHandlerKeys.size).toBeGreaterThan(0)
  })

  it('Contract A — every documented key resolves to a handler somewhere', () => {
    // For each canonical key mentioned in any doc surface, assert a
    // raw-key handler exists OR the key is allowlisted.
    const missing = [...docKeys].filter((k) => !rawHandlerKeys.has(k) && !(k in KNOWN_DOC_ONLY_KEYS))
    expect(missing).toEqual([])
  })

  it('Contract B — every KEY_MAP raw key appears in at least one doc surface', () => {
    // Enforce from the KEY_MAP side specifically (not every handler), because
    // KEY_MAP is the canonical routing table. Adding a KEY_MAP entry without
    // updating docs is the most common drift pattern.
    const keyMapCanonical = canonicaliseAll(keyMap)
    const missing = [...keyMapCanonical].filter((k) => !docKeys.has(k) && !(k in KNOWN_HANDLER_ONLY_KEYS))
    expect(missing).toEqual([])
  })

  // ─── Contract C — context claims match ──────────────────────────────────
  //
  // ControlsCheatsheet advertises keys under specific section titles (MENU,
  // LOBBY, GAME, GAME OVER, AUDIO, HELP). For each claim, either:
  //   - the corresponding screen's handler mentions that key, OR
  //   - KEY_MAP contains that key, so the global App.tsx adapter routes it
  //     through to per-screen logic.
  //
  // This is an approximation — we're not tracing every branch — but it
  // catches the common drift class of "GAME section adds X but no screen
  // actually plumbs it".

  /** Map section titles to the handler sources permitted to satisfy claims. */
  const SECTION_HANDLERS: Record<string, string[]> = {
    MENU: [launchSrc],
    LOBBY: [], // LobbyScreen delegates everything to KEY_MAP → App.tsx.
    GAME: [], // GameScreen same.
    'GAME OVER': [gameOverSrc],
    AUDIO: [launchSrc], // launch has its own; post-launch routes through KEY_MAP.
    HELP: [cheatsheetSrc],
  }

  it('Contract C — ControlsCheatsheet section keys are handled by the matching screen or KEY_MAP', () => {
    const failures: string[] = []
    const keyMapCanonical = canonicaliseAll(keyMap)

    for (const [section, rawLabels] of cheatSections) {
      const handlerSrcs = SECTION_HANDLERS[section]
      if (handlerSrcs === undefined) {
        failures.push(`Section ${JSON.stringify(section)} has no SECTION_HANDLERS mapping`)
        continue
      }
      // Canonicalise every key literal in the owning screen sources.
      const sectionHandlerKeys = canonicaliseAll(
        handlerSrcs.flatMap((s) => [...scrapeKeyEquals(s), ...scrapeCaseLiterals(s), ...scrapeLoweredEquals(s)]),
      )
      for (const rawLabel of rawLabels) {
        const canonical = canonicaliseLabel(rawLabel)
        for (const key of canonical) {
          if (key in KNOWN_DOC_ONLY_KEYS) continue
          if (sectionHandlerKeys.has(key) || keyMapCanonical.has(key)) continue
          failures.push(
            `Section ${section} advertises "${rawLabel}" (→ ${key}) but no handler found in ${handlerSrcs.length} section file(s) and not in KEY_MAP`,
          )
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('allowlist entries actually exist somewhere — no stale entries', () => {
    // A stale allowlist entry rots silently after real drift is fixed. Fail
    // so it gets cleaned up.
    for (const key of Object.keys(KNOWN_DOC_ONLY_KEYS)) {
      expect(docKeys.has(key)).toBe(true)
    }
    for (const key of Object.keys(KNOWN_HANDLER_ONLY_KEYS)) {
      expect(rawHandlerKeys.has(key)).toBe(true)
    }
  })
})
