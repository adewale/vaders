import type { FrameScheduler } from '../../../client-core/src/adapters'

export class WebFrameScheduler implements FrameScheduler {
  requestFrame(callback: () => void): number {
    return requestAnimationFrame(callback)
  }

  cancelFrame(handle: number): void {
    cancelAnimationFrame(handle)
  }
}
