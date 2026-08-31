/**
 * pware.oc.omo.constants.boulderstatus
 *
 * OMO boulder.json work/task status values. The plugin normalizes them via
 * core `normalizeStatus`, but the raw boulder strings belong here.
 */

/** Boulder status: work in progress. */
export const BOULDER_STATUS_IN_PROGRESS = "in_progress"

/** Boulder status: actively running. */
export const BOULDER_STATUS_RUNNING = "running"

/** Boulder status: queued / waiting for a slot. */
export const BOULDER_STATUS_PENDING = "pending"

/** Boulder status: completed. */
export const BOULDER_STATUS_COMPLETED = "completed"

/** Boulder status: errored. */
export const BOULDER_STATUS_ERROR = "error"

/** Boulder status: paused. */
export const BOULDER_STATUS_PAUSED = "paused"

/** Boulder status: abandoned. */
export const BOULDER_STATUS_ABANDONED = "abandoned"

/** Boulder status: cancelled. */
export const BOULDER_STATUS_CANCELLED = "cancelled"

/** Raw boulder.json work/task status values. */
export const BOULDER_STATUSES = [
  BOULDER_STATUS_IN_PROGRESS,
  BOULDER_STATUS_RUNNING,
  BOULDER_STATUS_PENDING,
  BOULDER_STATUS_COMPLETED,
  BOULDER_STATUS_ERROR,
  BOULDER_STATUS_PAUSED,
  BOULDER_STATUS_ABANDONED,
  BOULDER_STATUS_CANCELLED,
] as const

/** A raw boulder.json work/task status value. */
export type BoulderStatus = (typeof BOULDER_STATUSES)[number]
