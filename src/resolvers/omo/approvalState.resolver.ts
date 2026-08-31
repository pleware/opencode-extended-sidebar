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
} from "../opencode/session.resolver.js"
import { openReadonlyDb, withDbRead } from "../../sqlite.js"
import { findOmoWatchDirs } from "./boulder.resolver.js"
import type { ApprovalItem } from "./plan.resolver.js"

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

function firstRunContinuationDir(projectRoot: string): string | null {
  for (const omoDir of findOmoWatchDirs(projectRoot)) {
    const p = path.join(omoDir, "run-continuation")
    if (fs.existsSync(p)) return p
  }
  return null
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
  const runContinuationDir = firstRunContinuationDir(projectRoot)
  return withDbRead(
    () => {
      const db = openReadonlyDb(dbPath)
      if (!db) return blank(items)
      return items.map((item) => {
        const sessionId = sessionForPlanFile(db, item.rel)
        const sessionState = sessionId
          ? sessionActivityState(db, sessionId, { runContinuationDir, now: opts.now })
          : null
        return { ...item, sessionState }
      })
    },
    () => blank(items),
  )
}
