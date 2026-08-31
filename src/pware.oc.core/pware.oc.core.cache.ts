/**
 * Stamp-keyed in-memory cache. Optional TTL for filesystem snapshots.
 */

export function createStampCache<T>(opts?: { ttlMs?: number }): {
  get: (key: string, load: () => T) => T
  peek: (key: string) => T | undefined
  set: (key: string, value: T) => void
  reset: () => void
} {
  const ttl = opts?.ttlMs
  let cacheKey = ""
  let cached: T | undefined
  let at = 0
  return {
    get(key, load) {
      const now = Date.now()
      if (
        key &&
        key === cacheKey &&
        cached !== undefined &&
        (ttl == null || now - at < ttl)
      ) {
        return cached
      }
      const next = load()
      cacheKey = key
      cached = next
      at = now
      return next
    },
    peek(key) {
      if (!key || key !== cacheKey || cached === undefined) return undefined
      if (ttl != null && Date.now() - at >= ttl) return undefined
      return cached
    },
    set(key, value) {
      cacheKey = key
      cached = value
      at = Date.now()
    },
    reset() {
      cacheKey = ""
      cached = undefined
      at = 0
    },
  }
}
