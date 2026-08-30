/**
 * Read-only queries against OpenCode opencode.db (session / todo).
 */
import fs from "node:fs"
import { fileHitFromPartData, filesFromPatchData, type FileFilter, type FileView } from "./files.js"
import { getOes } from "./oes.js"
import { shortToolLabel } from "./pulse.js"
import { openReadonlyDb, resetReadonlyDb, type SqlDb } from "./sqlite.js"

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

export type TodoRow = {
  content: string
  status: string
  priority: string
  position: number
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

export function listTodos(db: SqlDb, sessionId: string): TodoRow[] {
  try {
    return db.all<TodoRow>(
      `SELECT content, status, priority, position
       FROM todo WHERE session_id = ?
       ORDER BY position ASC LIMIT 40`,
      sessionId,
    )
  } catch {
    return []
  }
}

export type DbSnapshot = {
  present: boolean
  dbPath: string
  current: SessionView | null
  /** Orchestrator: parent if current is a child, otherwise current. */
  main: SessionView | null
  parent: SessionView | null
  children: SessionView[]
  siblings: SessionView[]
  /** Sessions keyed by id — current, main, and any looked-up delegates. */
  byId: Record<string, SessionView>
  /** Recent main (parent_id null) sessions in this project. */
  recent: SessionView[]
  todos: TodoRow[]
  /** Current session tool parts — name + status only, no args/outputs. */
  tools: ToolView[]
  /** Basenames + optional +/- from edit/write parts. No paths, no bodies. */
  files: FileView[]
  error: string | null
}

export function emptyDb(dbPath: string, error: string | null = null): DbSnapshot {
  return {
    present: false,
    dbPath,
    current: null,
    main: null,
    parent: null,
    children: [],
    siblings: [],
    byId: {},
    recent: [],
    todos: [],
    tools: [],
    files: [],
    error,
  }
}

export type ToolStatus = "running" | "completed" | "error" | "pending"

export type ToolView = {
  id: string
  callId?: string | null
  /** Display label: command / file hint, not just "bash". */
  name: string
  tool: string
  status: ToolStatus
  startedAt: number | null
  endedAt: number | null
  durationMs: number | null
}

const TOOL_SCAN = 80
const TOOL_ROWS = 8

export function normalizeToolStatus(raw: string | null | undefined): ToolStatus {
  const s = (raw || "").toLowerCase()
  if (s === "running" || s === "in_progress" || s === "active") return "running"
  if (s === "completed" || s === "done" || s === "success") return "completed"
  if (s === "error" || s === "failed") return "error"
  if (s === "pending" || s === "queued") return "pending"
  return "pending"
}

function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string
  } catch {
    return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
}

function matchField(data: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`)
  const m = data.match(re)
  return m?.[1] != null ? unescapeJson(m[1]) : null
}

function matchNum(data: string, key: string): number | null {
  const m = data.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`))
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Metadata only — regex, never parses tool I/O JSON. */
export function listToolEvents(db: SqlDb, sessionId: string, limit = TOOL_ROWS): ToolView[] {
  type Row = {
    id: string
    time_created: number
    time_updated: number
    data: string
  }
  let rows: Row[] = []
  try {
    rows = db.all<Row>(
      `SELECT id, time_created, time_updated, data
       FROM part
       WHERE session_id = ?
         AND data LIKE '%"type":"tool"%'
       ORDER BY time_created DESC
       LIMIT ${TOOL_SCAN}`,
      sessionId,
    )
  } catch {
    return []
  }

  const out: ToolView[] = []
  for (const row of rows) {
    const data = String(row.data || "")
    if (!/"type"\s*:\s*"tool"/.test(data)) continue
    const tool = matchField(data, "tool") || "tool"
    const statusRaw = matchField(data, "status")
    const start = matchNum(data, "start")
    const end = matchNum(data, "end")
    const status = normalizeToolStatus(
      statusRaw || (end != null ? "completed" : start != null ? "running" : null),
    )
    const startedAt = start ?? stampMaybe(row.time_created)
    const endedAt =
      end ??
      (status === "completed" || status === "error" ? stampMaybe(row.time_updated) : null)
    const durationMs =
      startedAt != null && endedAt != null && endedAt >= startedAt ? endedAt - startedAt : null
    out.push({
      id: String(row.id),
      callId: matchField(data, "callID"),
      tool,
      name: shortToolLabel({
        tool,
        title: matchField(data, "title"),
        command: matchField(data, "command"),
        filePath: matchField(data, "filePath"),
        pattern: matchField(data, "pattern"),
      }),
      status,
      startedAt,
      endedAt,
      durationMs,
    })
    if (out.length >= limit) break
  }
  return out
}

