/**
 * pware.oc.runtime.mywork-enrich
 *
 * Enriches the OMO approval queue with the writer session's activity state:
 * builds the plan-file → writer-session index once, then per item resolves the
 * writer via `basenameOf(item.rel)` and asks `sessionActivityState` (SQLite
 * freshness + the omo `.omo/run-continuation` marker). Soft-fails to
 * `sessionState: null` per item — never throws. This is the runtime layer's
 * job: it composes omo (`.omo/run-continuation`) with opencode (SQLite session
 * activity).
 */
import {
  sessionActivityState,
  type SessionActivityState,
} from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import { listTodos } from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.todo.js"
import { planSessionIndex, type PlanSessionIndex } from "../pware.oc.omo/resolver/index.js"
import type { SqlDb } from "../pware.oc.core/pware.oc.core.sqlite.js"
import { readonlyReadGateway } from "../pware.oc.core/pware.oc.core.sqliteGateway.js"
import { profileAsync } from "../pware.oc.core/pware.oc.core.debug.js"
import { basenameOf } from "../pware.oc.core/pware.oc.core.paths.js"
import { readRunContinuationState } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.approvalState.js"
import { BACKGROUND_TASK_ACTIVE } from "../pware.oc.omo/constants/pware.oc.omo.constants.backgroundTask.js"
import { STATUS_COMPLETED } from "../pware.oc.core/constants/pware.oc.core.constants.status.js"
import type { ApprovalItem } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"

/**
 * An approval item with its planner-session activity attached. `sessionState`
 * is a runtime enrichment: it lives here on the runtime layer's enriched type,
 * not on omo's base `ApprovalItem` (omo must not import the opencode session type).
 */
export type EnrichedApproval = ApprovalItem & {
  sessionState: SessionActivityState | null
  /** Writer session's todos all completed (and at least one present). */
  todosDone: boolean
}

function blank(items: readonly ApprovalItem[]): EnrichedApproval[] {
  return items.map((item) => ({ ...item, sessionState: null, todosDone: false }))
}

function sessionTodosDone(db: SqlDb, sessionId: string): boolean {
  const todos = listTodos(db, sessionId)
  return todos.length > 0 && todos.every((t) => t.status === STATUS_COMPLETED)
}

type EnrichmentRead = {
  readonly index: PlanSessionIndex | null
  readonly approvals: EnrichedApproval[]
}

export async function enrichApprovalSessionStates(
  items: readonly ApprovalItem[],
  opts: { dbPath: string | null | undefined; projectRoot: string | null | undefined; now?: number },
): Promise<EnrichedApproval[]> {
  if (items.length === 0) return []
  const dbPath = opts.dbPath
  const projectRoot = opts.projectRoot
  if (!dbPath || !projectRoot) return blank(items)
  const itemStages = items.map((item) => (db: SqlDb, state: EnrichmentRead): EnrichmentRead => {
    const sessionId = state.index?.fileWriter.get(basenameOf(item.rel))?.sessionId ?? null
    const sessionState = sessionId
      ? sessionActivityState(db, sessionId, {
          backgroundTaskActive:
            readRunContinuationState(projectRoot, sessionId) === BACKGROUND_TASK_ACTIVE,
          now: opts.now,
        })
      : null
    const todosDone = sessionId ? sessionTodosDone(db, sessionId) : false
    return {
      ...state,
      approvals: [...state.approvals, { ...item, sessionState, todosDone }],
    }
  })
  const result = await profileAsync("mywork.approvals", () =>
    readonlyReadGateway.run<EnrichmentRead>({
      dbPath,
      initial: () => ({ index: null, approvals: [] }),
      stages: [
        (db, state) => ({ ...state, index: planSessionIndex(db, null, projectRoot) }),
        ...itemStages,
      ],
      fallback: () => ({ index: null, approvals: blank(items) }),
    }),
  )
  return result.approvals
}
