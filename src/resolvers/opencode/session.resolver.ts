/**
 * pware.oc.core.opencode.resolver.session
 *
 * Session rows → SessionView plus the hierarchy queries (current, children,
 * siblings, recent mains, lookups by id). Read-only against opencode.db.
 */
import { basenameOf, str } from "../../paths.js"
import { uniqueIds, type SqlDb } from "../../sqlite.js"

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

export type AgentStatus = "running" | "idle" | "archived" | "unknown"

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
  if (row.time_archived) return "archived"
  const age = now - (row.time_updated || 0)
  if (age < 0) return "unknown"
  if (age <= RUNNING_MS) return "running"
  return "idle"
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

export function getSessionById(db: SqlDb, id: string): SessionRow | null {
  return db.get<SessionRow>(
    `SELECT ${SESSION_SELECT} FROM session WHERE id = ? LIMIT 1`,
    id,
  )
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

/**
 * The session that last wrote a `.omo/` plan/draft file, if any. Matches
 * write-ish tool parts by the file's basename, so the planner session that
 * created a pending approval is the one "Continue" should jump to.
 */
export function sessionForPlanFile(db: SqlDb, relPath: string | null | undefined): string | null {
  const base = basenameOf(relPath ?? "")
  if (!base || base === "file") return null
  const like = `%${base}%`
  try {
    const row = db.get<{ session_id: string | null; last: number | null }>(
      `SELECT session_id, MAX(time_updated) AS last
       FROM part
       WHERE json_extract(data,'$.type') = 'tool'
         AND json_extract(data,'$.tool') IN ('edit','write','multiedit','apply_edit','applyedit')
         AND (
           json_extract(data,'$.state.input.filePath') LIKE ?
           OR json_extract(data,'$.input.filePath') LIKE ?
           OR json_extract(data,'$.filePath') LIKE ?
         )
       GROUP BY session_id
       ORDER BY last DESC
       LIMIT 1`,
      like,
      like,
      like,
    )
    return str(row?.session_id) ?? null
  } catch {
    return null
  }
}
