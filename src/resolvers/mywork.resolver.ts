/**
 * pware.oc.core.mywork.resolver
 *
 * The "My work" queue — one list of things awaiting the user's action, from
 * two sources: an open OpenCode `question` (core, always) and an OMO plan
 * awaiting approval (optional, only when `.omo/` is present).
 */
import type { OpenQuestion } from "./opencode/question.resolver.js"
import type { ApprovalItem } from "./omo/plan.resolver.js"

export type MyWorkItem =
  | { kind: "question"; sessionId: string; title: string; startedAt: number | null }
  | { kind: "approval"; name: string; rel: string; pendingAction: string | null; updatedAt: number | null }

export type MyWorkKind = MyWorkItem["kind"]

export const MY_WORK_ORDER: readonly MyWorkKind[] = ["question", "approval"]

export function myWorkLabel(kind: MyWorkKind): string {
  return kind === "question" ? "Awaiting answer" : "Pending approval"
}

/**
 * Why "Continue" is unavailable for an approval: no writer session was found in
 * the database, or the database itself could not be opened. Null when Continue
 * is actionable.
 */
export function approvalContinueHint(
  sessionId: string | null | undefined,
  dbAvailable: boolean,
): string | null {
  if (sessionId) return null
  return dbAvailable ? "No session wrote this plan" : "Database unavailable"
}

/** Delivery mode for the OMO `start work` command (no slash, `--make-pr`/`--ship`). */
export type StartWorkMode = "plain" | "make-pr" | "ship"

/** The exact "start work" command text for a delivery mode and optional plan name. */
export function startWorkCommand(mode: StartWorkMode, planName?: string | null): string {
  const name = typeof planName === "string" ? planName.trim() : ""
  const base = name ? `start work ${name}` : "start work"
  if (mode === "make-pr") return `${base} --make-pr`
  if (mode === "ship") return `${base} --ship`
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

/** Build the question items from an open-question read, resolving session titles. */
export function toQuestionItems(
  questions: readonly OpenQuestion[],
  titleOf: (sessionId: string) => string,
): MyWorkItem[] {
  return questions.map((q) => ({
    kind: "question",
    sessionId: q.sessionId,
    title: titleOf(q.sessionId),
    startedAt: q.startedAt,
  }))
}

/** Build the approval items from a pending-approval read. */
export function toApprovalItems(approvals: readonly ApprovalItem[]): MyWorkItem[] {
  return approvals.map((a) => ({
    kind: "approval",
    name: a.name,
    rel: a.rel,
    pendingAction: a.pendingAction,
    updatedAt: a.updatedAt,
  }))
}
