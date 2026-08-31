/**
 * Read-only queries against OpenCode opencode.db (session / todo).
 */
import fs from "node:fs"
import { fileHitFromExtracted, filesFromPatchJson, type FileFilter, type FileView } from "./files.js"
import { getOes } from "./oes.js"
import { preferToolLabel, shortToolLabel, toEpochMs, type ToolHit } from "./pulse.js"
import { openReadonlyDb, withDbRead, type SqlDb } from "./sqlite.js"
import { toToolStatus, type ToolStatus } from "./status.js"

export type { ToolStatus }

export { toToolStatus as normalizeToolStatus }

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

export type ToolView = {
  id: string
  callId?: string | null
  /** Display label: command / file / task description, not just "bash" or "task". */
  name: string
  tool: string
  status: ToolStatus
  startedAt: number | null
  endedAt: number | null
  durationMs: number | null
}

const TOOL_SCAN = 80
const TOOL_ROWS = 8

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim()
  return null
}

/** Metadata only — json_extract, never the part blob. */
type ToolEventRow = {
  id: string
  time_created: number
  time_updated: number
  tool: string | null
  callID: string | null
  status: string | null
  tstart: number | null
  tend: number | null
  title: string | null
  command: string | null
  command2: string | null
  filePath: string | null
  filePath2: string | null
  pattern: string | null
  pattern2: string | null
  description: string | null
  description2: string | null
  subagent: string | null
  category: string | null
}

/** Shared tool-part column list — all columns from `part.data` via json_extract. */
function toolColumns(): string {
  return [
    `id`,
    `time_created`,
    `time_updated`,
    `json_extract(data,'$.tool') AS tool`,
    `json_extract(data,'$.callID') AS callID`,
    `json_extract(data,'$.state.status') AS status`,
    `json_extract(data,'$.state.time.start') AS tstart`,
    `json_extract(data,'$.state.time.end') AS tend`,
    `json_extract(data,'$.state.title') AS title`,
    `json_extract(data,'$.state.input.command') AS command`,
    `json_extract(data,'$.input.command') AS command2`,
    `json_extract(data,'$.state.input.filePath') AS filePath`,
    `json_extract(data,'$.input.filePath') AS filePath2`,
    `json_extract(data,'$.state.input.pattern') AS pattern`,
    `json_extract(data,'$.input.pattern') AS pattern2`,
    `json_extract(data,'$.state.input.description') AS description`,
    `json_extract(data,'$.input.description') AS description2`,
    `json_extract(data,'$.state.input.subagent_type') AS subagent`,
    `json_extract(data,'$.state.input.category') AS category`,
  ].join(",\n       ")
}

