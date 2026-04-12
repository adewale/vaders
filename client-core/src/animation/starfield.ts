// client-core/src/animation/starfield.ts
// Twinkling starfield background — purely cosmetic ambient effect
//
// Inspired by Amiga-era color cycling techniques:
// 1. Brightness ramps — each hue cycles dim→bright→dim like a real twinkle
// 2. Depth layers — dim/slow background stars vs brighter/faster foreground stars
// 3. Desynchronized cycles — different star groups use different cycle periods
// 4. Rare bright flash — occasional scintillation spike in the brightness ramp
// 5. Spatial phase offsets — hash-based phase distribution across the field

export interface StarfieldConfig {
  width: number
  height: number
  density: number // fraction of cells that are stars (0..1)
  unicode: boolean // true = middle dot, false = ASCII period
}

export interface StarCell {
  x: number
  y: number
  char: string
  color: string
}

export const DEFAULT_STARFIELD_CONFIG: StarfieldConfig = {
  width: 120,
  height: 34,
  density: 0.01,
  unicode: true,
}

// ─── Depth Layers ──────────────────────────────────────────────────────────
// Each layer has a hue-specific brightness ramp and its own cycle period.
// "Far" stars are dimmer and cycle slower; "near" stars are brighter and faster.

export interface StarLayer {
  // Brightness ramp — star cycles through these in order, then reverses
  ramp: string[]
  // Ticks per ramp step — controls cycle speed
  ticksPerStep: number
  // Fraction of total stars in this layer (should sum to 1.0)
  weight: number
}

export const STAR_LAYERS: StarLayer[] = [
  // Far background — dim blue, slow breathe
  {
    ramp: ['#333366', '#3b3b77', '#4444aa', '#3b3b77'],
    ticksPerStep: 28,
    weight: 0.45,
  },
  // Mid layer — purple tint, medium speed
  {
    ramp: ['#443366', '#553b77', '#6644aa', '#553b77'],
    ticksPerStep: 20,
    weight: 0.3,
  },
  // Near foreground — brighter grey-blue, faster, with a scintillation spike
  {
    ramp: ['#444466', '#555577', '#7777cc', '#aaaaee', '#7777cc', '#555577'],
    ticksPerStep: 15,
    weight: 0.25,
  },
]

const STAR_CHAR_UNICODE = '\u00B7' // middle dot
const STAR_CHAR_ASCII = '.'

interface Star {
  x: number
  y: number
  phase: number // offset into the ramp (spatial desync)
  layer: number // index into STAR_LAYERS
}

export class StarfieldSystem {
  private readonly stars: Star[]
  private readonly char: string
  private readonly layers: StarLayer[]
  // Memoization: cache per composite slow-tick key
  private cachedKey: string = ''
  private cachedCells: StarCell[] = []

  constructor(config: Partial<StarfieldConfig> = {}, layers?: StarLayer[]) {
    const cfg = { ...DEFAULT_STARFIELD_CONFIG, ...config }
    this.char = cfg.unicode ? STAR_CHAR_UNICODE : STAR_CHAR_ASCII
    this.layers = layers ?? STAR_LAYERS

    // Generate deterministic star positions
    const totalCount = Math.round(cfg.width * cfg.height * cfg.density)
    this.stars = []
    const occupied = new Set<number>()

    // Distribute stars across layers by weight
    let starIndex = 0
    for (let layerIdx = 0; layerIdx < this.layers.length; layerIdx++) {
      const layer = this.layers[layerIdx]
      const isLast = layerIdx === this.layers.length - 1
      const layerCount = isLast
        ? totalCount - this.stars.length // remainder to last layer
        : Math.round(totalCount * layer.weight)

      for (let i = 0; i < layerCount; i++) {
        let x: number, y: number, key: number
        let attempt = 0
        do {
          const hash = this.hash(starIndex, attempt)
          x = hash % cfg.width
          y = Math.floor(hash / cfg.width) % cfg.height
          key = y * cfg.width + x
          attempt++
        } while (occupied.has(key) && attempt < 10)

        if (!occupied.has(key)) {
          occupied.add(key)
          // Spatial phase offset — desynchronizes neighbors
          const phase = (x * 7 + y * 13) % layer.ramp.length
          this.stars.push({ x, y, phase, layer: layerIdx })
        }
        starIndex++
      }
    }
  }

  /** Simple deterministic hash for star placement */
  private hash(index: number, attempt: number): number {
    let h = (index * 2654435761 + attempt * 340573321) >>> 0
    h = ((h ^ (h >>> 16)) * 2246822507) >>> 0
    h = ((h ^ (h >>> 13)) * 3266489909) >>> 0
    return (h ^ (h >>> 16)) >>> 0
  }

  get starCount(): number {
    return this.stars.length
  }

  /** Returns renderable cells, memoized by composite slow-tick key */
  getCells(tick: number): StarCell[] {
    // Build a cache key from each layer's slow-tick value
    const key = this.layers.map((l) => Math.floor(tick / l.ticksPerStep)).join(',')
    if (key === this.cachedKey) {
      return this.cachedCells
    }

    this.cachedKey = key
    this.cachedCells = this.stars.map((star) => {
      const layer = this.layers[star.layer]
      const slowTick = Math.floor(tick / layer.ticksPerStep)
      const rampIndex = (star.phase + slowTick) % layer.ramp.length
      return {
        x: star.x,
        y: star.y,
        char: this.char,
        color: layer.ramp[rampIndex],
      }
    })

    return this.cachedCells
  }
}
