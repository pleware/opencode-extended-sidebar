/**
 * pware.oc.core.opencode.resolver.session
 *
 * Session rows → SessionView plus the hierarchy queries (current, children,
 * siblings, recent mains, lookups by id). Read-only against opencode.db.
 */
import { createStampCache } from "../../pware.oc.core/pware.oc.core.cache.js"
import { basenameOf, str } from "../../pware.oc.core/pware.oc.core.paths.js"
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

export type PlanSessionIndex = {
  fileWriter: Map<string, { sessionId: string; lastAt: number }>
  sessionPlan: Map<string, { rel: string; lastAt: number; isPlan: boolean }>
}

const PLAN_FILE_RE = /\.(omo|sisyphus)\/(drafts|plans)\//i

/**
 * If `fp` is a plan/draft target under `.omo/` or `.sisyphus/`, return its
 * project-relative path and whether it is under `plans/`. `projectRoot`
 * strips the absolute prefix; without it the fp is used as-is and the marker
 * may sit mid-path. Null for anything else (plain source files included).
 */
function planFileOf(
  fp: string,
  projectRoot: string | null | undefined,
): { rel: string; isPlan: boolean } | null {
  let rel = fp.replace(/\\/g, "/").trim()
  if (!rel) return null
  if (projectRoot) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "")
    if (rel.toLowerCase().startsWith(root.toLowerCase() + "/")) {
      rel = rel.slice(root.length + 1)
    } else if (rel.toLowerCase() === root.toLowerCase()) {
      rel = ""
    }
  }
  const m = rel.match(PLAN_FILE_RE)
  if (!m) return null
  const start = m.index ?? 0
  return {
    rel: start > 0 ? rel.slice(start) : rel,
    isPlan: m[2].toLowerCase() === "plans",
  }
}

function planIndexStamp(db: SqlDb, projectId: string | null | undefined): string {
  try {
    const where = projectId ? "session.project_id = ?" : "1=1"
    const args = projectId ? [projectId] : []
    const p = db.get<{ m: number | null }>(
      `SELECT MAX(part.time_updated) AS m
       FROM part JOIN session ON session.id = part.session_id
       WHERE ${where}`,
      ...args,
    )
    return `${projectId ?? "*"}|${p?.m ?? 0}`
  } catch {
    return "x"
  }
}

function buildPlanSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): PlanSessionIndex {
  const fileWriter = new Map<string, { sessionId: string; lastAt: number }>()
  const writerPref = new Map<string, number>() // basename → is_writer of the current entry
  const sessionPlan = new Map<string, { rel: string; lastAt: number; isPlan: boolean }>()
  try {
    const where = projectId ? "session.project_id = ? AND" : ""
    const args = projectId ? [projectId] : []
    const rows = db.all<{
      session_id: string | null
      fp: string | null
      last: number | null
      is_writer: number | null
    }>(
      `SELECT part.session_id,
              COALESCE(
                json_extract(part.data,'$.state.input.filePath'),
                json_extract(part.data,'$.input.filePath'),
                json_extract(part.data,'$.filePath')
              ) AS fp,
              MAX(part.time_updated) AS last,
              MAX(CASE WHEN json_extract(part.data,'$.tool')='write' THEN 1 ELSE 0 END) AS is_writer
       FROM part
       JOIN session ON session.id = part.session_id
       WHERE ${where} json_extract(part.data,'$.type')='tool'
         AND json_extract(part.data,'$.tool') IN ('write','edit','multiedit','apply_edit','applyedit')
       GROUP BY part.session_id, fp`,
      ...args,
    )
    for (const row of rows) {
      const sessionId = str(row.session_id)
      const fp = str(row.fp)
      const last = typeof row.last === "number" && row.last > 0 ? row.last : 0
      if (!sessionId || !fp) continue
      const info = planFileOf(fp, projectRoot)
      if (!info) continue
      const base = basenameOf(info.rel)
      const isWriter = row.is_writer === 1 ? 1 : 0
      const writer = fileWriter.get(base)
      if (!writer) {
        fileWriter.set(base, { sessionId, lastAt: last })
        writerPref.set(base, isWriter)
      } else {
        const cur = writerPref.get(base) ?? 0
        // A `write` creator beats a session that only edited the file, even
        // when the edit came later; equal preference falls back to the later
        // timestamp.
        if (isWriter > cur || (isWriter === cur && last > writer.lastAt)) {
          fileWriter.set(base, { sessionId, lastAt: last })
          writerPref.set(base, isWriter)
        }
      }
      const plan = sessionPlan.get(sessionId)
      if (!plan) {
        sessionPlan.set(sessionId, { rel: info.rel, lastAt: last, isPlan: info.isPlan })
      } else if (last > plan.lastAt) {
        sessionPlan.set(sessionId, { rel: info.rel, lastAt: last, isPlan: info.isPlan })
      } else if (last === plan.lastAt && info.isPlan && !plan.isPlan) {
        sessionPlan.set(sessionId, { rel: info.rel, lastAt: last, isPlan: info.isPlan })
      }
    }
  } catch {
    // soft-fail → empty index
  }
  return { fileWriter, sessionPlan }
}

const planIndexCache = createStampCache<PlanSessionIndex>()

/**
 * In-memory bidirectional plan-file index for one project, built from a single
 * write-ish `part` join. `fileWriter` maps a plan/draft basename to its latest
 * writer session; `sessionPlan` maps a session to its latest plan/draft file,
 * preferring `plans/` over `drafts/` on an equal timestamp. Stamp-cached on the
 * project's `MAX(part.time_updated)` so it rebuilds only when parts change.
 */
export function planSessionIndex(
  db: SqlDb,
  projectId: string | null | undefined,
  projectRoot: string | null | undefined,
): PlanSessionIndex {
  return planIndexCache.get(planIndexStamp(db, projectId), () =>
    buildPlanSessionIndex(db, projectId, projectRoot),
  )
}

/**
 * The session that last wrote a `.omo/` plan/draft file, if any. Matches
 * write-ish tool parts by the file's basename, so the planner session that
 * created a pending approval is the one "Continue" should jump to.
 */
export function sessionForPlanFile(db: SqlDb, relPath: string | null | undefined): string | null {
  const base = basenameOf(relPath ?? "")
  if (!base || base === "file") return null
  return planSessionIndex(db, null, null).fileWriter.get(base)?.sessionId ?? null
}
