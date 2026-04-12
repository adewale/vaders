import { describe, it, expect, vi, afterEach } from 'vitest'
import fc from 'fast-check'
import { WebAudioAdapter } from './WebAudioAdapter'

function createMockAudioContext() {
  const oscillators: any[] = []
  const gainNodes: any[] = []
  const bufferSources: any[] = []
  const panners: any[] = []
  const convolvers: any[] = []
  const buffers: any[] = []

  const makeOsc = () => {
    const osc = {
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    oscillators.push(osc)
    return osc
  }

  const makeGain = () => {
    const gain = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    gainNodes.push(gain)
    return gain
  }

  const makePanner = () => {
    const panner = {
      pan: {
        value: 0,
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    panners.push(panner)
    return panner
  }

  const makeConvolver = () => {
    const conv = {
      buffer: null as any,
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    convolvers.push(conv)
    return conv
  }

  const ctx: any = {
    state: 'running' as AudioContextState,
    // currentTime advances with real/fake timers (performance.now in ms)
    get currentTime() {
      // performance.now in jsdom advances with vi fake timers
      return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
    },
    sampleRate: 44100,
    createOscillator: vi.fn(makeOsc),
    createGain: vi.fn(makeGain),
    createStereoPanner: vi.fn(makePanner),
    createConvolver: vi.fn(makeConvolver),
    createBufferSource: vi.fn(() => {
      const src: any = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      }
      bufferSources.push(src)
      return src
    }),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
      const buf = {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length)),
      }
      buffers.push(buf)
      return buf
    }),
    decodeAudioData: vi.fn((_data: ArrayBuffer) => {
      const buf = {
        numberOfChannels: 1,
        length: 44100,
        sampleRate: 44100,
        duration: 1,
        getChannelData: vi.fn(() => new Float32Array(44100)),
      }
      return Promise.resolve(buf)
    }),
    destination: {},
    suspend: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
  }

  return { ctx, oscillators, gainNodes, bufferSources, panners, convolvers, buffers }
}

function installFetchMock(ok = true) {
  const fetchFn = vi.fn((_url: string) => {
    if (!ok) return Promise.resolve({ ok: false, status: 404 } as any)
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as any)
  })
  // @ts-expect-error — jsdom global
  globalThis.fetch = fetchFn
  return fetchFn
}

