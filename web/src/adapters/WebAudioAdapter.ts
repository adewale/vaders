import type { AudioAdapter } from '../../../client-core/src/adapters'

/**
 * Extended sound event set covering both legacy adapter events and the newer
 * trigger events emitted by client-core/src/audio/triggers.ts. Accepting both
 * keeps the adapter compatible with whatever name flows in without having to
 * touch client-core/.
 */
export type WebSoundEvent =
  // legacy names (adapters.ts)
  | 'shoot'
  | 'alien_killed'
  | 'player_died'
  | 'wave_complete'
  | 'game_over_victory'
  | 'game_over_defeat'
  | 'ufo_spawn'
  | 'countdown_tick'
  // trigger names (triggers.ts)
  | 'game_over'
  | 'game_start'
  | 'ufo'
  | 'menu_navigate'
  | 'menu_select'

export interface PlayOptions {
  /** Stereo pan in [-1, 1]. 0 = centred. Defaults to 0. */
  panX?: number
}

/** Sample filenames keyed by sound event. */
const SAMPLE_FILES: Record<string, string> = {
  shoot: 'shoot.wav',
  alien_killed: 'alien_killed.wav',
  player_died: 'player_died.wav',
  wave_complete: 'wave_complete.wav',
  game_over: 'game_over.wav',
  game_over_victory: 'game_over.wav',
  game_over_defeat: 'game_over.wav',
  game_start: 'game_start.wav',
  ufo: 'ufo.wav',
  ufo_spawn: 'ufo.wav',
  countdown_tick: 'countdown_tick.wav',
  menu_navigate: 'menu_navigate.wav',
  menu_select: 'menu_select.wav',
}

const MUSIC_FILE = 'background-music.mp3'

// How loud the oscillator layer is when a sample is also playing.
const OSC_LAYER_VOLUME = 0.25
// Sample playback gain.
const SAMPLE_VOLUME = 0.7
// Background music sample volume.
const MUSIC_SAMPLE_VOLUME = 0.3

/**
 * Web Audio API adapter combining oscillator synthesis, sample playback,
 * reverb, stereo panning, and a layered music scheduler.
 */
export class WebAudioAdapter implements AudioAdapter {
  private ctx: AudioContext | null = null
  private muted = false
  private musicMuted = false
  private masterGain: GainNode | null = null
  private dryGain: GainNode | null = null
  private wetGain: GainNode | null = null
  private convolver: ConvolverNode | null = null

  // Sample cache
  private samples: Map<string, AudioBuffer> = new Map()
  private samplesLoadingPromise: Promise<void> | null = null
  private samplesLoaded = false

