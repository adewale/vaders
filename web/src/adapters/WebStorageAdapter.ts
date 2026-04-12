import type { StorageAdapter } from '../../../client-core/src/adapters'

export class WebStorageAdapter implements StorageAdapter {
  private storage: Storage

  constructor(storage: Storage = localStorage) {
    this.storage = storage
  }

  get(key: string): string | null {
    return this.storage.getItem(key)
  }

  set(key: string, value: string): void {
    this.storage.setItem(key, value)
  }
}
