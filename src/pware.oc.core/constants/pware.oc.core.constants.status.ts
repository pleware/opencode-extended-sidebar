/**
 * pware.oc.core.constants.status
 *
 * The plugin's canonical status vocabulary: lifecycle states normalized from
 * both domains (OpenCode session/tool statuses and OMO boulder/plan statuses)
 * plus the tool-status subset the panel renders. Every mapper in the panel
 * goes through `pware.oc.core.status.ts`; the raw strings live here.
 */

/** Canonical status: work in progress. */
export const STATUS_RUNNING = "running"

/** Canonical status: waiting for a slot or a user decision. */
export const STATUS_PENDING = "pending"

/** Canonical status: finished successfully. */
export const STATUS_COMPLETED = "completed"

/** Canonical status: failed. */
export const STATUS_ERROR = "error"

/** Canonical status: deliberately stopped, resumable. */
export const STATUS_PAUSED = "paused"

/** Canonical status: deliberately stopped, not coming back. */
export const STATUS_ABANDONED = "abandoned"

/** Canonical status: archived by the host. */
export const STATUS_ARCHIVED = "archived"

/** Canonical status: quiet / no active work. */
export const STATUS_IDLE = "idle"

/** Canonical status: no state could be determined. */
export const STATUS_UNKNOWN = "unknown"

/** Every canonical lifecycle status the panel recognizes. */
export const CANONICAL_STATUSES = [
  STATUS_RUNNING,
  STATUS_PENDING,
  STATUS_COMPLETED,
  STATUS_ERROR,
  STATUS_PAUSED,
  STATUS_ABANDONED,
  STATUS_ARCHIVED,
  STATUS_IDLE,
  STATUS_UNKNOWN,
] as const

/** A canonical lifecycle status value. */
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number]

/** Tool status: a tool call is live. */
export const TOOL_STATUS_RUNNING = STATUS_RUNNING

/** Tool status: a tool call finished successfully. */
export const TOOL_STATUS_COMPLETED = STATUS_COMPLETED

/** Tool status: a tool call failed. */
export const TOOL_STATUS_ERROR = STATUS_ERROR

/** Tool status: a tool call is queued or its state is unknown. */
export const TOOL_STATUS_PENDING = STATUS_PENDING

/** The tool-status subset of the canonical statuses. */
export const TOOL_STATUSES = [
  TOOL_STATUS_RUNNING,
  TOOL_STATUS_COMPLETED,
  TOOL_STATUS_ERROR,
  TOOL_STATUS_PENDING,
] as const

/** A tool status value the panel renders. */
export type ToolStatus = (typeof TOOL_STATUSES)[number]
