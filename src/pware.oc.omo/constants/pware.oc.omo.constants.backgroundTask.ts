/**
 * pware.oc.omo.constants.backgroundtask
 *
 * `.omo/run-continuation/<sessionID>.json` → `sources["background-task"].state`
 * values.
 */

/** Background-task state: a background task is actively running. */
export const BACKGROUND_TASK_ACTIVE = "active"

/** Background-task state: no background task is running. */
export const BACKGROUND_TASK_IDLE = "idle"

/** The `sources["background-task"].state` values a run-continuation marker can hold. */
export const BACKGROUND_TASK_STATES = [BACKGROUND_TASK_ACTIVE, BACKGROUND_TASK_IDLE] as const

/** A single run-continuation background-task state value. */
export type BackgroundTaskState = (typeof BACKGROUND_TASK_STATES)[number]
