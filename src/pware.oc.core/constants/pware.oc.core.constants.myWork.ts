/**
 * pware.oc.core.constants.mywork
 *
 * The "My work" queue's own grouping vocabulary. A plan lands in one of these
 * groups from its OMO status plus whether it is still a draft;
 * `pware.oc.runtime/pware.oc.runtime.mywork.ts` is the only place that
 * decides the group.
 */

/** My work group: a draft still being written — preview it, nothing to sign yet. */
export const MY_WORK_GROUP_DRAFTING = "drafting"

/** My work group: written and waiting for the user's review (sign-off). */
export const MY_WORK_GROUP_READY_REVIEW = "ready-to-review"

/** My work group: approved and ready for the user to start work. */
export const MY_WORK_GROUP_READY_START = "ready-to-start"

/** My work group: done — a follow-up only if something remains. */
export const MY_WORK_GROUP_FINISHED = "finished"
export const MY_WORK_GROUP_DISMISSED = "dismissed"

/**
 * My work group: draft documents that no action group covers — a draft file
 * whose status is approved/done (superseded), unknown, or absent. Listed for
 * browsing (preview), never for an action.
 */
export const MY_WORK_GROUP_DRAFT_DOCS = "draft-docs"

/** My work group: the project's recent sessions — jump straight back into any of them. */
export const MY_WORK_GROUP_SESSIONS = "sessions"

/** Every "My work" approval group. */
export const MY_WORK_GROUPS = [
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_DRAFTING,
] as const

/** A "My work" approval group. */
export type ApprovalGroupKind = (typeof MY_WORK_GROUPS)[number]
