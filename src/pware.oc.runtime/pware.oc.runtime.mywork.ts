/**
 * pware.oc.core.mywork.resolver
 *
 * The "My work" queue — one list of things awaiting the user's action, from
 * two sources: an open OpenCode `question` (core, always) and an OMO plan
 * awaiting approval (optional, only when `.omo/` is present).
 */
import type { OpenQuestion } from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.js"
import type { SessionActivityState } from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import type { ApprovalItem, ReviewState } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"
import {
  MY_WORK_GROUP_DRAFTING,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
  type ApprovalGroupKind,
} from "../pware.oc.core/constants/pware.oc.core.constants.myWork.js"
import { approvalGroup, isDraftOf } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.approvalGroup.js"
import {
  QUESTION_KIND_ERROR,
  QUESTION_KIND_INTERRUPTED,
  QUESTION_KIND_QUESTION,
  type OpenQuestionKind,
} from "../pware.oc.opencode/constants/pware.oc.opencode.constants.questionKind.js"
import {
  START_WORK_MAKE_PR,
  START_WORK_PLAIN,
  START_WORK_SHIP,
  type StartWorkMode,
} from "../pware.oc.omo/constants/pware.oc.omo.constants.startWork.js"

export type { ApprovalGroupKind, OpenQuestionKind, StartWorkMode }

export type MyWorkItem =
  | {
      kind: OpenQuestionKind
      sessionId: string
      title: string
      startedAt: number | null
      /** `state.error` text for interrupted/error rows; null for an open question. */
      reason: string | null
    }
  | {
      kind: ApprovalGroupKind
      name: string
      rel: string
      pendingAction: string | null
      updatedAt: number | null
      sessionState: SessionActivityState | null
      review: ReviewState | null
    }

export type MyWorkKind = MyWorkItem["kind"]

export const MY_WORK_ORDER: readonly MyWorkKind[] = [
  QUESTION_KIND_QUESTION,
  QUESTION_KIND_INTERRUPTED,
  QUESTION_KIND_ERROR,
  MY_WORK_GROUP_READY_REVIEW,
  MY_WORK_GROUP_READY_START,
  MY_WORK_GROUP_FINISHED,
  MY_WORK_GROUP_DRAFTING,
]

const MY_WORK_LABELS: Record<MyWorkKind, string> = {
  [QUESTION_KIND_QUESTION]: "Awaiting answer",
  [QUESTION_KIND_INTERRUPTED]: "Interrupted",
  [QUESTION_KIND_ERROR]: "Errors",
  [MY_WORK_GROUP_READY_REVIEW]: "Ready to review",
  [MY_WORK_GROUP_READY_START]: "Ready to start",
  [MY_WORK_GROUP_FINISHED]: "Finished",
  [MY_WORK_GROUP_DRAFTING]: "Drafting",
}

export function myWorkLabel(kind: MyWorkKind): string {
  return MY_WORK_LABELS[kind]
}

/**
 * Why "Navigate to session" is unavailable for an approval: no writer session
 * was found in the database, or the database itself could not be opened. Null
 * when navigation is actionable.
 */
export function approvalContinueHint(
  sessionId: string | null | undefined,
  dbAvailable: boolean,
): string | null {
  if (sessionId) return null
  return dbAvailable ? "No session wrote this plan" : "Database unavailable"
}

/** The exact "start work" command text for a delivery mode and optional plan name. */
export function startWorkCommand(mode: StartWorkMode, planName?: string | null): string {
  const name = typeof planName === "string" ? planName.trim() : ""
  const base = name ? `start work ${name}` : "start work"
  if (mode === START_WORK_MAKE_PR) return `${base} --make-pr`
  if (mode === START_WORK_SHIP) return `${base} --ship`
  return base
}

export function groupMyWork(
  items: readonly MyWorkItem[],
): { kind: MyWorkKind; items: MyWorkItem[] }[] {
  const out: { kind: MyWorkKind; items: MyWorkItem[] }[] = []
  for (const kind of MY_WORK_ORDER) {
    const bucket = items.filter((i) => i.kind === kind)
    if (bucket.length > 0) out.push({ kind, items: bucket })
  }
  return out
}

/** Build the question items from an open-question read (title comes from the row). */
export function toQuestionItems(questions: readonly OpenQuestion[]): MyWorkItem[] {
  return questions.map((q) => ({
    kind: q.kind,
    sessionId: q.sessionId,
    title: q.title,
    startedAt: q.startedAt,
    reason: q.reason,
  }))
}

/** Build the approval items from a pending-approval read, dropping superseded plans. */
export function toApprovalItems(approvals: readonly ApprovalItem[]): MyWorkItem[] {
  const out: MyWorkItem[] = []
  for (const a of approvals) {
    const kind = approvalGroup(a.status, isDraftOf(a.rel))
    if (!kind) continue
    out.push({
      kind,
      name: a.name,
      rel: a.rel,
      pendingAction: a.pendingAction,
      updatedAt: a.updatedAt,
      sessionState: a.sessionState,
      review: a.review,
    })
  }
  return out
}
