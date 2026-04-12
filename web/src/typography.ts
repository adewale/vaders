// web/src/typography.ts
// Semantic typography tokens. Mirrors the CSS custom props in index.html so that
// canvas rendering (which takes string font specs) uses the same families.
//
// Font choices connect to the TUI heritage:
//   - Press Start 2P: iconic arcade pixel font — pairs with the braille pixel
//     sprites the TUI renders. Signals "Space Invaders 1978."
//   - VT323: DEC VT320 terminal font — literal ancestor of the TUI runtime.
//     Thin, authentic scanline-era body text.

export const FONT_DISPLAY = "'Press Start 2P', 'Courier New', monospace"
export const FONT_BODY = "'VT323', 'Courier New', monospace"
export const FONT_HUD = "'VT323', 'Courier New', monospace"

/** Build a canvas `ctx.font` string from a size in px and a family token. */
export function canvasFont(sizePx: number, family: string = FONT_HUD): string {
  return `${sizePx}px ${family}`
}

/** Build a canvas `ctx.font` string with bold weight. */
export function canvasFontBold(sizePx: number, family: string = FONT_HUD): string {
  return `bold ${sizePx}px ${family}`
}

/**
 * Wait for fonts to be loaded before starting canvas rendering. Canvas doesn't
 * fall back or re-paint when a font arrives late, so we gate initial paint on
 * `document.fonts.ready`. Safe to call multiple times (idempotent).
 */
export async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await document.fonts.ready
  } catch {
    // Fonts API unavailable — fall back to Courier silently
  }
}
