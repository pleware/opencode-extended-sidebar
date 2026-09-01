/**
 * pware.oc.omo.constants.startwork
 *
 * Delivery modes for the OMO `start work` command. Built into the exact
 * command text in `pware.oc.runtime/pware.oc.runtime.mywork.ts`.
 */

/** Start-work mode: plain `start work <plan>`. */
export const START_WORK_PLAIN = "plain"

/** Start-work mode: `start work <plan> --make-pr`. */
export const START_WORK_MAKE_PR = "make-pr"

/** Start-work mode: `start work <plan> --ship`. */
export const START_WORK_SHIP = "ship"

/** Every start-work delivery mode. */
export const START_WORK_MODES = [
  START_WORK_PLAIN,
  START_WORK_MAKE_PR,
  START_WORK_SHIP,
] as const

/** A start-work delivery mode. */
export type StartWorkMode = (typeof START_WORK_MODES)[number]
