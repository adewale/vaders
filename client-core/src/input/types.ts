// client-core/src/input/types.ts
// Platform-agnostic key types

export type VadersKey =
  | {
      type: 'key'
      key: 'left' | 'right' | 'up' | 'down' | 'space' | 'enter' | 'escape' | 'q' | 'm' | 'n' | 's' | 'r' | 'x'
    }
  | { type: 'char'; char: string } // For text input (room codes, names)
