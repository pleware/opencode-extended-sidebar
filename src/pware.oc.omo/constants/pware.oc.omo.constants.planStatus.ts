/**
 * pware.oc.omo.constants.planstatus
 *
 * OMO plan/draft markdown frontmatter `status:` values that mean "waiting for
 * user sign-off" (the PENDING_STATUS set currently private in the approval
 * resolver), plus the terminal states of the plan lifecycle
 * `drafting → awaiting-approval → approved → done`.
 */

/** Plan status: awaiting the user's approval. */
export const PLAN_STATUS_AWAITING_APPROVAL = "awaiting-approval"

/** Plan status: pending approval (hyphenated spelling). */
export const PLAN_STATUS_PENDING_APPROVAL = "pending-approval"

/** Plan status: pending approval (underscore spelling). */
export const PLAN_STATUS_PENDING_APPROVAL_UNDERSCORE = "pending_approval"

/** Plan status: pending (bare spelling). */
export const PLAN_STATUS_PENDING = "pending"

/** Plan status: draft still being written — not yet awaiting approval. */
export const PLAN_STATUS_DRAFTING = "drafting"

/** Plan status: the user approved the plan. */
export const PLAN_STATUS_APPROVED = "approved"

/** Plan status: the plan finished execution. */
export const PLAN_STATUS_DONE = "done"

/** Plan `status:` values that mean the plan is waiting for user sign-off. */
export const PLAN_PENDING_STATUSES = [
  PLAN_STATUS_AWAITING_APPROVAL,
  PLAN_STATUS_PENDING_APPROVAL,
  PLAN_STATUS_PENDING_APPROVAL_UNDERSCORE,
  PLAN_STATUS_PENDING,
] as const

/** A plan `status:` value that counts as pending user approval. */
export type PlanPendingStatus = (typeof PLAN_PENDING_STATUSES)[number]

/** Work state: a boulder work for this plan finished. */
export const WORK_STATE_COMPLETED = "completed"

/** Work state: a boulder work exists but did not finish. */
export const WORK_STATE_NOT_COMPLETED = "not-completed"

/** Work state: no boulder work for this plan (or no boulder.json). */
export const WORK_STATE_ABSENT = "absent"

/**
 * How the plan's boulder work relates to "finished", for the My-work
 * reconciliation. `completed` = a boulder work for this plan finished;
 * `not-completed` = a work exists but did not finish (running / error / paused /
 * abandoned); `absent` = no boulder work for this plan (or no boulder.json).
 */
export type WorkState =
  | typeof WORK_STATE_COMPLETED
  | typeof WORK_STATE_NOT_COMPLETED
  | typeof WORK_STATE_ABSENT
