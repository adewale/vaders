// client/src/App.tsx
// Main application component

import { useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useKeyboard, useRenderer } from '@opentui/react'
import { useGameConnection } from './hooks/useGameConnection'
import { LaunchScreen } from './components/LaunchScreen'
import { LobbyScreen, getLobbyMenuItemCount } from './components/LobbyScreen'
import { GameScreen } from './components/GameScreen'
import { GameOverScreen, getGameOverMenuItemCount } from './components/GameOverScreen'
import { normalizeKey, createHeldKeysTracker } from './input'
import { usesDiscreteMovement } from './terminal'
import { debugLog, clearDebugLog } from './debug'
import { useTerminalSize, STANDARD_WIDTH, STANDARD_HEIGHT } from './hooks/useTerminalSize'
import { useGameAudio, playShootSound, playMenuNavigateSound, playMenuSelectSound } from './hooks/useGameAudio'
import { AudioManager, MusicManager } from './audio'

const VERSION = '1.0.0'
const SERVER_URL = process.env.VADERS_SERVER ?? 'http://localhost:8787'
const LOG_PATH = process.env.VADERS_LOG_PATH ?? ''

/** Construct WebSocket URL for a room from the HTTP server URL */
function getRoomWsUrl(roomCode: string): string {
  return `${SERVER_URL.replace('http', 'ws')}/room/${roomCode}/ws`
}

type AppScreen = 'launch' | 'connecting' | 'game'

interface AppState {
  screen: AppScreen
  roomUrl: string | null
  playerName: string
  error: string | null
  autoStartSolo?: boolean
}

export function App({
  roomCode: initialRoomCode,
  playerName: initialPlayerName,
  matchmake: initialMatchmake,
  solo: initialSolo,
}: {
  roomCode?: string
  playerName: string
  matchmake: boolean
  solo: boolean
}) {
  const renderer = useRenderer()

  const [appState, setAppState] = useState<AppState>({
    screen: initialRoomCode || initialMatchmake || initialSolo ? 'connecting' : 'launch',
    roomUrl: null,
    playerName: initialPlayerName,
    error: null,
  })

  // Connect if we have initial room code, matchmake flag, or solo flag
  useEffect(() => {
    if (initialRoomCode) {
      setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(initialRoomCode) }))
    } else if (initialMatchmake) {
      fetch(`${SERVER_URL}/matchmake`)
        .then(res => res.json())
        .then(({ roomCode }: { roomCode: string }) => {
          setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(roomCode) }))
        })
        .catch(() => {
          setAppState(s => ({ ...s, screen: 'launch', error: 'Failed to matchmake' }))
        })
    } else if (initialSolo) {
      // Auto-create room for solo play
      fetch(`${SERVER_URL}/room`, { method: 'POST' })
        .then(res => res.json())
        .then(({ roomCode }: { roomCode: string }) => {
          setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(roomCode), autoStartSolo: true }))
        })
        .catch(() => {
          setAppState(s => ({ ...s, screen: 'launch', error: 'Failed to create room' }))
        })
    }
  }, [initialRoomCode, initialMatchmake, initialSolo])

  // Handle launch screen actions
  const handleStartSolo = useCallback(() => {
    setAppState(s => ({ ...s, screen: 'connecting' }))
    fetch(`${SERVER_URL}/room`, { method: 'POST' })
      .then(res => res.json())
      .then(({ roomCode }: { roomCode: string }) => {
        setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(roomCode), autoStartSolo: true }))
      })
      .catch(() => {
        setAppState(s => ({ ...s, screen: 'launch', error: 'Failed to create room' }))
      })
  }, [])

  const handleCreateRoom = useCallback(() => {
    setAppState(s => ({ ...s, screen: 'connecting' }))
    fetch(`${SERVER_URL}/room`, { method: 'POST' })
      .then(res => res.json())
      .then(({ roomCode }: { roomCode: string }) => {
        setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(roomCode) }))
      })
      .catch(() => {
        setAppState(s => ({ ...s, screen: 'launch', error: 'Failed to create room' }))
      })
  }, [])

  const handleJoinRoom = useCallback((code: string) => {
    setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(code) }))
  }, [])

  const handleMatchmake = useCallback(() => {
    setAppState(s => ({ ...s, screen: 'connecting' }))
    fetch(`${SERVER_URL}/matchmake`)
      .then(res => res.json())
      .then(({ roomCode }: { roomCode: string }) => {
        setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(roomCode) }))
      })
      .catch(() => {
        setAppState(s => ({ ...s, screen: 'launch', error: 'Failed to matchmake' }))
      })
  }, [])

  // Handle main menu - go back to launch screen (must be before conditional returns)
  const handleMainMenu = useCallback(() => {
    setAppState(s => ({ ...s, screen: 'launch', roomUrl: null, error: null, autoStartSolo: false }))
  }, [])

  // Handle play again - create new room and restart with same settings
  const handlePlayAgain = useCallback(() => {
    setAppState(s => ({ ...s, screen: 'connecting' }))
    fetch(`${SERVER_URL}/room`, { method: 'POST' })
      .then(res => res.json())
      .then(({ roomCode }: { roomCode: string }) => {
        setAppState(s => ({ ...s, screen: 'game', roomUrl: getRoomWsUrl(roomCode), autoStartSolo: true }))
      })
      .catch(() => {
        setAppState(s => ({ ...s, screen: 'launch', error: 'Failed to create room' }))
      })
  }, [])

  const { terminalWidth, terminalHeight, gameWidth, gameHeight, isTooSmall } = useTerminalSize()

  // Show warning if terminal is too small
  if (isTooSmall) {
    return (
      <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center" flexDirection="column">
        <text fg="red"><b>Terminal Too Small</b></text>
        <box height={1} />
        <text fg="white">Required: {STANDARD_WIDTH}×{STANDARD_HEIGHT}</text>
        <text fg="gray">Current: {terminalWidth}×{terminalHeight}</text>
        <box height={1} />
        <text fg="gray">Please resize your terminal.</text>
      </box>
    )
  }

  // Render based on screen state
  if (appState.screen === 'launch') {
    return (
      <LaunchScreen
        onStartSolo={handleStartSolo}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onMatchmake={handleMatchmake}
        version={VERSION}
        serverUrl={SERVER_URL}
        logPath={LOG_PATH}
      />
    )
  }

  if (appState.screen === 'connecting' || !appState.roomUrl) {
    return (
      <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center">
        <text fg="cyan">Connecting to server...</text>
      </box>
    )
  }

  return (
    <GameContainer
      roomUrl={appState.roomUrl}
      playerName={appState.playerName}
      autoStartSolo={appState.autoStartSolo ?? false}
      onPlayAgain={handlePlayAgain}
      onMainMenu={handleMainMenu}
    />
  )
}

