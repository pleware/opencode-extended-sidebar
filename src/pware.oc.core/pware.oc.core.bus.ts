export type PwareEvent = {
  type: string
  ts: number
  data?: unknown
}

export type PwareEventListener = (evt: PwareEvent) => void

export type PwareEventBus = {
  emit: (evt: PwareEvent) => void
  on: (type: string, listener: PwareEventListener) => () => void
  off: (type: string, listener: PwareEventListener) => void
}

export function createEventBus(): PwareEventBus {
  const byType = new Map<string, Set<PwareEventListener>>()

  const off = (type: string, listener: PwareEventListener): void => {
    const set = byType.get(type)
    if (!set) return
    set.delete(listener)
    if (set.size === 0) byType.delete(type)
  }

  const on = (type: string, listener: PwareEventListener): (() => void) => {
    const set = byType.get(type)
    if (set) {
      set.add(listener)
    } else {
      byType.set(type, new Set([listener]))
    }
    return () => off(type, listener)
  }

  const emit = (evt: PwareEvent): void => {
    const set = byType.get(evt.type)
    if (!set || set.size === 0) return
    for (const listener of set) listener(evt)
  }

  return { emit, on, off }
}
