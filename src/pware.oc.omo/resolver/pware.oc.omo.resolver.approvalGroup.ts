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
  WORK_STATE_ABSENT,
  WORK_STATE_COMPLETED,
  type WorkState,
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

/**
 * True when we have trustworthy evidence the plan's work finished: a boulder
 * work completed (layer 1), or — with no boulder work for this plan — the
 * writer session's todos all completed (layer 2). Layer 2 only applies to an
 * `approved` plan; a pending/drafting plan was never cleared to start, so its
 * completed todos are the planner's, not the work's.
 */
export function planWorkDone(
  status: string | null,
  workState: WorkState,
  todosDone: boolean,
): boolean {
  const s = (status ?? "").toLowerCase()
  if (workState === WORK_STATE_COMPLETED) return true
  if (workState === WORK_STATE_ABSENT && todosDone && s === PLAN_STATUS_APPROVED) return true
  return false
}

/**
 * The effective My-work group, reconciling the (untrusted) frontmatter status
 * against boulder + db evidence. Done work → finished regardless of the
 * frontmatter (a draft stays superseded); otherwise it falls back to the pure
 * `approvalGroup` mapping, so the plugin still works with no boulder and no db.
 */
export function resolveApprovalGroup(
  status: string | null,
  isDraft: boolean,
  workState: WorkState,
  todosDone: boolean,
): ApprovalGroupKind | null {
  if (planWorkDone(status, workState, todosDone)) {
    return isDraft ? null : MY_WORK_GROUP_FINISHED
  }
  return approvalGroup(status, isDraft)
}

/** True when the group is the drafting bucket. */
export function isDrafting(g: ApprovalGroupKind | null): boolean {
  return g === MY_WORK_GROUP_DRAFTING
}

/** True when the group is waiting for the user's sign-off. */
export function isReadyToReview(g: ApprovalGroupKind | null): boolean {
  return g === MY_WORK_GROUP_READY_REVIEW
}

/** Alias for isReadyToReview — a plan awaiting approval. */
export function isWaitingApproval(g: ApprovalGroupKind | null): boolean {
  return g === MY_WORK_GROUP_READY_REVIEW
}

/** Alias for isReadyToReview — a plan pending approval. */
export function isPendingApproval(g: ApprovalGroupKind | null): boolean {
  return g === MY_WORK_GROUP_READY_REVIEW
}

/** True when the group is approved and ready to start. */
export function isReadyToStart(g: ApprovalGroupKind | null): boolean {
  return g === MY_WORK_GROUP_READY_START
}

/** True when the group is finished. */
export function isFinished(g: ApprovalGroupKind | null): boolean {
  return g === MY_WORK_GROUP_FINISHED
}