// Separate component with unified keyboard handling for all game screens
function GameContainer({
  roomUrl,
  playerName,
  autoStartSolo,
  onPlayAgain,
  onMainMenu,
}: {
  roomUrl: string
  playerName: string
  autoStartSolo: boolean
  onPlayAgain: () => void
  onMainMenu: () => void
}) {
  const renderer = useRenderer()
  const { getRenderState, playerId, send, connected, updateInput, move, shoot } = useGameConnection(
    roomUrl,
    playerName
  )

  // Check if we should use discrete movement (for terminals without key release events)
  const discreteMovement = usesDiscreteMovement()

  // Clear debug log on mount
  useEffect(() => {
    clearDebugLog()
    debugLog('init', 'GameContainer mounted')
  }, [])

  // Track held keys for continuous movement input using tested helper
  const keyTracker = useRef(createHeldKeysTracker())
  const autoStartSent = useRef(false)

  // Menu selection state for lobby and game over screens
  const [menuIndex, setMenuIndex] = useState(0)

  // Audio mute states (separate for SFX and music)
  const [isMuted, setIsMuted] = useState(() => AudioManager.getInstance().isMuted())
  const [isMusicMuted, setIsMusicMuted] = useState(() => MusicManager.getInstance().isMuted())

  // Get current game state
  const state = getRenderState()
  const gameStatus = state?.status
  const playerCount = state ? Object.keys(state.players).length : 0
  const isReady = state && playerId ? state.readyPlayerIds.includes(playerId) : false

  // Use refs for values that need to be current inside keyboard callback
  // This prevents stale closure issues where the callback captures old values
  const gameStatusRef = useRef(gameStatus)
  const menuIndexRef = useRef(menuIndex)
  const playerCountRef = useRef(playerCount)
  const isReadyRef = useRef(isReady)

  // Keep refs in sync with state - use useLayoutEffect for synchronous updates
  // This ensures refs are updated before the next keyboard event can fire
  useLayoutEffect(() => { gameStatusRef.current = gameStatus }, [gameStatus])
  useLayoutEffect(() => { menuIndexRef.current = menuIndex }, [menuIndex])
  useLayoutEffect(() => { playerCountRef.current = playerCount }, [playerCount])
  useLayoutEffect(() => { isReadyRef.current = isReady }, [isReady])

  // Track previous status to detect transitions
  const prevStatusRef = useRef(gameStatus)

  // Audio hook - triggers sounds on state changes
  useGameAudio(state, playerId)

  // Reset menu index when screen changes, only reset keys when LEAVING gameplay
  useEffect(() => {
    setMenuIndex(0)
    const prevStatus = prevStatusRef.current
    prevStatusRef.current = gameStatus

    debugLog('status', 'Game status changed', {
      from: prevStatus,
      to: gameStatus,
      heldBefore: { ...keyTracker.current.held },
    })

    // Only reset held keys when leaving gameplay (to menu screens)
    // Don't reset when entering gameplay (would clear legitimate key presses)
    const wasInGameplay = prevStatus === 'playing' || prevStatus === 'countdown'
    const nowInGameplay = gameStatus === 'playing' || gameStatus === 'countdown'
    if (wasInGameplay && !nowInGameplay) {
      debugLog('status', 'Resetting key tracker (leaving gameplay)')
      keyTracker.current.cleanup()  // Clear any pending timeouts
      keyTracker.current = createHeldKeysTracker()
    }
  }, [gameStatus])

  // Auto-start solo mode when connected and in waiting state
  useEffect(() => {
    if (autoStartSolo && connected && state?.status === 'waiting' && !autoStartSent.current) {
      autoStartSent.current = true
      send({ type: 'start_solo' })
    }
  }, [autoStartSolo, connected, state?.status, send])

  // Note: Movement is now discrete (one step per key press/repeat)
  // No continuous interval needed - each keyboard event triggers movement

  // Get menu item count for current screen (uses ref for current value)
  const getMenuItemCount = useCallback((): number => {
    const status = gameStatusRef.current
    if (!status) return 0
    switch (status) {
      case 'waiting':
        return getLobbyMenuItemCount(playerCountRef.current)
      case 'game_over':
        return getGameOverMenuItemCount(true, true)  // Play Again + Main Menu + Quit
      default:
        return 0
    }
  }, [])

  // Handle menu selection for lobby (uses refs for current values)
  const handleLobbySelect = useCallback((index: number) => {
    if (playerCountRef.current === 1) {
      if (index === 0) {
        // Ready/Unready
        if (isReadyRef.current) send({ type: 'unready' })
        else send({ type: 'ready' })
      } else if (index === 1) {
        // Start Solo
        send({ type: 'start_solo' })
      }
    } else {
      // Only ready/unready option
      if (isReadyRef.current) send({ type: 'unready' })
      else send({ type: 'ready' })
    }
  }, [send])

  // Handle menu selection for game over
  const handleGameOverSelect = useCallback((index: number) => {
    switch (index) {
      case 0:  // Play Again
        onPlayAgain()
        break
      case 1:  // Main Menu
        onMainMenu()
        break
      case 2:  // Quit
        MusicManager.getInstance().stop()
        renderer.destroy()
        process.exit(0)
        break
    }
  }, [onPlayAgain, onMainMenu, renderer])

  // Single unified keyboard handler - uses refs to avoid stale closures
  // Wrapped in try-catch to prevent uncaught errors from killing the handler
  useKeyboard((event) => {
    try {
      const isPress = event.eventType === 'press'
      const isRelease = event.eventType === 'release'
      const isRepeated = event.repeated

      const key = normalizeKey(event)
      if (!key) return

      // Read current values from refs (not stale closure values)
      const currentStatus = gameStatusRef.current
      const currentMenuIndex = menuIndexRef.current
      const currentPlayerCount = playerCountRef.current

      // Debug log every keyboard event
      debugLog('key', 'Keyboard event', {
        keyType: key.type,
        keyValue: key.type === 'key' ? key.key : key.char,
        eventType: event.eventType,
        repeated: isRepeated,
        status: currentStatus,
        held: { ...keyTracker.current.held },
      })

      // Handle Q to quit from any screen (non-repeated only)
      if (key.type === 'key' && key.key === 'q' && isPress && !isRepeated) {
        MusicManager.getInstance().stop()
        renderer.destroy()
        process.exit(0)
      }

      // Handle M to toggle sound effects mute (skip in game_over - M is Main Menu hotkey)
      if (key.type === 'key' && key.key === 'm' && isPress && !isRepeated) {
        if (currentStatus !== 'game_over') {
          const muted = AudioManager.getInstance().toggleMute()
          setIsMuted(muted)
          return
        }
      }

      // Handle N to toggle music mute from any screen
      if (key.type === 'key' && key.key === 'n' && isPress && !isRepeated) {
        const musicMuted = MusicManager.getInstance().toggleMute()
        setIsMusicMuted(musicMuted)
        // If unmuting and game is playing, restart music
        if (!musicMuted && (currentStatus === 'playing' || currentStatus === 'countdown')) {
          MusicManager.getInstance().start()
        }
        return
      }

    // IMPORTANT: Always process key releases for movement keys, regardless of game status
    // This prevents "stuck" keys when transitioning between screens mid-keypress
    if (isRelease) {
      const changed = keyTracker.current.onRelease(key)
      debugLog('release', 'Key release processed', {
        keyType: key.type,
        keyValue: key.type === 'key' ? key.key : key.char,
        changed,
        held: { ...keyTracker.current.held },
      })
      if (changed) {
        // Only send update if still in gameplay (avoid sending during menus)
        if (currentStatus === 'playing' || currentStatus === 'countdown') {
          updateInput(keyTracker.current.held)
        }
      }
      // Always return early for release events to prevent further processing
      if (key.type === 'key' && (key.key === 'left' || key.key === 'right')) {
        return
      }
    }

    // During gameplay: handle movement and shooting
    if (currentStatus === 'playing' || currentStatus === 'countdown') {
      // Movement keys
      if (key.type === 'key' && (key.key === 'left' || key.key === 'right')) {
        if (isPress) {
          if (discreteMovement) {
            // Discrete mode: each press/repeat moves one step (no skating on release)
            move(key.key)
            debugLog('press', 'Discrete move', { key: key.key })
          } else {
            // Held state mode: track held state for continuous movement
            keyTracker.current.onPress(key)
            debugLog('press', 'Movement key pressed', {
              key: key.key,
              held: { ...keyTracker.current.held },
            })
            updateInput(keyTracker.current.held)
          }
        }
        // Note: releases are handled above before the status check
        return
      }

      // Shoot on press only (non-repeated)
      if (key.type === 'key' && key.key === 'space' && isPress && !isRepeated) {
        shoot()
        playShootSound()
        return
      }
    }

    // Menu navigation (waiting, game_over screens) - skip repeated keys
    if (currentStatus === 'waiting' || currentStatus === 'game_over') {
      if (!isPress || isRepeated) return

      const itemCount = getMenuItemCount()
      if (itemCount === 0) return

      if (key.type === 'key') {
        switch (key.key) {
          case 'up':
            setMenuIndex(i => (i - 1 + itemCount) % itemCount)
            playMenuNavigateSound()
            break
          case 'down':
            setMenuIndex(i => (i + 1) % itemCount)
            playMenuNavigateSound()
            break
          case 'enter':
          case 'space':
            playMenuSelectSound()
            if (currentStatus === 'waiting') {
              handleLobbySelect(currentMenuIndex)
            } else if (currentStatus === 'game_over') {
              handleGameOverSelect(currentMenuIndex)
            }
            break
          // Hotkeys for game over
          case 'r':
            if (currentStatus === 'game_over') {
              onPlayAgain()
            }
            break
          case 'm':
            if (currentStatus === 'game_over') {
              onMainMenu()
            }
            break
        }
      }

      // Hotkey: S for solo start
      if (key.type === 'key' && key.key === 's' && currentStatus === 'waiting' && currentPlayerCount === 1) {
        send({ type: 'start_solo' })
      }
    }
    } catch (err) {
      // Log but don't re-throw - prevents errors from killing the keyboard handler
      debugLog('error', 'Keyboard handler error', { error: String(err), stack: (err as Error)?.stack })
      // eslint-disable-next-line no-console
      console.error('Keyboard handler error:', err)
    }
  }, { release: true })

  const { terminalWidth, terminalHeight } = useTerminalSize()

  // Render appropriate screen
  if (!connected || !state || !playerId) {
    return (
      <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center">
        <text fg="cyan">Connecting to server...</text>
      </box>
    )
  }

  switch (state.status) {
    case 'waiting':
      return (
        <LobbyScreen
          state={state}
          currentPlayerId={playerId}
          selectedIndex={menuIndex}
          onReady={() => send({ type: 'ready' })}
          onUnready={() => send({ type: 'unready' })}
          onStartSolo={() => send({ type: 'start_solo' })}
        />
      )
    case 'countdown':
    case 'playing':
      return <GameScreen state={state} currentPlayerId={playerId} isMuted={isMuted} isMusicMuted={isMusicMuted} />
    case 'game_over':
      return (
        <GameOverScreen
          state={state}
          currentPlayerId={playerId}
          selectedIndex={menuIndex}
          onPlayAgain={onPlayAgain}
          onMainMenu={onMainMenu}
        />
      )
    default:
      return null
  }
}
