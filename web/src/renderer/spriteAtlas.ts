// web/src/renderer/spriteAtlas.ts
// Pre-renders pixel-art sprites into cached canvases with highlight + shadow
// shading and a soft outer glow. Rendering uses drawImage() instead of per-pixel
// fillRects, which is much cheaper per frame.

import { PIXEL_ART, SPRITE_SIZE } from '../../../client-core/src/sprites/bitmaps'
import { CELL_W, CELL_H } from './canvasRenderer'

type AtlasSpriteType = 'squid' | 'crab' | 'octopus' | 'ufo' | 'player'
type Frame = 'a' | 'b'

/** Canvas-like image we can draw into and later drawImage() from. */
type AtlasCanvas = OffscreenCanvas | HTMLCanvasElement

const MAX_CACHE = 24
const cache = new Map<string, AtlasCanvas>()

/** Public test helpers (prefixed with _ to discourage production use). */
export function _clearAtlasCacheForTests(): void {
  cache.clear()
}

export function _getAtlasCacheSizeForTests(): number {
  return cache.size
}

function cacheKey(type: AtlasSpriteType, frame: Frame, bright: string, dark: string): string {
  return `${type}|${frame}|${bright}|${dark}`
}

/**
 * Retrieve the pre-rendered sprite image. Returns null only if the environment
 * cannot create a canvas (extremely unlikely; both jsdom and browsers support
 * HTMLCanvasElement creation).
 */
export function getSpriteImage(
  type: AtlasSpriteType,
  frame: Frame,
  brightColor: string,
  darkColor: string,
): AtlasCanvas | null {
  const key = cacheKey(type, frame, brightColor, darkColor)
  const hit = cache.get(key)
  if (hit) {
    // LRU touch — reinsert to mark most recent
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const img = renderAtlas(type, frame, brightColor, darkColor)
  if (!img) return null
  cache.set(key, img)
  // Evict oldest if over capacity
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return img
}

function spriteDims(type: AtlasSpriteType): { w: number; h: number; pixelsA: number[][]; pixelsB: number[][] } {
  if (type === 'player') {
    const pixels = PIXEL_ART.player as unknown as number[][]
    return {
      w: SPRITE_SIZE.player.width * CELL_W,
      h: SPRITE_SIZE.player.height * CELL_H,
      pixelsA: pixels,
      pixelsB: pixels,
    }
  }
  if (type === 'ufo') {
    return {
      w: SPRITE_SIZE.ufo.width * CELL_W,
      h: SPRITE_SIZE.ufo.height * CELL_H,
      pixelsA: PIXEL_ART.ufo.a as unknown as number[][],
      pixelsB: PIXEL_ART.ufo.b as unknown as number[][],
    }
  }
  const art = PIXEL_ART[type]
  return {
    w: SPRITE_SIZE.alien.width * CELL_W,
    h: SPRITE_SIZE.alien.height * CELL_H,
    pixelsA: art.a as unknown as number[][],
    pixelsB: art.b as unknown as number[][],
  }
}

/** Make an offscreen-capable canvas (OffscreenCanvas in browsers, HTMLCanvasElement fallback). */
function makeCanvas(w: number, h: number): AtlasCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h)
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  return null
}

function renderAtlas(type: AtlasSpriteType, frame: Frame, brightColor: string, darkColor: string): AtlasCanvas | null {
  const dims = spriteDims(type)
  const canvas = makeCanvas(dims.w, dims.h)
  if (!canvas) return null

  const ctx = (
    canvas as unknown as {
      getContext: (id: '2d') => CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    }
  ).getContext('2d')
  if (!ctx) {
    // Environment without 2D rendering (e.g. jsdom default). Return the sized
    // canvas anyway — callers that drawImage() will just draw an empty image,
    // but dimensions + object identity (for caching) are still valid.
    return canvas
  }

  const pixels = frame === 'a' ? dims.pixelsA : dims.pixelsB
  const rows = pixels.length
  if (rows === 0) return canvas
  const cols = pixels[0].length
  const cellW = dims.w / cols
  const cellH = dims.h / rows

  // Soft outer glow via shadowBlur
  try {
    ;(ctx as CanvasRenderingContext2D).shadowBlur = 6
    ;(ctx as CanvasRenderingContext2D).shadowColor = brightColor
  } catch {
    // ignore if unsupported
  }

  // Top half bright, bottom half dark (matches existing gradient shading)
  for (let row = 0; row < rows; row++) {
    const isTop = row < rows / 2
    const baseColor = isTop ? brightColor : darkColor
    ;(ctx as CanvasRenderingContext2D).fillStyle = baseColor
    for (let col = 0; col < cols; col++) {
      if (!pixels[row][col]) continue
      const px = col * cellW
      const py = row * cellH
      ;(ctx as CanvasRenderingContext2D).fillRect(px, py, cellW, cellH)
    }
  }

  // Turn off shadow before drawing highlight/shadow per-pixel (avoid doubling glow)
  try {
    ;(ctx as CanvasRenderingContext2D).shadowBlur = 0
  } catch {
    /* ignore */
  }

  // Per-cell highlight (top-left) and shadow (bottom-right)
  const highlight = scaleHex(brightColor, 1.3)
  const shadow = scaleHex(darkColor, 0.7)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!pixels[row][col]) continue
      const px = col * cellW
      const py = row * cellH
      ;(ctx as CanvasRenderingContext2D).fillStyle = highlight
      ;(ctx as CanvasRenderingContext2D).fillRect(px, py, Math.max(1, cellW * 0.25), Math.max(1, cellH * 0.25))
      ;(ctx as CanvasRenderingContext2D).fillStyle = shadow
      ;(ctx as CanvasRenderingContext2D).fillRect(
        px + cellW - Math.max(1, cellW * 0.25),
        py + cellH - Math.max(1, cellH * 0.25),
        Math.max(1, cellW * 0.25),
        Math.max(1, cellH * 0.25),
      )
    }
  }

  return canvas
}

function scaleHex(hex: string, factor: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const r = clamp(Number.parseInt(h.slice(0, 2), 16) * factor)
  const g = clamp(Number.parseInt(h.slice(2, 4), 16) * factor)
  const b = clamp(Number.parseInt(h.slice(4, 6), 16) * factor)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
