/**
 * pware.oc.omo.constants.reviewstatus
 *
 * OMO `ulw-plan` review-lifecycle status values — the state machine that runs
 * a plan through the review lanes (momus / independent). Transitions:
 * `pending -> launching -> in_flight -> approved | changes_requested |
 * inconclusive`; `round_status` is `active` while a round is live.
 */

/** Review status: lane created, waiting to be launched. */
export const REVIEW_STATUS_PENDING = "pending"

/** Review status: reviewer process spawned, no receipt yet. */
export const REVIEW_STATUS_LAUNCHING = "launching"

/** Review status: reviewer process has a receipt and is working. */
export const REVIEW_STATUS_IN_FLIGHT = "in_flight"

/** Review status: reviewer approved the plan. */
export const REVIEW_STATUS_APPROVED = "approved"

/** Review status: reviewer requested changes. */
export const REVIEW_STATUS_CHANGES_REQUESTED = "changes_requested"

/** Review status: reviewer could not reach a verdict. */
export const REVIEW_STATUS_INCONCLUSIVE = "inconclusive"

/** Review status: a review round is live. */
export const ROUND_STATUS_ACTIVE = "active"

/** Every `ulw-plan` review-lifecycle status value. */
export const REVIEW_STATUSES = [
  REVIEW_STATUS_PENDING,
  REVIEW_STATUS_LAUNCHING,
  REVIEW_STATUS_IN_FLIGHT,
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_CHANGES_REQUESTED,
  REVIEW_STATUS_INCONCLUSIVE,
] as const

/** A single `ulw-plan` review-lifecycle status value. */
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** Terminal review statuses — a lane ends here, never resumes. */
export const TERMINAL_REVIEW_STATUSES = [
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_CHANGES_REQUESTED,
  REVIEW_STATUS_INCONCLUSIVE,
] as const
