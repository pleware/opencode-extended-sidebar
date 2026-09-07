/**
 * pware.oc.core.opencode.resolver
 *
 * Aggregate of the opencode SQLite resolvers: readDbSnapshot composes the
 * session graph + tools + files for the panel; readProjectFeed rolls the
 * Sessions-tab feed across a set of sessions. Re-exports the entity resolvers.
 */
import type { FileFilter, FileView } from "../pware.oc.opencode.files.js"
import { getOes } from "../../pware.oc.core/pware.oc.core.oes.js"
import { profileAsync } from "../../pware.oc.core/pware.oc.core.debug.js"
import { readonlyReadGateway } from "../../pware.oc.core/pware.oc.core.sqliteGateway.js"
import type { SqlDb } from "../../pware.oc.core/pware.oc.core.sqlite.js"
import {
  getSessionById,
  getSessionsByIds,
  listChildSessions,
  listRecentMainSessions,
  HOUR_MS,
  sessionAgeTier,
  toSessionView,
  type SessionView,
} from "./pware.oc.opencode.resolver.session.js"
import { SESSION_STATUS_RUNNING } from "../constants/pware.oc.opencode.constants.sessionStatus.js"
import { listRecentToolEvents, listToolEvents, type ToolView } from "./pware.oc.opencode.resolver.tool.js"
import { listSessionFiles, listRecentSessionFiles } from "./pware.oc.opencode.resolver.file.js"

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
  /** Sessions keyed by id — current, main, and any looked-up delegates. */
  byId: Record<string, SessionView>
  /** Recent main (parent_id null) sessions in this project — the `sessionFetch` window. */
  recent: SessionView[]
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
    byId: {},
    recent: [],
    tools: [],
    files: [],
    error,
  }
}

export type DbSnapshotReadOptions = {
  readonly dbPath: string
  readonly sessionId: string
  readonly extraIds?: readonly string[]
  readonly projectRoot?: string | null
}

export type DbReadPlan<T> = {
  readonly initial: () => T
  readonly stages: readonly ((db: SqlDb, state: T) => T)[]
}

export function createDbSnapshotRead(opts: DbSnapshotReadOptions): DbReadPlan<DbSnapshot> {
  const now = Date.now()
  const oes = getOes(opts.projectRoot)
  const loadCurrent = (db: SqlDb, state: DbSnapshot): DbSnapshot => {
    const row = getSessionById(db, opts.sessionId)
    if (!row) {
      return { ...emptyDb(opts.dbPath, "session not in db yet"), present: true }
    }
    const current = toSessionView(row, now)
    return {
      ...state,
      present: true,
      projectId: row.project_id,
      current,
      main: current,
      byId: { [current.id]: current },
      error: null,
    }
  }

  const loadGraph = (db: SqlDb, state: DbSnapshot): DbSnapshot => {
    const current = state.current
    const projectId = state.projectId
    if (!current || !projectId) return state
    let parent: SessionView | null = null
    const children = listChildSessions(db, current.id).map((r) => toSessionView(r, now))
    if (current.parentId) {
      const p = getSessionById(db, current.parentId)
      if (p) parent = toSessionView(p, now)
    }
    const main = parent ?? current
    const extra = getSessionsByIds(db, [...(opts.extraIds ?? [])]).map((r) =>
      toSessionView(r, now),
    )
    const visibleMs = oes.sessionVisibleHours * HOUR_MS
    const dimMs = oes.sessionDimHours * HOUR_MS
    const recent = listRecentMainSessions(db, {
      projectId,
      limit: oes.sessionFetch,
    })
      .map((r) => toSessionView(r, now))
      .filter((v) => {
        const keep =
          v.id === current.id || v.id === main.id || v.status === SESSION_STATUS_RUNNING
        return sessionAgeTier(v.ageMs, dimMs, visibleMs, keep) !== "hidden"
      })
    const byId: Record<string, SessionView> = {}
    for (const v of [current, parent, main, ...children, ...extra, ...recent]) {
      if (v) byId[v.id] = v
    }
    return {
      ...state,
      main,
      parent,
      children,
      byId,
      recent,
    }
  }

  const loadTools = (db: SqlDb, state: DbSnapshot): DbSnapshot => {
    if (!state.current) return state
    return {
      ...state,
      tools: listToolEvents(db, state.current.id, oes.toolFetch),
    }
  }

  const loadFiles = (db: SqlDb, state: DbSnapshot): DbSnapshot => {
    if (!state.current) return state
    return {
      ...state,
      files: listSessionFiles(db, state.current.id, {
        skipGitignore: oes.skipGitignore,
        projectRoot: opts.projectRoot,
      }),
    }
  }

  return {
    initial: () => emptyDb(opts.dbPath),
    stages: [loadCurrent, loadGraph, loadTools, loadFiles],
  }
}

export function readDbSnapshot(db: SqlDb, opts: DbSnapshotReadOptions): DbSnapshot {
  const plan = createDbSnapshotRead(opts)
  return plan.stages.reduce((state, stage) => stage(db, state), plan.initial())
}

export type ProjectFeed = {
  tools: ToolView[]
  files: FileView[]
}

export function emptyProjectFeed(): ProjectFeed {
  return { tools: [], files: [] }
}

/** Lazy read — callers gate on the Sessions tab so the queries never run elsewhere. */
export type ProjectFeedReadOptions = {
  readonly dbPath: string
  readonly sessionIds: readonly string[]
  readonly toolLimit: number
  readonly filter?: FileFilter
}

export function createProjectFeedRead(opts: ProjectFeedReadOptions): DbReadPlan<ProjectFeed> {
  return {
    initial: emptyProjectFeed,
    stages: [
      (db, state) => ({
        ...state,
        tools: listRecentToolEvents(db, [...opts.sessionIds], opts.toolLimit),
      }),
      (db, state) => ({
        ...state,
        files: listRecentSessionFiles(db, [...opts.sessionIds], opts.filter),
      }),
    ],
  }
}

export function readProjectFeed(db: SqlDb, opts: ProjectFeedReadOptions): ProjectFeed {
  if (opts.sessionIds.length === 0) return emptyProjectFeed()
  const plan = createProjectFeedRead(opts)
  return plan.stages.reduce((state, stage) => stage(db, state), plan.initial())
}

export function readProjectFeedAsync(opts: ProjectFeedReadOptions): Promise<ProjectFeed> {
  if (!opts.dbPath || opts.sessionIds.length === 0) return Promise.resolve(emptyProjectFeed())
  const plan = createProjectFeedRead(opts)
  return profileAsync("db.feed", () =>
    readonlyReadGateway.run({
      dbPath: opts.dbPath,
      initial: plan.initial,
      stages: plan.stages,
      fallback: emptyProjectFeed,
    }),
  )
}
