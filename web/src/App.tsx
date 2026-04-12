import { useState, useCallback, useEffect, useRef } from 'react'
import { LaunchScreen, PLAYER_NAME_STORAGE_KEY } from './components/LaunchScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { GameScreen } from './components/GameScreen'
import { GameOverScreen } from './components/GameOverScreen'
import { LoadingSpinner } from './components/LoadingSpinner'
import { PauseOverlay } from './components/PauseOverlay'
import { ControlsCheatsheet } from './components/ControlsCheatsheet'
import { useGameConnection } from '../../client-core/src/connection/useGameConnection'
import { detectAudioTriggers } from '../../client-core/src/audio/triggers'
import { createHeldKeysTracker } from '../../client-core/src/input/heldKeys'
import { WebInputAdapter } from './adapters/WebInputAdapter'
import { WebAudioAdapter } from './adapters/WebAudioAdapter'
import { useRoute } from './hooks/useRoute'
import { navigateTo } from './router'
import { createRoom, createSoloRoom, matchmake, buildWsUrl } from './api/roomApi'
import type { VadersKey } from '../../client-core/src/adapters'
import type { VadersKey as HeldVadersKey } from '../../client-core/src/input/types'

type AppScreen = 'launch' | 'game'

export function App() {
  const route = useRoute()
  const [screen, setScreen] = useState<AppScreen>('launch')
  const [serverUrl, setServerUrl] = useState<string>('')
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || 'Player'
    } catch {
      return 'Player'
    }
  })
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [soloMode, setSoloMode] = useState(false)
  const routeHandled = useRef(false)

  // Handle initial route on mount
  useEffect(() => {
    if (routeHandled.current) return
    routeHandled.current = true

    if (route.type === 'solo') {
      createSoloRoom()
        .then(({ wsUrl }) => {
          setServerUrl(wsUrl)
          setSoloMode(true)
          setScreen('game')
        })
        .catch((err) => setLaunchError(err.message))
    } else if (route.type === 'room') {
      setServerUrl(buildWsUrl(route.code))
      setScreen('game')
    } else if (route.type === 'matchmake') {
      matchmake()
        .then(({ roomCode, wsUrl }) => {
          // Replace `/?matchmake=true` with `/room/XYZ` — pressing back from
          // the room should return to the launch screen, not re-trigger
          // matchmaking.
          navigateTo(`/room/${roomCode}`, { replace: true })
          setServerUrl(wsUrl)
          setScreen('game')
        })
        .catch((err) => {
          setLaunchError(err.message)
        })
    }
    // 'launch' → stay on launch screen
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio: initialize lazily; resume() on user gesture ────────────────
  // Browsers block AudioContext playback until a user gesture; calling
  // getAudio().resume() from click/key handlers wakes it up.

  const audioRef = useRef<WebAudioAdapter | null>(null)
  const samplesLoadKickedRef = useRef(false)
  const getAudio = useCallback((): WebAudioAdapter => {
    if (!audioRef.current) {
      try {
        audioRef.current = new WebAudioAdapter(new AudioContext())
      } catch {
        audioRef.current = new WebAudioAdapter()
      }
    }
    return audioRef.current
  }, [])

  // Lazily kick off sample loading on the first user gesture. This both
  // satisfies the browser's "audio requires gesture" rule and delays the
  // network cost until the user actually opts into audio.
  const kickSamples = useCallback(() => {
    if (samplesLoadKickedRef.current) return
    samplesLoadKickedRef.current = true
    getAudio()
      .loadSamples()
      .catch(() => {})
  }, [getAudio])

  const refreshPlayerName = useCallback(() => {
    try {
      setPlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || 'Player')
    } catch {
      // ignore
    }
  }, [])

  const handleStartSolo = useCallback(async () => {
    setLaunchError(null)
    getAudio().resume()
    kickSamples()
    refreshPlayerName()
    try {
      const { wsUrl } = await createSoloRoom()
      setServerUrl(wsUrl)
      setSoloMode(true)
      setScreen('game')
    } catch (err: any) {
      setLaunchError(err.message)
    }
  }, [getAudio, kickSamples, refreshPlayerName])

  const handleCreateRoom = useCallback(async () => {
    setLaunchError(null)
    getAudio().resume()
    kickSamples()
    refreshPlayerName()
    try {
      const { roomCode, wsUrl } = await createRoom()
      navigateTo(`/room/${roomCode}`)
      setServerUrl(wsUrl)
      setScreen('game')
    } catch (err: any) {
      setLaunchError(err.message)
    }
  }, [getAudio, kickSamples, refreshPlayerName])

  const handleJoinRoom = useCallback(
    (code: string) => {
      setLaunchError(null)
      getAudio().resume()
      kickSamples()
      refreshPlayerName()
      navigateTo(`/room/${code}`)
      setServerUrl(buildWsUrl(code))
      setScreen('game')
    },
    [getAudio, kickSamples, refreshPlayerName],
  )

  const handleMatchmake = useCallback(async () => {
    setLaunchError(null)
    getAudio().resume()
    kickSamples()
    refreshPlayerName()
    try {
      const { roomCode, wsUrl } = await matchmake()
      navigateTo(`/room/${roomCode}`)
      setServerUrl(wsUrl)
      setScreen('game')
    } catch (err: any) {
      setLaunchError(err.message)
    }
  }, [getAudio, kickSamples, refreshPlayerName])

  const handleBackToLaunch = useCallback(() => {
    setScreen('launch')
    setServerUrl('')
    // Refresh player name from storage in case it changed on the launch screen.
    try {
      setPlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || 'Player')
    } catch {
      // ignore
    }
    // Use replace so error-recovery paths back to `/` don't stack entries.
    // If the user was on `/room/XYZ` and hit an error, going back shouldn't
    // require pressing the browser-back button twice.
    navigateTo('/', { replace: true })
  }, [])

  if (screen === 'launch') {
    return (
      <>
        <LaunchScreen
          onStartSolo={handleStartSolo}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onMatchmake={handleMatchmake}
          onToggleMute={() => {
            const audio = getAudio()
            audio.resume()
            audio.setMuted(!audio.isMuted())
          }}
          onToggleMusicMute={() => {
            const audio = getAudio()
            audio.resume()
            audio.setMusicMuted(!audio.isMusicMuted())
          }}
          onMenuSound={(kind) => {
            const audio = getAudio()
            audio.resume()
            // Literal sound names (not a ternary) so the cross-frontend
            // audio-parity contract test's static extractor sees both
            // branches. See web/src/audio-parity.contract.test.ts.
            if (kind === 'navigate') audio.play('menu_navigate')
            else audio.play('menu_select')
          }}
          error={launchError}
        />
        <ControlsCheatsheet />
      </>
    )
  }

  return (
    <>
      <GameContainer
        key={serverUrl}
        serverUrl={serverUrl}
        playerName={playerName}
        soloMode={soloMode}
        onBackToLaunch={handleBackToLaunch}
        onReplay={handleStartSolo}
        getAudio={getAudio}
        kickSamples={kickSamples}
      />
      <PauseOverlay />
      <ControlsCheatsheet />
    </>
  )
}