function stampMaybe(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null
  return v < 1e11 ? v * 1000 : v
}

const FILE_SCAN = 80

/** Patch `files[]` + edit metadata +/- . No bodies. */
export function listSessionFiles(db: SqlDb, sessionId: string, filter?: FileFilter): FileView[] {
  type Row = { data: string; time_updated: number; time_created: number }
  let rows: Row[] = []
  try {
    rows = db.all<Row>(
      `SELECT data, time_updated, time_created
       FROM part
       WHERE session_id = ?
         AND (
           data LIKE '%"type":"patch"%'
           OR (
             data LIKE '%"type":"tool"%'
             AND (
               data LIKE '%"tool":"edit"%'
               OR data LIKE '%"tool":"write"%'
               OR data LIKE '%"tool":"multiedit"%'
               OR data LIKE '%"tool":"read"%'
               OR data LIKE '%"tool":"delete"%'
             )
           )
         )
       ORDER BY time_updated DESC
       LIMIT ${FILE_SCAN}`,
      sessionId,
    )
  } catch {
    return []
  }
  const byId = new Map<string, FileView>()
  const add = (f: FileView) => {
    const prev = byId.get(f.id)
    byId.set(f.id, {
      id: f.id,
      name: f.name,
      additions: (prev?.additions ?? 0) + f.additions,
      deletions: (prev?.deletions ?? 0) + f.deletions,
      at: Math.max(f.at, prev?.at ?? 0),
      touch: prev?.touch === "write" || f.touch === "write" ? "write" : "read",
      letter: f.letter ?? prev?.letter ?? null,
    })
  }
  for (const row of rows) {
    const at = stampMaybe(row.time_updated) ?? stampMaybe(row.time_created) ?? 0
    const data = String(row.data || "")
    if (/"type"\s*:\s*"patch"/.test(data)) {
      for (const f of filesFromPatchData(data, at, filter)) add(f)
      continue
    }
    const hit = fileHitFromPartData(data, at, filter)
    if (hit) add(hit)
  }
  return [...byId.values()].sort((a, b) => b.at - a.at)
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
  const clean = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))]
  if (!clean.length) return []
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

export function readDbSnapshot(opts: {
  dbPath: string
  sessionId: string
  extraIds?: string[]
  projectRoot?: string | null
}): DbSnapshot {
  if (!opts.dbPath || !fs.existsSync(opts.dbPath)) {
    return emptyDb(opts.dbPath, "db missing")
  }

  const run = (): DbSnapshot => {
    const db = openReadonlyDb(opts.dbPath)
    if (!db) return emptyDb(opts.dbPath, "sqlite unavailable")

    const now = Date.now()
    const row = getSessionById(db, opts.sessionId)
    if (!row) {
      return { ...emptyDb(opts.dbPath, "session not in db yet"), present: true }
    }
    const current = toSessionView(row, now)
    let parent: SessionView | null = null
    const children = listChildSessions(db, row.id).map((r) => toSessionView(r, now))
    if (row.parent_id) {
      const p = getSessionById(db, row.parent_id)
      if (p) parent = toSessionView(p, now)
    }

    const main = parent ?? current
    const extra = getSessionsByIds(db, opts.extraIds ?? []).map((r) =>
      toSessionView(r, now),
    )
    const byId: Record<string, SessionView> = {}
    const oes = getOes(opts.projectRoot)
    const recent = listRecentMainSessions(db, {
      projectId: row.project_id,
      limit: oes.sessionRows,
    }).map((r) => toSessionView(r, now))
    for (const v of [current, parent, main, ...children, ...extra, ...recent]) {
      if (v) byId[v.id] = v
    }

    return {
      present: true,
      dbPath: opts.dbPath,
      current,
      main,
      parent,
      children,
      siblings: [],
      byId,
      recent,
      todos: [],
      tools: listToolEvents(db, row.id, oes.toolRows),
      files: listSessionFiles(db, row.id, {
        skipDirs: oes.skipDirs,
        skipGitignore: oes.skipGitignore,
        projectRoot: opts.projectRoot,
      }),
      error: null,
    }
  }

  try {
    return run()
  } catch (e) {
    resetReadonlyDb()
    try {
      return run()
    } catch {
      return emptyDb(opts.dbPath, e instanceof Error ? e.message : "db read failed")
    }
  }
}
