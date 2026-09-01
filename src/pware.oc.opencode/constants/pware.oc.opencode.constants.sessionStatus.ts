/**
 * pware.oc.opencode.constants.sessionstatus
 *
 * OpenCode session-domain string literals: the session status a `SessionView`
 * carries, and the finer-grained activity state used for approval rows. Both
 * derive from SQLite rows + host events in
 * `pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.ts`.
 */

/** Session status: recently updated — the agent is likely still working. */
export const SESSION_STATUS_RUNNING = "running"

/** Session status: quiet — no recent updates. */
export const SESSION_STATUS_IDLE = "idle"

/** Session status: archived by the host. */
export const SESSION_STATUS_ARCHIVED = "archived"

/** Session status: no state could be determined. */
export const SESSION_STATUS_UNKNOWN = "unknown"

/** Every session status a `SessionView` can carry. */
export const SESSION_STATUSES = [
  SESSION_STATUS_RUNNING,
  SESSION_STATUS_IDLE,
  SESSION_STATUS_ARCHIVED,
  SESSION_STATUS_UNKNOWN,
] as const

/** A session status value. */
export type AgentStatus = (typeof SESSION_STATUSES)[number]

/** Session activity state: a fresh `time_updated` — the session is streaming. */
export const SESSION_STATE_STREAMING = "streaming"

/** Session activity state: stale in SQLite but a background task is running. */
export const SESSION_STATE_AWAITING_BACKGROUND = "awaiting-background"

/** Session activity state: quiet. */
export const SESSION_STATE_IDLE = SESSION_STATUS_IDLE

/** Session activity state: archived. */
export const SESSION_STATE_ARCHIVED = SESSION_STATUS_ARCHIVED

/** Session activity state: unknown. */
export const SESSION_STATE_UNKNOWN = SESSION_STATUS_UNKNOWN

/** Every session activity state. */
export const SESSION_STATES = [
  SESSION_STATE_STREAMING,
  SESSION_STATE_AWAITING_BACKGROUND,
  SESSION_STATE_IDLE,
  SESSION_STATE_ARCHIVED,
  SESSION_STATE_UNKNOWN,
] as const

/** A session activity state. */
export type SessionState = (typeof SESSION_STATES)[number]
