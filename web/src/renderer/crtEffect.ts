// web/src/renderer/crtEffect.ts
// CRT post-processing: horizontal scanlines + subtle bloom.
// Applied after all other draw commands to give the rendered frame a CRT feel.
//
// Scanline intensity "breathes" over time — a slow sin(tick * 0.01) modulation
// varies the per-line alpha between ~0.10 and ~0.20 so the CRT feels alive.

let crtEnabled = true

export function setCRTEnabled(enabled: boolean): void {
  crtEnabled = enabled
}

export function isCRTEnabled(): boolean {
  return crtEnabled
}

/**
 * Compute the current scanline alpha for the given tick.
 * Returns a value in ~[0.10, 0.20] following a slow sine wave.
 * Exposed for tests and exploratory tooling.
 */
export function getScanlineAlpha(tick: number): number {
  const base = 0.15
  const amp = 0.05
  return base + Math.sin(tick * 0.01) * amp
}

/**
 * Draw CRT scanlines and a subtle bloom overlay.
 * Scanlines: every 2nd row painted with a breathing-alpha dark overlay.
 * Bloom: a blurred copy of the canvas drawn back on top at reduced alpha.
 *
 * @param tick Optional game tick used to modulate scanline intensity. When
 *             omitted, a constant mid-intensity is used (matches legacy look
 *             for tests that call the function without a tick).
 */
export function applyCRTEffect(ctx: CanvasRenderingContext2D, width: number, height: number, tick?: number): void {
  if (!crtEnabled) return

  // --- Bloom: blur a copy of the canvas and composite it back on top ---
  // Guard against environments without drawImage (most canvas contexts have it,
  // but we still ensure correctness).
  const canvas = (ctx as unknown as { canvas?: HTMLCanvasElement }).canvas
  if (canvas && typeof ctx.drawImage === 'function' && typeof ctx.save === 'function') {
    try {
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.filter = 'blur(4px)'
      ctx.drawImage(canvas as CanvasImageSource, 0, 0)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.restore()
    } catch {
      // Some environments (jsdom) don't fully support drawImage from the same
      // canvas — fall through to scanlines only.
    }
  }

  // --- Scanlines: paint every 2nd row with a breathing-alpha overlay ---
  const alpha = tick !== undefined ? getScanlineAlpha(tick) : 0.15
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`
  for (let y = 0; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1)
  }
}
