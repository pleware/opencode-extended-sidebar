/**
 * pware.oc.omo.constants.planstatus
 *
 * OMO plan/draft markdown frontmatter `status:` values that mean "waiting for
 * user sign-off" (the PENDING_STATUS set currently private in the approval
 * resolver).
 */

/** Plan status: awaiting the user's approval. */
export const PLAN_STATUS_AWAITING_APPROVAL = "awaiting-approval"

/** Plan status: pending approval (hyphenated spelling). */
export const PLAN_STATUS_PENDING_APPROVAL = "pending-approval"

/** Plan status: pending approval (underscore spelling). */
export const PLAN_STATUS_PENDING_APPROVAL_UNDERSCORE = "pending_approval"

/** Plan status: pending (bare spelling). */
export const PLAN_STATUS_PENDING = "pending"

/** Plan `status:` values that mean the plan is waiting for user sign-off. */
export const PLAN_PENDING_STATUSES = [
  PLAN_STATUS_AWAITING_APPROVAL,
  PLAN_STATUS_PENDING_APPROVAL,
  PLAN_STATUS_PENDING_APPROVAL_UNDERSCORE,
  PLAN_STATUS_PENDING,
] as const

/** A plan `status:` value that counts as pending user approval. */
export type PlanPendingStatus = (typeof PLAN_PENDING_STATUSES)[number]