// ─── Adapter key → heldKeys key conversion ──────────────────────────────────

/** Convert flat VadersKey (from adapters) to discriminated VadersKey (for heldKeys tracker) */
function toHeldKey(key: VadersKey): HeldVadersKey | null {
  const keyMap: Record<string, HeldVadersKey> = {
    left: { type: 'key', key: 'left' },
    right: { type: 'key', key: 'right' },
    shoot: { type: 'key', key: 'space' },
    enter: { type: 'key', key: 'enter' },
    escape: { type: 'key', key: 'escape' },
    quit: { type: 'key', key: 'q' },
    mute: { type: 'key', key: 'm' },
    solo: { type: 'key', key: 's' },
    ready: { type: 'key', key: 'r' },
    forfeit: { type: 'key', key: 'x' },
  }
  return keyMap[key] ?? null
}

// ─── GameContainer ──────────────────────────────────────────────────────────

function GameContainer({
  serverUrl,
  playerName,
  soloMode = false,
  onBackToLaunch,
  onReplay,
  getAudio,
  kickSamples,
}: {
  serverUrl: string
  playerName: string
  soloMode?: boolean
  onBackToLaunch: () => void
  onReplay: () => void
  getAudio: () => WebAudioAdapter
  kickSamples: () => void
}) {
  const {
    serverState,
    prevState,
    getRenderState,
    playerId,
    connected,
    reconnecting,
    error,
    lastEvent,
    gameResult,
    send,
    updateInput,
    shoot,
  } = useGameConnection(serverUrl, playerName)

  // ── Auto-start solo mode after connecting ─────────────────────────────

  const soloSentRef = useRef(false)
  useEffect(() => {
    if (soloMode && connected && serverState?.status === 'waiting' && !soloSentRef.current) {
      soloSentRef.current = true
      send({ type: 'start_solo' })
    }
  }, [soloMode, connected, serverState?.status, send])

  // ── Input handling ──────────────────────────────────────────────────────

  const trackerRef = useRef(createHeldKeysTracker(0))

  // Refs to avoid stale closures in the keyboard event handler.
  // The handler is set up once (deps: stable callbacks only) but needs
  // access to the latest game state for ready/unready toggling.
  const serverStateRef = useRef(serverState)
  const playerIdRef = useRef(playerId)
  serverStateRef.current = serverState
  playerIdRef.current = playerId

  useEffect(() => {
    const tracker = trackerRef.current
    const adapter = new WebInputAdapter()

    const unsubscribe = adapter.onKey((key: VadersKey, type: 'down' | 'up') => {
      // Handle action keys on keydown only
      if (type === 'down') {
        // Any keypress is a user gesture — resume AudioContext if suspended.
        // Browsers require this before AudioContext can produce sound.
        getAudio().resume()
        kickSamples()

        if (key === 'shoot') {
          shoot()
          // Mirror the TUI's `playShootSound()` (client/src/hooks/useGameAudio.ts)
          // so the local player hears their own shots. Pan stereo from the
          // local player's x: center (x=60) = 0, left edge = -1, right edge = +1.
          // Skip pan (and the sound) if we don't yet know which player we are
          // — without a slot the pan would be ambiguous.
          const curState = serverStateRef.current
          const curPlayerId = playerIdRef.current
          if (curPlayerId) {
            const player = curState?.players[curPlayerId]
            const panX = player ? Math.max(-1, Math.min(1, player.x / 60 - 1)) : 0
            getAudio().play('shoot', { panX })
          }
          // NOTE: teammate shoot audio is not played here. `detectAudioTriggers`
          // (client-core/src/audio/triggers.ts) does not derive a 'shoot'
          // trigger from bullet-count changes, so other players' shots are
          // currently silent on the web frontend. Follow-up: add a bullet-
          // spawn detector keyed to the shooter's ship x for stereo pan.
          return
        }
        if (key === 'enter' || key === 'ready') {
          const curState = serverStateRef.current
          const curPlayerId = playerIdRef.current
          // Toggle ready based on current state
          if (curState?.status === 'waiting') {
            const isReady = curPlayerId ? curState.readyPlayerIds.includes(curPlayerId) : false
            send(isReady ? { type: 'unready' } : { type: 'ready' })
          }
          return
        }
        if (key === 'solo') {
          if (serverStateRef.current?.status === 'waiting') {
            send({ type: 'start_solo' })
          }
          return
        }
        if (key === 'forfeit') {
          send({ type: 'forfeit' })
          return
        }
        if (key === 'escape' || key === 'quit') {
          onBackToLaunch()
          return
        }
        if (key === 'mute') {
          const audio = getAudio()
          audio.setMuted(!audio.isMuted())
          return
        }
      }

      // Movement keys: feed to held-keys tracker
      const heldKey = toHeldKey(key)
      if (!heldKey) return

      const changed = type === 'down' ? tracker.onPress(heldKey) : tracker.onRelease(heldKey)

      if (changed) {
        updateInput({ left: tracker.held.left, right: tracker.held.right })
      }
    })

    return () => {
      unsubscribe()
      tracker.cleanup()
    }
  }, [send, updateInput, shoot, onBackToLaunch, getAudio, kickSamples])

  // ── Tab visibility: release all keys when tab hidden ──────────────────

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const tracker = trackerRef.current
        // Release both directions
        tracker.onRelease({ type: 'key', key: 'left' })
        tracker.onRelease({ type: 'key', key: 'right' })
        updateInput({ left: false, right: false })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [updateInput])

  // ── Window blur: release all keys ─────────────────────────────────────

  useEffect(() => {
    const handleBlur = () => {
      const tracker = trackerRef.current
      tracker.onRelease({ type: 'key', key: 'left' })
      tracker.onRelease({ type: 'key', key: 'right' })
      updateInput({ left: false, right: false })
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [updateInput])

  // ── Audio triggers: play sounds based on game state changes ─────────

  useEffect(() => {
    if (!serverState) return

    const triggers = detectAudioTriggers(prevState, serverState, playerId)
    const audio = getAudio()

    // For alien_killed, compute a stereo pan from the x position of the
    // alien that disappeared between prev and current state. Mapping:
    // x ∈ [0, 120] → panX ∈ [-1, +1].
    let killedAlienPanX: number | null = null
    if (prevState && triggers.sounds.includes('alien_killed')) {
      const currentAlienIds = new Set(serverState.entities.filter((e) => e.kind === 'alien').map((e) => e.id))
      const killed = prevState.entities.filter((e) => e.kind === 'alien' && !currentAlienIds.has(e.id))
      if (killed.length > 0) {
        // Use the first removed alien (there is usually one per tick).
        const alienX = killed[0].x
        killedAlienPanX = Math.max(-1, Math.min(1, alienX / 60 - 1))
      }
    }

    for (const sound of triggers.sounds) {
      if (sound === 'alien_killed' && killedAlienPanX !== null) {
        audio.play(sound, { panX: killedAlienPanX })
      } else {
        audio.play(sound)
      }
    }
    if (triggers.startMusic) audio.startMusic(serverState.wave)
    if (triggers.stopMusic) audio.stopMusic()
  }, [serverState, prevState, playerId, getAudio])

  // ── Screen routing ────────────────────────────────────────────────────

  // No state received yet (either not connected, or connected but sync not arrived)
  if (!serverState) {
    return (
      <div
        style={{
          width: 960,
          height: 576,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          color: '#fff',
        }}
      >
        {error ? (
          <>
            <p style={{ color: '#f44' }}>{error}</p>
            <button onClick={onBackToLaunch} style={{ marginTop: 20, cursor: 'pointer', padding: '8px 24px' }}>
              Back to Menu
            </button>
          </>
        ) : (
          <>
            <LoadingSpinner label={reconnecting ? 'Reconnecting...' : 'Connecting...'} />
            <button onClick={onBackToLaunch} style={{ marginTop: 20, cursor: 'pointer', padding: '8px 24px' }}>
              Cancel
            </button>
          </>
        )}
      </div>
    )
  }

  // Have state but disconnected (brief disconnection, state still cached)
  if (!connected && serverState) {
    return (
      <div
        style={{
          width: 960,
          height: 576,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          color: '#fff',
        }}
      >
        {reconnecting ? (
          <LoadingSpinner label="Connection lost. Reconnecting..." />
        ) : (
          <p style={{ color: '#ff0' }}>Connection lost.</p>
        )}
        {error && <p style={{ color: '#f44', marginTop: 8 }}>{error}</p>}
        <button onClick={onBackToLaunch} style={{ marginTop: 20, cursor: 'pointer', padding: '8px 24px' }}>
          Back to Menu
        </button>
      </div>
    )
  }

  // At this point serverState is non-null
  const state = serverState!

  if (state.status === 'waiting') {
    return (
      <LobbyScreen
        state={state}
        playerId={playerId}
        onReady={() => send({ type: 'ready' })}
        onUnready={() => send({ type: 'unready' })}
        onStartSolo={() => send({ type: 'start_solo' })}
      />
    )
  }

  if (state.status === 'game_over') {
    return <GameOverScreen state={state} playerId={playerId} onReplay={onReplay} onQuit={onBackToLaunch} />
  }

  // countdown, wipe_exit, wipe_hold, wipe_reveal, playing
  const renderState = getRenderState() ?? state
  return <GameScreen state={renderState} playerId={playerId} prevState={prevState} />
}