describe('WebAudioAdapter', () => {
  it('play() before initialize() does not throw', () => {
    const adapter = new WebAudioAdapter()

    expect(() => adapter.play('shoot')).not.toThrow()
    expect(() => adapter.play('alien_killed')).not.toThrow()
    expect(() => adapter.play('player_died')).not.toThrow()
  })

  it('play("shoot") creates an oscillator with a square wave', () => {
    const { ctx, oscillators } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.play('shoot')

    expect(ctx.createOscillator).toHaveBeenCalled()
    const osc = oscillators[oscillators.length - 1]
    expect(osc.type).toBe('square')
    expect(osc.start).toHaveBeenCalled()
    expect(osc.stop).toHaveBeenCalled()
  })

  it('play("alien_killed") creates both an oscillator and noise buffer', () => {
    const { ctx } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.play('alien_killed')

    expect(ctx.createOscillator).toHaveBeenCalled()
    // Noise uses createBuffer + createBufferSource
    expect(ctx.createBuffer).toHaveBeenCalled()
    expect(ctx.createBufferSource).toHaveBeenCalled()
  })

  it('play("wave_complete") triggers an arpeggio (multiple oscillators)', async () => {
    vi.useFakeTimers()
    const { ctx } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.play('wave_complete')
    // First note is immediate, subsequent via setTimeout
    vi.runAllTimers()

    // Arpeggio has 4 notes → 4 oscillator creations
    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(4)
    vi.useRealTimers()
  })

  it('setMuted(true) sets master gain to 0 (audible muting)', () => {
    const { ctx, gainNodes } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    // After construction, the master gain is the first gain node
    const masterGain = gainNodes[0]
    expect(masterGain.gain.value).toBe(0.3)

    adapter.setMuted(true)
    expect(masterGain.gain.value).toBe(0)
    expect(adapter.isMuted()).toBe(true)
  })

  it('setMuted(false) restores master gain', () => {
    const { ctx, gainNodes } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)
    const masterGain = gainNodes[0]

    adapter.setMuted(true)
    adapter.setMuted(false)

    expect(masterGain.gain.value).toBe(0.3)
    expect(adapter.isMuted()).toBe(false)
  })

  it('setMusicMuted(true) silences musicGain without touching master', () => {
    vi.useFakeTimers()
    const { ctx, gainNodes } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)
    const masterGain = gainNodes[0]

    // startMusic creates the musicGain (0.5 by default)
    adapter.startMusic()
    const musicGain = gainNodes[gainNodes.length - 1]
    expect(musicGain.gain.value).toBe(0.5)

    adapter.setMusicMuted(true)
    expect(musicGain.gain.value).toBe(0)
    // SFX master is untouched
    expect(masterGain.gain.value).toBe(0.3)
    expect(adapter.isMusicMuted()).toBe(true)
    expect(adapter.isMuted()).toBe(false)
    vi.useRealTimers()
  })

  it('setMusicMuted(false) restores musicGain to 0.5', () => {
    vi.useFakeTimers()
    const { ctx, gainNodes } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.startMusic()
    const musicGain = gainNodes[gainNodes.length - 1]
    adapter.setMusicMuted(true)
    adapter.setMusicMuted(false)
    expect(musicGain.gain.value).toBe(0.5)
    expect(adapter.isMusicMuted()).toBe(false)
    vi.useRealTimers()
  })

  it('startMusic after setMusicMuted(true) still starts silently', () => {
    vi.useFakeTimers()
    const { ctx, gainNodes } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.setMusicMuted(true)
    adapter.startMusic()
    const musicGain = gainNodes[gainNodes.length - 1]
    // New musicGain must honour the existing muted state
    expect(musicGain.gain.value).toBe(0)
    vi.useRealTimers()
  })

  it('isMusicMuted defaults to false', () => {
    const { ctx } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)
    expect(adapter.isMusicMuted()).toBe(false)
  })

  it('play() while muted creates no oscillator', () => {
    const { ctx } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.setMuted(true)
    const countBefore = ctx.createOscillator.mock.calls.length
    adapter.play('shoot')
    const countAfter = ctx.createOscillator.mock.calls.length

    expect(countAfter).toBe(countBefore)
  })

  it('startMusic begins a recurring note loop', () => {
    vi.useFakeTimers()
    const { ctx, oscillators } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    const oscCountBefore = oscillators.length
    adapter.startMusic()

    // Advance past the initial lookahead so the scheduler emits notes
    vi.advanceTimersByTime(200)

    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThan(oscCountBefore)

    const countAfterFirst = ctx.createOscillator.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThan(countAfterFirst)

    adapter.stopMusic()
    const stoppedCount = ctx.createOscillator.mock.calls.length
    vi.advanceTimersByTime(1000)
    // No more notes after stopMusic
    expect(ctx.createOscillator.mock.calls.length).toBe(stoppedCount)

    vi.useRealTimers()
  })

  it('stopMusic is safe to call before startMusic', () => {
    const { ctx } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    expect(() => adapter.stopMusic()).not.toThrow()
  })

  it('startMusic and stopMusic are silent no-ops without AudioContext', () => {
    const adapter = new WebAudioAdapter()
    expect(() => adapter.startMusic()).not.toThrow()
    expect(() => adapter.stopMusic()).not.toThrow()
  })

  it('resume() resumes a suspended AudioContext', () => {
    const { ctx } = createMockAudioContext()
    ctx.state = 'suspended'
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.resume()

    expect(ctx.resume).toHaveBeenCalled()
  })

  it('resume() is a no-op if context is already running', () => {
    const { ctx } = createMockAudioContext()
    ctx.state = 'running'
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.resume()

    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('resume() is safe with no context (no crash)', () => {
    const adapter = new WebAudioAdapter()
    expect(() => adapter.resume()).not.toThrow()
  })

  it('play() after resume() succeeds on initially-suspended context', async () => {
    const { ctx, oscillators } = createMockAudioContext()
    ctx.state = 'suspended'
    // Simulate resume transitioning state to 'running'
    ctx.resume = vi.fn(() => {
      ctx.state = 'running'
      return Promise.resolve()
    })
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.resume()
    await Promise.resolve()

    adapter.play('shoot')

    expect(ctx.resume).toHaveBeenCalled()
    expect(ctx.createOscillator).toHaveBeenCalled()
    const osc = oscillators[oscillators.length - 1]
    expect(osc.start).toHaveBeenCalled()
  })

  // ─── Upgrade 1: ConvolverNode reverb ──────────────────────────────────────

  describe('reverb bus', () => {
    it('wires a ConvolverNode on construction with AudioContext', () => {
      const { ctx, convolvers } = createMockAudioContext()
      new WebAudioAdapter(ctx as unknown as AudioContext)

      expect(ctx.createConvolver).toHaveBeenCalled()
      expect(convolvers.length).toBe(1)
      expect(convolvers[0].buffer).not.toBeNull()
    })

    it('impulse response buffer is approximately 1.5 seconds', () => {
      const { ctx, convolvers } = createMockAudioContext()
      new WebAudioAdapter(ctx as unknown as AudioContext)

      const ir = convolvers[0].buffer
      expect(ir).toBeTruthy()
      // length / sampleRate ≈ 1.5s (±10%)
      const duration = ir.length / ir.sampleRate
      expect(duration).toBeGreaterThanOrEqual(1.35)
      expect(duration).toBeLessThanOrEqual(1.65)
    })

    it('dry and wet gains sum to approximately 1.0', () => {
      const { ctx, gainNodes } = createMockAudioContext()
      new WebAudioAdapter(ctx as unknown as AudioContext)

      // master(0.3) + dry + wet = 3 gain nodes minimum
      // The dry/wet gains are identifiable: they are the ones whose initial value
      // is ≤ 1 and whose values sum to ~1.0.
      const values: number[] = gainNodes.map((g: any) => g.gain.value)
      // Find a pair (dry, wet) summing to ~1
      let found = false
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          if (Math.abs(values[i] + values[j] - 1.0) < 0.05) {
            found = true
            break
          }
        }
        if (found) break
      }
      expect(found).toBe(true)
    })
  })

  // ─── Upgrade 2: StereoPannerNode spatial audio ────────────────────────────

  describe('stereo panning', () => {
    it('play(sound, {panX: -1}) creates a StereoPannerNode with pan = -1', () => {
      const { ctx, panners } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      adapter.play('shoot', { panX: -1 })

      expect(ctx.createStereoPanner).toHaveBeenCalled()
      const last = panners[panners.length - 1]
      expect(last.pan.value).toBe(-1)
    })

    it('play(sound, {panX: 1}) creates a StereoPannerNode with pan = 1', () => {
      const { ctx, panners } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      adapter.play('shoot', { panX: 1 })

      const last = panners[panners.length - 1]
      expect(last.pan.value).toBe(1)
    })

    it('play(sound) without panX creates no panner (centered)', () => {
      const { ctx } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      const before = ctx.createStereoPanner.mock.calls.length
      adapter.play('shoot')
      const after = ctx.createStereoPanner.mock.calls.length

      expect(after).toBe(before)
    })

    it('property: panner.pan.value matches requested panX in [-1, 1]', () => {
      fc.assert(
        fc.property(fc.double({ min: -1, max: 1, noNaN: true }), (panX) => {
          const { ctx, panners } = createMockAudioContext()
          const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)
          adapter.play('shoot', { panX })
          if (panX === 0) {
            // No panner for center
            return ctx.createStereoPanner.mock.calls.length === 0
          }
          const last = panners[panners.length - 1]
          return last.pan.value === panX
        }),
        { numRuns: 30 },
      )
    })
  })

  // ─── Upgrade 3: Real audio files from TUI ─────────────────────────────────

  describe('loadSamples', () => {
    afterEach(() => {
      // @ts-expect-error clean up global
      delete globalThis.fetch
    })

    it('loadSamples fetches all sound files', async () => {
      installFetchMock(true)
      const { ctx } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      await adapter.loadSamples()

      // 10 WAV + 1 MP3 = 11 fetches
      expect((globalThis.fetch as any).mock.calls.length).toBe(11)
      expect(ctx.decodeAudioData).toHaveBeenCalled()
    })

    it('play after loadSamples uses AudioBufferSourceNode path', async () => {
      installFetchMock(true)
      const { ctx } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      await adapter.loadSamples()
      const beforeSources = ctx.createBufferSource.mock.calls.length

      adapter.play('shoot')

      // Sample playback creates a buffer source
      expect(ctx.createBufferSource.mock.calls.length).toBeGreaterThan(beforeSources)
    })

    it('play before loadSamples falls back to oscillator only', () => {
      const { ctx, oscillators } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      adapter.play('shoot')

      expect(oscillators.length).toBeGreaterThan(0)
    })

    it('loadSamples handles 404 gracefully', async () => {
      installFetchMock(false)
      const { ctx } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      await expect(adapter.loadSamples()).resolves.not.toThrow()

      // After failed load, play still works via oscillator
      adapter.play('shoot')
      expect(ctx.createOscillator).toHaveBeenCalled()
    })

    it('loadSamples is idempotent (safe to call twice)', async () => {
      installFetchMock(true)
      const { ctx } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      await adapter.loadSamples()
      const firstCount = (globalThis.fetch as any).mock.calls.length
      await adapter.loadSamples()
      const secondCount = (globalThis.fetch as any).mock.calls.length

      expect(secondCount).toBe(firstCount)
    })
  })

  // ─── Upgrade 4: Layered synth music with tempo scaling ────────────────────

  describe('layered music scheduler', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('startMusic(1) activates only bass stem', () => {
      vi.useFakeTimers()
      const { ctx, oscillators } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      const before = oscillators.length
      adapter.startMusic(1)
      // Let scheduler emit a few beats
      vi.advanceTimersByTime(2000)

      const notes = oscillators.slice(before)
      // Bass is triangle-wave. No kick / arp / hat types at wave 1.
      const types = new Set(notes.map((o: any) => o.type))
      expect(notes.length).toBeGreaterThan(0)
      expect(types.has('triangle')).toBe(true)
      // Sawtooth (arp) and sine (kick pitched) are not-in at wave 1 — we check
      // that we don't see arp-style high pitches by verifying bass pitches only.
      const bassFreqs = [82.4, 110, 92.5]
      const allNotes = notes.every((o: any) => bassFreqs.some((f) => Math.abs(o.frequency.value - f) < 1))
      expect(allNotes).toBe(true)

      adapter.stopMusic()
    })

    it('startMusic(4) activates all 4 stems', () => {
      vi.useFakeTimers()
      const { ctx, oscillators, bufferSources } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      const oscBefore = oscillators.length
      const srcBefore = bufferSources.length
      adapter.startMusic(4)
      // Let scheduler run ~3 seconds to cover several beats
      vi.advanceTimersByTime(3000)

      const newOscs = oscillators.slice(oscBefore)
      const newSrcs = bufferSources.slice(srcBefore)
      // We expect diverse oscillator types: triangle (bass), sine (kick),
      // sawtooth (arp); plus noise buffer sources (hat)
      const types = new Set(newOscs.map((o: any) => o.type))
      expect(types.size).toBeGreaterThanOrEqual(2)
      // Hat emits noise via createBufferSource
      expect(newSrcs.length).toBeGreaterThan(0)

      adapter.stopMusic()
    })

    it('BPM scales with wave', () => {
      const { ctx } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      expect(adapter.bpmForWave(1)).toBe(128)
      expect(adapter.bpmForWave(2)).toBe(136)
      expect(adapter.bpmForWave(4)).toBe(152)
    })

    it('stopMusic stops all stems and clears the scheduler', () => {
      vi.useFakeTimers()
      const { ctx, oscillators } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      adapter.startMusic(4)
      vi.advanceTimersByTime(500)
      adapter.stopMusic()
      const stoppedCount = oscillators.length
      vi.advanceTimersByTime(2000)

      // No new oscillators after stop
      expect(oscillators.length).toBe(stoppedCount)
    })

    it('startMusic uses background music sample if loaded', async () => {
      installFetchMock(true)
      const { ctx, bufferSources } = createMockAudioContext()
      const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

      await adapter.loadSamples()
      const before = bufferSources.length

      adapter.startMusic(1)

      const newSources = bufferSources.slice(before)
      // One of the sources should be looping (background music)
      expect(newSources.some((s: any) => s.loop === true)).toBe(true)

      adapter.stopMusic()
      // @ts-expect-error
      delete globalThis.fetch
    })
  })
})
