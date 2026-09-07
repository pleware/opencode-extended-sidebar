/**
 * pware.oc.core.runtimeConfig
 *
 * The plugin's kv-persisted runtime config as one DTO. Pure — parse and mutate
 * here; the ui layer reads and writes it through the host `api.kv` (a JSON-safe
 * value: plain objects/arrays/strings/numbers/booleans/null only, no Map/Set/
 * Date/class instances).
 */

/** Runtime config persisted in the host kv store under `oes.config`. Extend as features land. */
export type RuntimeConfigDto = {
  /** Session ids pinned to the top of the My work queue, most recently pinned first. */
  pinned_sessions: string[]
}

export function emptyRuntimeConfig(): RuntimeConfigDto {
  return { pinned_sessions: [] }
}

/** Parse any kv value into a DTO, tolerating missing, malformed, or partial input. */
export function parseRuntimeConfig(raw: unknown): RuntimeConfigDto {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyRuntimeConfig()
  const o = raw as Record<string, unknown>
  const pinned = Array.isArray(o.pinned_sessions)
    ? o.pinned_sessions.filter((id): id is string => typeof id === "string" && id.length > 0)
    : []
  return { pinned_sessions: pinned }
}

/** Pin a session — idempotent; a newly pinned session moves to the front. */
export function pinSession(config: RuntimeConfigDto, sessionId: string): RuntimeConfigDto {
  if (!sessionId) return config
  const pinned = config.pinned_sessions.filter((id) => id !== sessionId)
  return { ...config, pinned_sessions: [sessionId, ...pinned] }
}

/** Unpin a session — idempotent. */
export function unpinSession(config: RuntimeConfigDto, sessionId: string): RuntimeConfigDto {
  if (!sessionId) return config
  return { ...config, pinned_sessions: config.pinned_sessions.filter((id) => id !== sessionId) }
}