function toolViewsFromRows(rows: readonly ToolEventRow[], limit: number): ToolView[] {
  const out: ToolView[] = []
  for (const row of rows) {
    const tool = str(row.tool) || "tool"
    const start = toEpochMs(row.tstart)
    const end = toEpochMs(row.tend)
    const status = toToolStatus(
      str(row.status) || (end != null ? "completed" : start != null ? "running" : null),
    )
    const startedAt = start ?? toEpochMs(row.time_created)
    const endedAt =
      end ??
      (status === "completed" || status === "error" ? toEpochMs(row.time_updated) : null)
    const durationMs =
      startedAt != null && endedAt != null && endedAt >= startedAt ? endedAt - startedAt : null
    out.push({
      id: String(row.id),
      callId: str(row.callID),
      tool,
      name: shortToolLabel({
        tool,
        title: str(row.title),
        command: str(row.command) || str(row.command2),
        filePath: str(row.filePath) || str(row.filePath2),
        pattern: str(row.pattern) || str(row.pattern2),
        description: str(row.description) || str(row.description2),
        subagent: str(row.subagent) || str(row.category),
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

/** Newest tool parts of one session — the Current tab feed. */
export function listToolEvents(db: SqlDb, sessionId: string, limit = TOOL_ROWS): ToolView[] {
  let rows: ToolEventRow[] = []
  try {
    rows = db.all<ToolEventRow>(
      `SELECT ${toolColumns()}
       FROM part
       WHERE session_id = ?
         AND json_extract(data,'$.type') = 'tool'
       ORDER BY time_created DESC
       LIMIT ${TOOL_SCAN}`,
      sessionId,
    )
  } catch {
    return []
  }
  return toolViewsFromRows(rows, limit)
}

/** Newest tool parts across the given sessions — the Sessions tab feed. */
export function listRecentToolEvents(db: SqlDb, sessionIds: string[], limit = TOOL_ROWS): ToolView[] {
  const clean = uniqueIds(sessionIds)
  if (clean.length === 0) return []
  const placeholders = clean.map(() => "?").join(",")
  let rows: ToolEventRow[] = []
  try {
    rows = db.all<ToolEventRow>(
      `SELECT ${toolColumns()}
       FROM part
       WHERE session_id IN (${placeholders})
         AND json_extract(data,'$.type') = 'tool'
       ORDER BY time_created DESC
       LIMIT ${TOOL_SCAN}`,
      ...clean,
    )
  } catch {
    return []
  }
  return toolViewsFromRows(rows, limit)
}

/** De-duplicated, non-empty session ids for `IN (...)` queries. */
function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))]
}

export function mergeTools(
  dbTools: ToolView[],
  live: Record<string, ToolHit>,
  now: number,
  limit: number,
): ToolView[] {
  // DB rows are keyed by the part id (`prt_…`) but carry the callID (`call_…`);
  // live events reference only the callID. Key both sides by callID so a live
  // hit lands on the same slot as its DB row, or the same call renders twice.
  // A live hit fills in a running start it saw first, but once the DB row has
  // the real endedAt/duration, the live event must not clobber them — the panel
  // sorts finished calls by endedAt, and `now` would keep reordering them.
  const byId = new Map<string, ToolView>()
  const byCall = new Map<string, string>()
  for (const t of dbTools) {
    const key = t.callId || t.id
    byId.set(key, t)
    if (t.callId && t.callId !== t.id) byCall.set(t.id, key)
  }
  for (const hit of Object.values(live)) {
    const key = byCall.get(hit.id) ?? hit.id
    const prev = byId.get(key)
    if (prev && (prev.status === "completed" || prev.status === "error") && hit.status === "running") {
      continue
    }
    byId.set(key, {
      id: prev?.id ?? hit.id,
      callId: prev?.callId ?? null,
      name: preferToolLabel(hit.name, prev?.name),
      tool: prev?.tool || "tool",
      status: hit.status,
      startedAt: prev?.startedAt ?? now,
      endedAt: hit.status === "running" ? null : (prev?.endedAt ?? now),
      durationMs:
        hit.status === "running"
          ? null
          : prev?.durationMs ?? (prev?.startedAt != null ? Math.max(0, now - prev.startedAt) : null),
    })
  }
  return [...byId.values()]
    .sort((a, b) => {
      const ar = a.status === "running" || a.status === "pending" ? 0 : 1
      const br = b.status === "running" || b.status === "pending" ? 0 : 1
      if (ar !== br) return ar - br
      const at = ar === 0 ? (a.startedAt ?? 0) : (a.endedAt ?? a.startedAt ?? 0)
      const bt = br === 0 ? (b.startedAt ?? 0) : (b.endedAt ?? b.startedAt ?? 0)
      return bt - at
    })
    .slice(0, limit)
}

const FILE_SCAN = 80

type SessionFileRow = {
  time_updated: number
  time_created: number
  kind: string | null
  tool: string | null
  filePath: string | null
  filePath2: string | null
  filePath3: string | null
  addMeta: number | null
  addMeta2: number | null
  addTop: number | null
  delMeta: number | null
  delMeta2: number | null
  delTop: number | null
  files: string | null
}

/** Shared file-part column list — all columns from `part.data` via json_extract. */
function fileColumns(): string {
  return [
    `time_created`,
    `time_updated`,
    `json_extract(data,'$.type') AS kind`,
    `json_extract(data,'$.tool') AS tool`,
    `json_extract(data,'$.state.input.filePath') AS filePath`,
    `json_extract(data,'$.input.filePath') AS filePath2`,
    `json_extract(data,'$.filePath') AS filePath3`,
    `json_extract(data,'$.state.metadata.additions') AS addMeta`,
    `json_extract(data,'$.metadata.additions') AS addMeta2`,
    `json_extract(data,'$.additions') AS addTop`,
    `json_extract(data,'$.state.metadata.deletions') AS delMeta`,
    `json_extract(data,'$.metadata.deletions') AS delMeta2`,
    `json_extract(data,'$.deletions') AS delTop`,
    `json_extract(data,'$.files') AS files`,
  ].join(",\n       ")
}

/** Patch parts + edit/write/read tool parts — what counts as a file touch. */
function fileWhere(): string {
  return `(
    json_extract(data,'$.type') = 'patch'
    OR (
      json_extract(data,'$.type') = 'tool'
       AND json_extract(data,'$.tool') IN ('edit','write','multiedit','read','delete','apply_edit','applyedit','remove','view','read_file','readfile')
    )
  )`
}

/** Patch `files[]` + edit metadata +/- , aggregated by path. No bodies. */
function fileViewsFromRows(rows: readonly SessionFileRow[], filter?: FileFilter): FileView[] {
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
    const at = toEpochMs(row.time_updated) ?? toEpochMs(row.time_created) ?? 0
    if (str(row.kind) === "patch") {
      for (const f of filesFromPatchJson(row.files, at, filter)) add(f)
      continue
    }
    const hit = fileHitFromExtracted({
      tool: str(row.tool),
      filePath: str(row.filePath) || str(row.filePath2) || str(row.filePath3),
      additions: row.addMeta ?? row.addMeta2 ?? row.addTop,
      deletions: row.delMeta ?? row.delMeta2 ?? row.delTop,
      at,
      filter,
    })
    if (hit) add(hit)
  }
  return [...byId.values()].sort((a, b) => b.at - a.at)
}

/** Patch `files[]` + edit metadata +/- for one session. No bodies. */
export function listSessionFiles(db: SqlDb, sessionId: string, filter?: FileFilter): FileView[] {
  let rows: SessionFileRow[] = []
  try {
    rows = db.all<SessionFileRow>(
      `SELECT ${fileColumns()}
       FROM part
       WHERE session_id = ?
         AND ${fileWhere()}
       ORDER BY time_updated DESC
       LIMIT ${FILE_SCAN}`,
      sessionId,
    )
  } catch {
    return []
  }
  return fileViewsFromRows(rows, filter)
}

/** Files touched by any of the given sessions, aggregated — the Sessions tab feed. */
export function listRecentSessionFiles(
  db: SqlDb,
  sessionIds: string[],
  filter?: FileFilter,
): FileView[] {
  const clean = uniqueIds(sessionIds)
  if (clean.length === 0) return []
  const placeholders = clean.map(() => "?").join(",")
  let rows: SessionFileRow[] = []
  try {
    rows = db.all<SessionFileRow>(
      `SELECT ${fileColumns()}
       FROM part
       WHERE session_id IN (${placeholders})
         AND ${fileWhere()}
       ORDER BY time_updated DESC
       LIMIT ${FILE_SCAN}`,
      ...clean,
    )
  } catch {
    return []
  }
  return fileViewsFromRows(rows, filter)
}

/** Project-wide feed shown while the Sessions tab is open. */
export type ProjectFeed = {
  tools: ToolView[]
  files: FileView[]
}

export function emptyProjectFeed(): ProjectFeed {
  return { tools: [], files: [] }
}

/** Lazy read — callers gate on the Sessions tab so the queries never run elsewhere. */
export function readProjectFeed(opts: {
  dbPath: string
  sessionIds: string[]
  toolLimit: number
  filter?: FileFilter
}): ProjectFeed {
  const empty = emptyProjectFeed()
  if (!opts.dbPath || opts.sessionIds.length === 0 || !fs.existsSync(opts.dbPath)) return empty
  return withDbRead(() => {
    const db = openReadonlyDb(opts.dbPath)
    if (!db) return empty
    return {
      tools: listRecentToolEvents(db, opts.sessionIds, opts.toolLimit),
      files: listRecentSessionFiles(db, opts.sessionIds, opts.filter),
    }
  }, () => empty)
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
        skipGitignore: oes.skipGitignore,
        projectRoot: opts.projectRoot,
      }),
      error: null,
    }
  }

  return withDbRead(run, (e) =>
    emptyDb(opts.dbPath, e instanceof Error ? e.message : "db read failed"),
  )
}
