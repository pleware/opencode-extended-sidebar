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
import fs from "node:fs"
import {
  planSessionIndex,
  sessionActivityState,
  type SessionActivityState,
} from "../pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import { openReadonlyDb, withDbRead } from "../pware.oc.core/pware.oc.core.sqlite.js"
import { profile } from "../pware.oc.core/pware.oc.core.debug.js"
import { basenameOf } from "../pware.oc.core/pware.oc.core.paths.js"
import { readRunContinuationState } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.approvalState.js"
import { BACKGROUND_TASK_ACTIVE } from "../pware.oc.omo/constants/pware.oc.omo.constants.backgroundTask.js"
import {
  SESSION_STATE_ARCHIVED,
  SESSION_STATE_AWAITING_BACKGROUND,
  SESSION_STATE_IDLE,
  SESSION_STATE_STREAMING,
  SESSION_STATE_UNKNOWN,
  type SessionState,
} from "../pware.oc.opencode/constants/pware.oc.opencode.constants.sessionStatus.js"
import type { ApprovalItem } from "../pware.oc.omo/resolver/pware.oc.omo.resolver.plan.js"

const STATE_LABELS: Record<SessionState, string> = {
  [SESSION_STATE_STREAMING]: "working",
  [SESSION_STATE_AWAITING_BACKGROUND]: "waiting",
  [SESSION_STATE_IDLE]: "idle",
  [SESSION_STATE_ARCHIVED]: "archived",
  [SESSION_STATE_UNKNOWN]: "unknown",
}

/** Row suffix for an approval's planner session state; null when unknown. */
export function planSessionStateLabel(state: SessionActivityState | null): string | null {
  return state ? STATE_LABELS[state.state] : null
}

function blank(items: readonly ApprovalItem[]): ApprovalItem[] {
  return items.map((item) => ({ ...item, sessionState: null }))
}

export function enrichApprovalSessionStates(
  items: readonly ApprovalItem[],
  opts: { dbPath: string | null | undefined; projectRoot: string | null | undefined; now?: number },
): ApprovalItem[] {
  if (items.length === 0) return []
  const dbPath = opts.dbPath
  const projectRoot = opts.projectRoot
  if (!dbPath || !projectRoot || !fs.existsSync(dbPath)) return blank(items)
  return profile("mywork.approvals", () =>
    withDbRead(
      () => {
        const db = openReadonlyDb(dbPath)
        if (!db) return blank(items)
        // Index once; match writers by basename across all sessions (no
        // projectId in the opts shape — same scope as sessionForPlanFile).
        const index = planSessionIndex(db, null, projectRoot)
        return items.map((item) => {
          const sessionId = index.fileWriter.get(basenameOf(item.rel))?.sessionId ?? null
          const sessionState = sessionId
            ? sessionActivityState(db, sessionId, {
                backgroundTaskActive:
                  readRunContinuationState(projectRoot, sessionId) === BACKGROUND_TASK_ACTIVE,
                now: opts.now,
              })
            : null
          return { ...item, sessionState }
        })
      },
      () => blank(items),
    ),
  )
}
