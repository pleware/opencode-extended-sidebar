/**
 * pware.oc.core.opencode.resolver
 *
 * Aggregate of the opencode SQLite resolvers: readDbSnapshot composes the
 * session graph + tools + files for the panel; readProjectFeed rolls the
 * Sessions-tab feed across a set of sessions. Re-exports the entity resolvers.
 */
import fs from "node:fs"
import type { FileFilter, FileView } from "../pware.oc.opencode.files.js"
import { profile } from "../../pware.oc.core/pware.oc.core.debug.js"
import { getOes } from "../../pware.oc.core/pware.oc.core.oes.js"
import { openReadonlyDb, withDbRead } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  getSessionById,
  getSessionsByIds,
  listChildSessions,
  listRecentMainSessions,
  toSessionView,
  type SessionView,
} from "./pware.oc.opencode.resolver.session.js"
import { listRecentToolEvents, listToolEvents, type ToolView } from "./pware.oc.opencode.resolver.tool.js"
import { listSessionFiles, listRecentSessionFiles } from "./pware.oc.opencode.resolver.file.js"
import type { TodoRow } from "./pware.oc.opencode.resolver.todo.js"

export * from "./pware.oc.opencode.resolver.session.js"
export * from "./pware.oc.opencode.resolver.todo.js"
export * from "./pware.oc.opencode.resolver.tool.js"
export * from "./pware.oc.opencode.resolver.file.js"
export * from "./pware.oc.opencode.resolver.question.js"

export type DbSnapshot = {
  present: boolean
  dbPath: string
  /** Project of the current session — scopes project-wide reads (questions). */
  projectId: string | null
  current: SessionView | null
  /** Orchestrator: parent if current is a child, otherwise current. */
  main: SessionView | null
  parent: SessionView | null
  children: SessionView[]
  siblings: SessionView[]
  /** Sessions keyed by id — current, main, and any looked-up delegates. */
  byId: Record<string, SessionView>
  /** Recent main (parent_id null) sessions in this project — the `sessionFetch` window. */
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
    projectId: null,
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
      limit: oes.sessionFetch,
    }).map((r) => toSessionView(r, now))
    for (const v of [current, parent, main, ...children, ...extra, ...recent]) {
      if (v) byId[v.id] = v
    }

    return {
      present: true,
      dbPath: opts.dbPath,
      projectId: row.project_id,
      current,
      main,
      parent,
      children,
      siblings: [],
      byId,
      recent,
      todos: [],
      tools: listToolEvents(db, row.id, oes.toolFetch),
      files: listSessionFiles(db, row.id, {
        skipGitignore: oes.skipGitignore,
        projectRoot: opts.projectRoot,
      }),
      error: null,
    }
  }

  return profile("db.snapshot", () =>
    withDbRead(run, (e) =>
      emptyDb(opts.dbPath, e instanceof Error ? e.message : "db read failed"),
    ),
  )
}

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
  return profile("db.feed", () =>
    withDbRead(() => {
      const db = openReadonlyDb(opts.dbPath)
      if (!db) return empty
      return {
        tools: listRecentToolEvents(db, opts.sessionIds, opts.toolLimit),
        files: listRecentSessionFiles(db, opts.sessionIds, opts.filter),
      }
    }, () => empty),
  )
}