  // Music scheduler state
  private musicInterval: ReturnType<typeof setInterval> | null = null
  private musicWave = 1
  private nextBeatTime = 0
  private beatIndex = 0
  private musicGain: GainNode | null = null
  private musicSampleSource: AudioBufferSourceNode | null = null
  private musicSampleGain: GainNode | null = null

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? null
    if (this.ctx) {
      this.initGraph()
    }
  }

  private initGraph(): void {
    if (!this.ctx) return
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.3

    // If the runtime (or test mock) doesn't expose createConvolver, degrade
    // to a direct master→destination graph without reverb.
    if (typeof this.ctx.createConvolver !== 'function') {
      this.masterGain.connect(this.ctx.destination)
      return
    }

    // master ──┬── dry ──▶ destination
    //          └── wet ──▶ convolver ──▶ destination
    this.dryGain = this.ctx.createGain()
    this.dryGain.gain.value = 0.7

    this.wetGain = this.ctx.createGain()
    this.wetGain.gain.value = 0.3

    this.convolver = this.ctx.createConvolver()
    this.convolver.buffer = this.buildImpulseResponse(1.5)

    this.masterGain.connect(this.dryGain)
    this.masterGain.connect(this.wetGain)
    this.dryGain.connect(this.ctx.destination)
    this.wetGain.connect(this.convolver)
    this.convolver.connect(this.ctx.destination)
  }

  /** Build a synthesized impulse response: exponentially decaying white noise. */
  private buildImpulseResponse(seconds: number): AudioBuffer {
    const sampleRate = this.ctx!.sampleRate
    const length = Math.floor(sampleRate * seconds)
    const buf = this.ctx!.createBuffer(2, length, sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        // Exponential decay * white noise
        const decay = (1 - i / length) ** 2.5
        data[i] = (Math.random() * 2 - 1) * decay
      }
    }
    return buf
  }

  play(sound: WebSoundEvent | string, opts?: PlayOptions): void {
    if (!this.ctx || this.muted || !this.masterGain) return

    const panX = opts?.panX ?? 0
    const samplePlayed = this.playSample(sound, panX)
    // Layer oscillator synth. If a sample was played, reduce its volume so
    // it complements rather than doubles.
    const volScale = samplePlayed ? OSC_LAYER_VOLUME / 0.3 : 1

    switch (sound) {
      case 'shoot':
        this.beep(880, 0.08, 'square', 0.3 * volScale, 660, panX)
        break
      case 'alien_killed':
        this.beep(220, 0.15, 'sawtooth', 0.4 * volScale, 80, panX)
        this.noise(0.08, 0.2 * volScale, panX)
        break
      case 'player_died':
        this.beep(440, 0.6, 'sawtooth', 0.5 * volScale, 50, panX)
        this.noise(0.4, 0.3 * volScale, panX)
        break
      case 'wave_complete':
        this.arpeggio([523, 659, 784, 1046], 0.1, 'triangle', 0.3 * volScale, panX)
        break
      case 'game_over':
      case 'game_over_defeat':
        this.arpeggio([440, 330, 247, 165], 0.2, 'sawtooth', 0.4 * volScale, panX)
        break
      case 'game_over_victory':
        this.arpeggio([523, 659, 784, 1046, 1319], 0.15, 'triangle', 0.4 * volScale, panX)
        break
      case 'ufo':
      case 'ufo_spawn':
        this.beep(1200, 0.4, 'sine', 0.2 * volScale, 800, panX)
        break
      case 'game_start':
        this.arpeggio([440, 554, 659, 880], 0.08, 'triangle', 0.3 * volScale, panX)
        break
      case 'countdown_tick':
        this.beep(880, 0.1, 'sine', 0.3 * volScale, undefined, panX)
        break
      case 'menu_navigate':
        this.beep(660, 0.05, 'sine', 0.2 * volScale, undefined, panX)
        break
      case 'menu_select':
        this.beep(880, 0.08, 'square', 0.25 * volScale, 1320, panX)
        break
    }
  }

  /**
   * Attempt to play a preloaded sample. Returns true if a sample was played,
   * false if we should fall through to oscillator synthesis only.
   */
  private playSample(sound: string, panX: number): boolean {
    if (!this.ctx || !this.masterGain) return false
    const key = SAMPLE_FILES[sound]
    if (!key) return false
    const buffer = this.samples.get(key)
    if (!buffer) return false

    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = SAMPLE_VOLUME

    src.connect(gain)
    this.connectWithPan(gain, panX)
    src.start()
    return true
  }

  /**
   * Fetch and decode all audio samples. Safe to call multiple times —
   * subsequent calls return the same in-flight promise (or resolve
   * immediately if already loaded).
   */
  async loadSamples(): Promise<void> {
    if (this.samplesLoaded) return
    if (this.samplesLoadingPromise) return this.samplesLoadingPromise
    if (!this.ctx) return

    const ctx = this.ctx
    const files = [...Object.values(SAMPLE_FILES).filter((v, i, a) => a.indexOf(v) === i), MUSIC_FILE]

    this.samplesLoadingPromise = Promise.all(
      files.map(async (file) => {
        try {
          const res = await fetch(`/sounds/${file}`)
          if (!res.ok) return
          const arr = await res.arrayBuffer()
          const buf = await ctx.decodeAudioData(arr)
          this.samples.set(file, buf)
        } catch {
          // Swallow — we'll fall back to oscillator synthesis.
        }
      }),
    ).then(() => {
      this.samplesLoaded = true
    })

    return this.samplesLoadingPromise
  }

  /** Public BPM helper for tests and schedulers. */
  bpmForWave(wave: number): number {
    return 120 + wave * 8
  }

  startMusic(wave: number = 1): void {
    if (!this.ctx || !this.masterGain || this.musicInterval) return

    this.musicWave = Math.max(1, wave)
    this.beatIndex = 0
    this.nextBeatTime = this.ctx.currentTime

    this.musicGain = this.ctx.createGain()
    // Honour an existing music-muted state so toggling mute *before* music
    // starts still produces a silent track.
    this.musicGain.gain.value = this.musicMuted ? 0 : 0.5
    this.musicGain.connect(this.masterGain)

    // Start background music sample (layered under synth) if available.
    const musicBuffer = this.samples.get(MUSIC_FILE)
    if (musicBuffer) {
      const src = this.ctx.createBufferSource()
      src.buffer = musicBuffer
      src.loop = true
      const g = this.ctx.createGain()
      g.gain.value = MUSIC_SAMPLE_VOLUME
      src.connect(g)
      g.connect(this.masterGain)
      src.start()
      this.musicSampleSource = src
      this.musicSampleGain = g
    }

    this.musicInterval = setInterval(() => this.schedulerTick(), 25)
  }

  stopMusic(): void {
    if (this.musicInterval) {
      clearInterval(this.musicInterval)
      this.musicInterval = null
    }
    if (this.musicGain) {
      try {
        this.musicGain.disconnect()
      } catch {
        // ignore
      }
      this.musicGain = null
    }
    if (this.musicSampleSource) {
      try {
        this.musicSampleSource.stop()
      } catch {
        // already stopped
      }
      try {
        this.musicSampleSource.disconnect()
      } catch {
        // ignore
      }
      this.musicSampleSource = null
    }
    if (this.musicSampleGain) {
      try {
        this.musicSampleGain.disconnect()
      } catch {
        // ignore
      }
      this.musicSampleGain = null
    }
  }

  /**
   * Look-ahead scheduler: every 25ms we check if the next beat(s) fall within
   * the next 100ms window, and if so, schedule them via AudioContext's
   * precise currentTime. This yields tight timing even if setInterval jitters.
   */
  private schedulerTick(): void {
    if (!this.ctx || !this.musicGain) return
    const lookahead = 0.1 // seconds
    const bpm = this.bpmForWave(this.musicWave)
    const beatDuration = 60 / bpm

    while (this.nextBeatTime < this.ctx.currentTime + lookahead) {
      this.scheduleBeat(this.beatIndex, this.nextBeatTime, beatDuration)
      this.beatIndex++
      this.nextBeatTime += beatDuration
    }
  }

  private scheduleBeat(beatIndex: number, when: number, beatDuration: number): void {
    const wave = this.musicWave

    // Bass: always on — pattern of 4 beats (E2, E2, A2, E2) then (F#2, E2, A2, E2)
    const bassPattern = [82.4, 82.4, 110, 82.4, 92.5, 82.4, 110, 82.4]
    const bassNote = bassPattern[beatIndex % bassPattern.length]
    this.scheduleSynthNote('triangle', bassNote, when, beatDuration * 0.9, 0.4)

    // Kick: wave ≥ 2, every beat
    if (wave >= 2) {
      this.scheduleKick(when)
    }

    // Arp: wave ≥ 3, two notes per beat from pentatonic (E-G-A-B-D)
    if (wave >= 3) {
      const arpPattern = [329.6, 392.0, 440.0, 493.9, 587.3]
      const n1 = arpPattern[(beatIndex * 2) % arpPattern.length]
      const n2 = arpPattern[(beatIndex * 2 + 1) % arpPattern.length]
      this.scheduleSynthNote('sawtooth', n1, when, beatDuration * 0.4, 0.15)
      this.scheduleSynthNote('sawtooth', n2, when + beatDuration * 0.5, beatDuration * 0.4, 0.15)
    }

    // Hat: wave ≥ 4, on off-beats
    if (wave >= 4) {
      this.scheduleHat(when + beatDuration * 0.5, 0.04)
    }
  }

  private scheduleSynthNote(type: OscillatorType, freq: number, when: number, duration: number, volume: number): void {
    if (!this.ctx || !this.musicGain) return
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(volume, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + duration)
    osc.connect(g)
    g.connect(this.musicGain)
    osc.start(when)
    osc.stop(when + duration)
  }

  private scheduleKick(when: number): void {
    if (!this.ctx || !this.musicGain) return
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, when)
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.12)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.6, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.15)
    osc.connect(g)
    g.connect(this.musicGain)
    osc.start(when)
    osc.stop(when + 0.15)
  }

  private scheduleHat(when: number, duration: number): void {
    if (!this.ctx || !this.musicGain) return
    const bufferSize = Math.floor(this.ctx.sampleRate * duration)
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.15, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + duration)
    src.connect(g)
    g.connect(this.musicGain)
    src.start(when)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (!this.ctx || !this.masterGain) return
    this.masterGain.gain.value = muted ? 0 : 0.3
  }

  isMuted(): boolean {
    return this.muted
  }

  /**
   * Mute music only, leaving SFX unaffected. The TUI exposes this as a
   * separate toggle (N) distinct from the SFX mute (M), so the web frontend
   * mirrors that split.
   */
  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted
    if (this.musicGain) {
      this.musicGain.gain.value = muted ? 0 : 0.5
    }
  }

  isMusicMuted(): boolean {
    return this.musicMuted
  }

  /**
   * Resume a suspended AudioContext. Browsers create AudioContexts in
   * 'suspended' state until a user gesture allows audio playback.
   * Call this from click/keydown handlers.
   */
  resume(): void {
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  // ─── Sound primitives ─────────────────────────────────────────────────────

  /** Route a node through the optional panner, then into the reverb bus. */
  private connectWithPan(node: AudioNode, panX: number): void {
    if (!this.ctx || !this.masterGain) return
    if (panX !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner()
      panner.pan.value = panX
      node.connect(panner)
      panner.connect(this.masterGain)
    } else {
      node.connect(this.masterGain)
    }
  }

  private beep(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume = 0.3,
    endFreq?: number,
    panX: number = 0,
  ): void {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime)
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), this.ctx.currentTime + duration)
    }
    gain.gain.setValueAtTime(Math.max(0.001, volume), this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration)
    osc.connect(gain)
    this.connectWithPan(gain, panX)
    osc.start()
    osc.stop(this.ctx.currentTime + duration)
  }

  private noise(duration: number, volume = 0.3, panX: number = 0): void {
    if (!this.ctx || !this.masterGain) return
    const bufferSize = Math.floor(this.ctx.sampleRate * duration)
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) // fade out
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    src.connect(gain)
    this.connectWithPan(gain, panX)
    src.start()
  }

  private arpeggio(
    freqs: number[],
    stepDuration: number,
    type: OscillatorType,
    volume: number,
    panX: number = 0,
  ): void {
    if (!this.ctx) return
    freqs.forEach((freq, i) => {
      setTimeout(() => this.beep(freq, stepDuration, type, volume, undefined, panX), i * stepDuration * 1000)
    })
  }
}
