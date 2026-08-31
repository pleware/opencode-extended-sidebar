/**
 * pware.oc.core.mywork.resolver
 *
 * The "My work" queue — one list of things awaiting the user's action, from
 * two sources: an open OpenCode `question` (core, always) and an OMO plan
 * awaiting approval (optional, only when `.omo/` is present).
 */
import type { OpenQuestion } from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.question.js"
import type { SessionActivityState } from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import type { ApprovalItem } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"

export type MyWorkItem =
  | { kind: "question"; sessionId: string; title: string; startedAt: number | null }
  | {
      kind: "pending" | "working" | "idle"
      name: string
      rel: string
      pendingAction: string | null
      updatedAt: number | null
      sessionState: SessionActivityState | null
    }

export type MyWorkKind = MyWorkItem["kind"]

export const MY_WORK_ORDER: readonly MyWorkKind[] = ["question", "pending", "working", "idle"]

const MY_WORK_LABELS: Record<MyWorkKind, string> = {
  question: "Awaiting answer",
  pending: "Pending approval",
  working: "Working",
  idle: "Idle",
}

export function myWorkLabel(kind: MyWorkKind): string {
  return MY_WORK_LABELS[kind]
}

/**
 * Which approval group a plan belongs to, from its planner session state:
 * `working` while the session streams or awaits a background task, `idle`
 * when the session is idle or archived, `pending` when no session state is
 * known — the plan is genuinely just waiting for the user's sign-off.
 */
export function approvalGroup(
  state: SessionActivityState | null | undefined,
): "pending" | "working" | "idle" {
  if (!state) return "pending"
  if (state.state === "streaming" || state.state === "awaiting-background") return "working"
  if (state.state === "idle" || state.state === "archived") return "idle"
  return "pending"
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

/** Build the question items from an open-question read (title comes from the row). */
export function toQuestionItems(questions: readonly OpenQuestion[]): MyWorkItem[] {
  return questions.map((q) => ({
    kind: "question",
    sessionId: q.sessionId,
    title: q.title,
    startedAt: q.startedAt,
  }))
}

/** Build the approval items from a pending-approval read. */
export function toApprovalItems(approvals: readonly ApprovalItem[]): MyWorkItem[] {
  return approvals.map((a) => ({
    kind: approvalGroup(a.sessionState),
    name: a.name,
    rel: a.rel,
    pendingAction: a.pendingAction,
    updatedAt: a.updatedAt,
    sessionState: a.sessionState,
  }))
}
