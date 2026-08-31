/**
 * pware.oc.core.omo.resolver.approvalstate
 *
 * Enriches the approval queue with the planner session's activity state: for
 * each pending approval it resolves the writer session via `sessionForPlanFile`
 * and asks `sessionActivityState` (SQLite freshness + `.omo/run-continuation`
 * marker). Soft-fails to `sessionState: null` per item — never throws.
 */
import fs from "node:fs"
import path from "node:path"
import {
  sessionActivityState,
  sessionForPlanFile,
  type SessionActivityState,
} from "../../pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import { openReadonlyDb, withDbRead } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import { BACKGROUND_TASK_ACTIVE } from "../constants/pware.oc.omo.constants.backgroundTask.js"
import { findOmoWatchDirs } from "./pware.oc.omo.resolver.boulder.js"
import type { ApprovalItem } from "./pware.oc.omo.resolver.plan.js"

const STATE_LABELS: Record<SessionActivityState["state"], string> = {
  streaming: "working",
  "awaiting-background": "waiting",
  idle: "idle",
  archived: "archived",
  unknown: "unknown",
}

/** Row suffix for an approval's planner session state; null when unknown. */
export function planSessionStateLabel(state: SessionActivityState | null): string | null {
  return state ? STATE_LABELS[state.state] : null
}

/** First existing `.omo`/`.sisyphus` run-continuation directory, or null. */
export function firstRunContinuationDir(projectRoot: string): string | null {
  for (const omoDir of findOmoWatchDirs(projectRoot)) {
    const p = path.join(omoDir, "run-continuation")
    if (fs.existsSync(p)) return p
  }
  return null
}

/**
 * The `.omo/run-continuation` background-task state for a session, or null when
 * absent/unreadable. Lives in the omo layer — opencode must not read omo files.
 */
export function readRunContinuationState(
  projectRoot: string | null | undefined,
  sessionId: string,
): string | null {
  if (!projectRoot) return null
  const dir = firstRunContinuationDir(projectRoot)
  if (!dir) return null
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, `${sessionId}.json`), "utf8"),
    ) as { sources?: { "background-task"?: { state?: unknown } } }
    const state = raw?.sources?.["background-task"]?.state
    return typeof state === "string" ? state : null
  } catch {
    return null
  }
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
  return withDbRead(
    () => {
      const db = openReadonlyDb(dbPath)
      if (!db) return blank(items)
      return items.map((item) => {
        const sessionId = sessionForPlanFile(db, item.rel)
        const sessionState = sessionId
          ? sessionActivityState(db, sessionId, {
              backgroundTaskActive: readRunContinuationState(projectRoot, sessionId) === BACKGROUND_TASK_ACTIVE,
              now: opts.now,
            })
          : null
        return { ...item, sessionState }
      })
    },
    () => blank(items),
  )
}
