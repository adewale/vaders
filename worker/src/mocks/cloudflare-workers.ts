// Mock for cloudflare:workers module
// Used in tests to avoid Cloudflare-specific import errors

export class DurableObject<Env = unknown> {
  ctx: DurableObjectState
  env: Env

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
  }
}

export interface DurableObjectState {
  storage: DurableObjectStorage
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  acceptWebSocket(ws: WebSocket): void
  getWebSockets(): WebSocket[]
}

export interface DurableObjectStorage {
  sql: {
    exec<T = unknown>(query: string, ...params: unknown[]): { toArray(): T[] }
  }
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
  setAlarm(time: number): Promise<void>
  deleteAlarm(): Promise<void>
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

export interface DurableObjectId {
  toString(): string
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}
