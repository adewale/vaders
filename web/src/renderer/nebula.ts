// web/src/renderer/nebula.ts
// Procedural parallax nebula background. Six radial-gradient clouds drift
// across the screen at different speeds and compositing modes, wrapping at
// edges for infinite scroll. Half use 'lighter' (glow), half use 'screen'
// (softer mix) — creating a richer, more ethereal look.

export interface NebulaDrawCall {
  x: number
  y: number
  image: CanvasImageSource
  alpha: number
  /** Canvas global composite operation for this cloud. */
  compositeOp: 'lighter' | 'screen'
}

type CloudImage = OffscreenCanvas | HTMLCanvasElement

interface Cloud {
  image: CloudImage
  y: number
  speed: number
  /** Initial x offset so clouds don't all start overlapping. */
  initialX: number
  alpha: number
  width: number
  compositeOp: 'lighter' | 'screen'
}

/** Purple / teal / magenta nebula palette with outer transparent falloff. */
const CLOUD_COLORS: Array<[string, string]> = [
  ['rgba(120, 40, 180, ALPHA)', 'rgba(120, 40, 180, 0)'], // purple
  ['rgba(40, 180, 160, ALPHA)', 'rgba(40, 180, 160, 0)'], // teal
  ['rgba(200, 60, 160, ALPHA)', 'rgba(200, 60, 160, 0)'], // magenta
  ['rgba(80, 60, 200, ALPHA)', 'rgba(80, 60, 200, 0)'], // indigo
  ['rgba(60, 120, 220, ALPHA)', 'rgba(60, 120, 220, 0)'], // blue
  ['rgba(220, 100, 60, ALPHA)', 'rgba(220, 100, 60, 0)'], // warm orange
]

const CLOUD_COUNT = 6

export class NebulaSystem {
  private readonly width: number
  private readonly height: number
  private readonly clouds: Cloud[]

  constructor(opts: { width: number; height: number }) {
    this.width = opts.width
    this.height = opts.height
    this.clouds = this.initClouds()
  }

  private initClouds(): Cloud[] {
    const clouds: Cloud[] = []
    // Slower drift for ethereal feel: 0.03 to 0.08 cells/tick.
    const speeds = [0.03, 0.04, 0.05, 0.06, 0.07, 0.08]
    const alphas = [0.08, 0.1, 0.09, 0.12, 0.11, 0.13]
    const yFractions = [0.15, 0.3, 0.45, 0.6, 0.75, 0.85]
    // Bigger radial gradients — 300 to 500 px tall.
    const sizes = [300, 360, 420, 460, 500, 480]
    // Alternate composite modes: half 'lighter' (glow), half 'screen' (soft).
    const ops: Array<'lighter' | 'screen'> = ['lighter', 'screen', 'lighter', 'screen', 'lighter', 'screen']

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const size = sizes[i]
      const cloudW = Math.max(size, Math.floor(this.width * 0.4))
      const cloudH = size
      const image = this.renderCloud(cloudW, cloudH, CLOUD_COLORS[i], alphas[i])
      clouds.push({
        image,
        y: Math.round(yFractions[i] * this.height - cloudH / 2),
        speed: speeds[i],
        initialX: Math.round((i / CLOUD_COUNT) * this.width),
        alpha: alphas[i],
        width: cloudW,
        compositeOp: ops[i],
      })
    }
    return clouds
  }

  private renderCloud(w: number, h: number, colors: [string, string], alpha: number): CloudImage {
    const canvas: CloudImage =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : typeof document !== 'undefined'
          ? this.makeHtmlCanvas(w, h)
          : this.makeStubCanvas(w, h)

    const ctxRaw = (
      canvas as unknown as {
        getContext: (id: '2d') => CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
      }
    ).getContext('2d')
    if (!ctxRaw) return canvas
    const ctx = ctxRaw as CanvasRenderingContext2D

    try {
      const cx = w / 2
      const cy = h / 2
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cx, cy))
      grad.addColorStop(0, colors[0].replace('ALPHA', alpha.toString()))
      grad.addColorStop(1, colors[1])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    } catch {
      // ignore in environments lacking radial gradients
    }
    return canvas
  }

  private makeHtmlCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }

  private makeStubCanvas(w: number, h: number): HTMLCanvasElement {
    // Shouldn't be reached outside of jsdom — document exists there.
    const c = { width: w, height: h } as unknown as HTMLCanvasElement
    return c
  }

  /** Return parallax-drifted cloud draw calls for the given tick. */
  getDrawCalls(tick: number): NebulaDrawCall[] {
    const result: NebulaDrawCall[] = []
    for (const cloud of this.clouds) {
      const rawX = cloud.initialX - tick * cloud.speed
      // Wrap so cloud x ∈ [-cloud.width, width).
      // Period = width + cloud.width so it exits the left edge just as its
      // partner copy (conceptually) enters from the right.
      const period = this.width + cloud.width
      const wrapped = (((rawX % period) + period) % period) - cloud.width
      result.push({
        x: wrapped,
        y: cloud.y,
        image: cloud.image as CanvasImageSource,
        alpha: cloud.alpha,
        compositeOp: cloud.compositeOp,
      })
    }
    return result
  }
}
