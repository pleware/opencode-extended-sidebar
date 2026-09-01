/**
 * pware.oc.core.opencode.resolver.session
 *
 * Session rows → SessionView plus the hierarchy queries (current, children,
 * siblings, recent mains, lookups by id). Read-only against opencode.db.
 */
import { uniqueIds, type SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  SESSION_STATE_ARCHIVED,
  SESSION_STATE_AWAITING_BACKGROUND,
  SESSION_STATE_IDLE,
  SESSION_STATE_STREAMING,
  SESSION_STATE_UNKNOWN,
  SESSION_STATUS_ARCHIVED,
  SESSION_STATUS_IDLE,
  SESSION_STATUS_RUNNING,
  SESSION_STATUS_UNKNOWN,
  type AgentStatus,
  type SessionState,
} from "../constants/pware.oc.opencode.constants.sessionStatus.js"

export type { AgentStatus, SessionState }

export type SessionRow = {
  id: string
  project_id: string
  parent_id: string | null
  directory: string
  title: string
  agent: string | null
  model: string | null
  cost: number
  tokens_input: number
  tokens_output: number
  tokens_reasoning: number
  time_created: number
  time_updated: number
  time_archived: number | null
}

/** Finer-grained "is this session still working" state for approval rows. */
export type SessionActivityState = {
  running: boolean
  state: SessionState
}

export type SessionView = {
  id: string
  title: string
  agent: string
  status: AgentStatus
  isMain: boolean
  parentId: string | null
  directory: string
  tokensTotal: number
  cost: number
  timeUpdated: number
  ageMs: number
}

const RUNNING_MS = 2 * 60 * 1000

const SESSION_SELECT = `
  id, project_id, parent_id, directory, title, agent, model,
  cost, tokens_input, tokens_output, tokens_reasoning,
  time_created, time_updated, time_archived
`

export function inferStatus(row: SessionRow, now = Date.now()): AgentStatus {
  if (row.time_archived) return SESSION_STATUS_ARCHIVED
  const age = now - (row.time_updated || 0)
  if (age < 0) return SESSION_STATUS_UNKNOWN
  if (age <= RUNNING_MS) return SESSION_STATUS_RUNNING
  return SESSION_STATUS_IDLE
}

export function toSessionView(row: SessionRow, now = Date.now()): SessionView {
  const ti = row.tokens_input || 0
  const to = row.tokens_output || 0
  const tr = row.tokens_reasoning || 0
  return {
    id: row.id,
    title: row.title?.trim() || "untitled",
    agent: row.agent?.trim() || "unknown",
    status: inferStatus(row, now),
    isMain: !row.parent_id,
    parentId: row.parent_id,
    directory: row.directory,
    tokensTotal: ti + to + tr,
    cost: row.cost || 0,
    timeUpdated: row.time_updated,
    ageMs: Math.max(0, now - (row.time_updated || 0)),
  }
}

/**
 * Recompute a `SessionView` status against a fresh clock. The live snapshot
 * cache refreshes `ageMs` on every hit, so `status` (also age-derived) must be
 * refreshed with it — otherwise a session that went idle keeps reading running.
 */
export function refreshSessionStatus(view: SessionView, now: number): AgentStatus {
  if (view.status === SESSION_STATUS_ARCHIVED) return SESSION_STATUS_ARCHIVED
  const age = now - view.timeUpdated
  if (age < 0) return SESSION_STATUS_UNKNOWN
  if (age <= RUNNING_MS) return SESSION_STATUS_RUNNING
  return SESSION_STATUS_IDLE
}

export function getSessionById(db: SqlDb, id: string): SessionRow | null {
  return db.get<SessionRow>(
    `SELECT ${SESSION_SELECT} FROM session WHERE id = ? LIMIT 1`,
    id,
  )
}

/**
 * Is this session still working, and how? Streaming = a fresh `time_updated`;
 * awaiting-background = stale in SQLite but the caller's already-resolved
 * `backgroundTaskActive` (`.omo/run-continuation` marker) is true;
 * idle/archived/unknown otherwise. The omo layer resolves the marker — this
 * opencode function never reads omo files.
 */
export function sessionActivityState(
  db: SqlDb,
  sessionId: string,
  opts?: { backgroundTaskActive?: boolean | null; now?: number },
): SessionActivityState {
  const row = getSessionById(db, sessionId)
  if (!row) return { running: false, state: SESSION_STATE_UNKNOWN }
  if (row.time_archived) return { running: false, state: SESSION_STATE_ARCHIVED }
  const now = opts?.now ?? Date.now()
  if (now - row.time_updated <= RUNNING_MS) return { running: true, state: SESSION_STATE_STREAMING }
  if (opts?.backgroundTaskActive) return { running: true, state: SESSION_STATE_AWAITING_BACKGROUND }
  return { running: false, state: SESSION_STATE_IDLE }
}

export function listChildSessions(db: SqlDb, parentId: string): SessionRow[] {
  return db.all<SessionRow>(
    `SELECT ${SESSION_SELECT} FROM session WHERE parent_id = ? ORDER BY time_updated DESC LIMIT 40`,
    parentId,
  )
}

export function listSiblingSessions(db: SqlDb, parentId: string, excludeId: string): SessionRow[] {
  return db.all<SessionRow>(
    `SELECT ${SESSION_SELECT} FROM session
     WHERE parent_id = ? AND id != ?
     ORDER BY time_updated DESC LIMIT 40`,
    parentId,
    excludeId,
  )
}

const RECENT_LIMIT = 4

export function listRecentMainSessions(
  db: SqlDb,
  opts: { projectId: string; limit?: number },
): SessionRow[] {
  const limit = Math.max(1, Math.min(opts.limit ?? RECENT_LIMIT, 20))
  try {
    return db.all<SessionRow>(
      `SELECT ${SESSION_SELECT} FROM session
       WHERE parent_id IS NULL
         AND (time_archived IS NULL OR time_archived = 0)
         AND project_id = ?
       ORDER BY time_updated DESC
       LIMIT ${limit}`,
      opts.projectId,
    )
  } catch {
    return []
  }
}

export function getSessionsByIds(db: SqlDb, ids: string[]): SessionRow[] {
  const clean = uniqueIds(ids)
  if (clean.length === 0) return []
  const placeholders = clean.map(() => "?").join(",")
  return db.all<SessionRow>(
    `SELECT ${SESSION_SELECT} FROM session WHERE id IN (${placeholders})`,
    ...clean,
  )
}

export function sessionScanStamp(db: SqlDb, sessionId: string): string {
  try {
    const s = db.get<{ time_updated: number }>(
      `SELECT time_updated FROM session WHERE id = ? LIMIT 1`,
      sessionId,
    )
    const p = db.get<{ m: number | null }>(
      `SELECT MAX(time_updated) AS m FROM part WHERE session_id = ?`,
      sessionId,
    )
    return `${s?.time_updated ?? 0}|${p?.m ?? 0}`
  } catch {
    return "x"
  }
}
