/**
 * pware.oc.omo.resolver.approvalGroup
 *
 * Which "My work" approval group a plan belongs to, from its OMO plan status
 * alone, plus whether a plan path is still a draft. Lives in omo (not core)
 * because it consumes the OMO plan-status constants; core may not import them.
 */
import {
  MY_WORK_GROUP_DRAFTING,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
  type ApprovalGroupKind,
} from "../../pware.oc.core/constants/pware.oc.core.constants.myWork.js"
import {
  PLAN_PENDING_STATUSES,
  PLAN_STATUS_APPROVED,
  PLAN_STATUS_DONE,
  PLAN_STATUS_DRAFTING,
} from "../../pware.oc.omo/constants/pware.oc.omo.constants.planStatus.js"

/** The pending sign-off set widened so `.includes()` accepts any status string. */
const PENDING_STATUSES: readonly string[] = PLAN_PENDING_STATUSES

/**
 * Which approval group a plan belongs to, from its OMO status alone:
 * `drafting` while still a draft, `ready-to-review` for a pending status,
 * `ready-to-start` for an approved plan, `finished` for a done plan. Null when
 * the item is superseded — an approved or done draft, or an unknown status —
 * and must not be shown.
 */
export function approvalGroup(
  status: string | null,
  isDraft: boolean,
): ApprovalGroupKind | null {
  const s = (status ?? "").toLowerCase()
  if (s === PLAN_STATUS_DRAFTING) return MY_WORK_GROUP_DRAFTING
  if (PENDING_STATUSES.includes(s)) return MY_WORK_GROUP_READY_REVIEW
  if (s === PLAN_STATUS_APPROVED) return isDraft ? null : MY_WORK_GROUP_READY_START
  if (s === PLAN_STATUS_DONE) return isDraft ? null : MY_WORK_GROUP_FINISHED
  return null
}

/** True when a plan path points at a draft still being written, not a final plan. */
export function isDraftOf(rel: string): boolean {
  return rel.startsWith("drafts/") || rel.startsWith(".sisyphus/drafts/")
}
