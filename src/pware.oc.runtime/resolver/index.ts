/**
 * pware.oc.core.live.resolver
 *
 * Unified live snapshot: OpenCode SQLite + OMO files.
 * Fingerprint-driven — callers poll / watch and call readRuntimeSnapshot.
 */
import { createStampCache } from "../../pware.oc.core/pware.oc.core.cache.js"
import { gitignoreStamp } from "../../pware.oc.core/git/pware.oc.core.gitignore.js"
import { oesStamp, getOes } from "../../pware.oc.core/pware.oc.core.oes.js"
import { dbStamp, getOpenCodeDbPath } from "../../pware.oc.core/pware.oc.core.paths.js"
import { profileAsync } from "../../pware.oc.core/pware.oc.core.debug.js"
import {
  createDbSnapshotRead,
  emptyDb,
  listOpenQuestions,
  listSessionQuestions,
  refreshSessionStatus,
  sessionScanStamp,
  type DbSnapshot,
  type OpenQuestion,
  type SessionView,
} from "../../pware.oc.opencode/resolver/index.js"
import { createQuestionCache } from "../pware.oc.runtime.questions.js"
import { readonlyReadGateway } from "../../pware.oc.core/pware.oc.core.sqliteGateway.js"
import {
  emptyOmo,
  omoStamp,
  readOmo,
  readOmoConfig,
  type OmoConfigView,
  type OmoSnapshot,
} from "../../pware.oc.omo/resolver/index.js"
import { enrichDelegates, type DelegateView } from "./pware.oc.runtime.resolver.delegate.js"

export * from "./pware.oc.runtime.resolver.delegate.js"

export type RuntimeSnapshot = {
  generatedAt: number
  fingerprint: string
  /** session.time_updated + MAX(part.time_updated) — Perf cache key, not git. */
  scanStamp: string
  db: DbSnapshot
  omo: OmoSnapshot
  omoConfig: OmoConfigView
  delegates: DelegateView[]
  /** Open `question` tools across the project — computed off the UI thread. */
  openQuestions: OpenQuestion[]
}

/** Cheap poll key: WAL + omo/oes stamps. No git, no boulder JSON. */
export function computeFingerprint(opts: {
  dbPath: string
  projectRoot: string | null
  sessionId: string
}): string {
  return [
    opts.sessionId,
    dbStamp(opts.dbPath),
    omoStamp(opts.projectRoot),
    oesStamp(opts.projectRoot),
    gitignoreStamp(opts.projectRoot),
  ].join("::")
}

type RuntimeDbRead = {
  readonly ok: boolean
  readonly db: DbSnapshot
  readonly scanStamp: string
  readonly questions: readonly OpenQuestion[] | null
  readonly questionSessionId: string | null
  readonly fullQuestionScan: boolean
}

export async function readRuntimeSnapshot(opts: {
  sessionId: string
  projectRoot: string | null
  dbPath?: string
  questionHint?: string
}): Promise<RuntimeSnapshot> {
  const dbPath = opts.dbPath || getOpenCodeDbPath(process.env, undefined, opts.projectRoot)
  const cheap = computeFingerprint({
    dbPath,
    projectRoot: opts.projectRoot,
    sessionId: opts.sessionId,
  })
  const hit = liveCache.peek(cheap)
  if (hit) {
    const now = Date.now()
    const questionHint = opts.questionHint
    const projectId = hit.db.projectId
    if (questionHint && projectId) {
      const questionRead = await profileAsync("db.questions", () =>
        readonlyReadGateway.run<{ readonly ok: boolean; readonly questions: OpenQuestion[] }>({
          dbPath,
          initial: () => ({ ok: true, questions: [] }),
          stages: [(db) => ({
            ok: true,
            questions: listSessionQuestions(db, questionHint, projectId),
          })],
          fallback: () => ({ ok: false, questions: [] }),
        }),
      )
      if (questionRead.ok) questionCache.touch(questionHint, questionRead.questions)
      return {
        ...hit,
        generatedAt: now,
        fingerprint: cheap,
        db: withAges(hit.db, now),
        openQuestions: questionCache.get(),
      }
    }
    return {
      ...hit,
      generatedAt: now,
      fingerprint: cheap,
      db: withAges(hit.db, now),
    }
  }

  const omo = readOmo(opts.projectRoot)
  const extraIds = omo.delegates
    .map((d) => d.sessionId)
    .filter((id): id is string => Boolean(id))
  if (!opts.sessionId) {
    return {
      generatedAt: Date.now(),
      fingerprint: cheap,
      scanStamp: "0",
      db: emptyDb(dbPath, "no session"),
      omo,
      omoConfig: readOmoConfig(),
      delegates: [],
      openQuestions: [],
    }
  }

  const plan = createDbSnapshotRead({
    dbPath,
    sessionId: opts.sessionId,
    extraIds,
    projectRoot: opts.projectRoot,
  })
  const reconcileQuestions =
    Date.now() - questionLastReconcile >= getOes(opts.projectRoot).questionReconcileSec * 1000
  const initial = (): RuntimeDbRead => ({
    ok: true,
    db: plan.initial(),
    scanStamp: "0",
    questions: null,
    questionSessionId: opts.questionHint ?? null,
    fullQuestionScan: false,
  })
  const snapshotStages = plan.stages.map((stage) =>
    (db: Parameters<typeof stage>[0], state: RuntimeDbRead): RuntimeDbRead => ({
      ...state,
      db: stage(db, state.db),
    }))
  const read = await profileAsync("db.snapshot", () =>
    readonlyReadGateway.run({
      dbPath,
      initial,
      stages: [
        ...snapshotStages,
        (db, state) => ({ ...state, scanStamp: sessionScanStamp(db, opts.sessionId) }),
        (db, state) => {
          const projectId = state.db.projectId
          if (!projectId) return state
          if (opts.questionHint) {
            return {
              ...state,
              questions: listSessionQuestions(db, opts.questionHint, projectId),
            }
          }
          if (projectId === questionProjectId && !reconcileQuestions) return state
          return {
            ...state,
            questions: listOpenQuestions(db, projectId),
            fullQuestionScan: true,
          }
        },
      ],
      fallback: () => ({
        ok: false,
        db:
          lastGood?.db.current?.id === opts.sessionId
            ? lastGood.db
            : emptyDb(dbPath, "db read failed"),
        scanStamp: lastGood?.scanStamp ?? "0",
        questions: null,
        questionSessionId: null,
        fullQuestionScan: false,
      }),
    }),
  )

  if (!read.ok && lastGood?.db.current?.id === opts.sessionId) {
    return { ...lastGood, generatedAt: Date.now(), db: withAges(lastGood.db, Date.now()) }
  }

  const projectId = read.db.projectId
  if (projectId && projectId !== questionProjectId) {
    questionCache.reset()
    questionProjectId = projectId
    questionLastReconcile = 0
  }
  if (read.questions) {
    if (read.questionSessionId) questionCache.touch(read.questionSessionId, read.questions)
    else if (read.fullQuestionScan) {
      questionCache.seed(read.questions)
      questionLastReconcile = Date.now()
    }
  }
  const openQuestions = projectId ? questionCache.get() : []

  const snap: RuntimeSnapshot = {
    generatedAt: Date.now(),
    fingerprint: cheap,
    scanStamp: read.scanStamp,
    db: read.db,
    omo,
    omoConfig: readOmoConfig(),
    delegates: enrichDelegates(omo, read.db),
    openQuestions,
  }
  lastGood = snap
  liveCache.set(cheap, snap)
  return snap
}

const liveCache = createStampCache<RuntimeSnapshot>()

/** Last successfully-read snapshot, served when a locked DB read fails. */
let lastGood: RuntimeSnapshot | null = null

/** Module-level open-question cache — seeded once, invalidated per-session via questionHint. */
const questionCache = createQuestionCache()
let questionLastReconcile = 0
let questionProjectId: string | null = null

/** Drop the in-memory live snapshot so the next read is a real load. */
export function resetRuntimeCache(): void {
  liveCache.reset()
  lastGood = null
  questionCache.reset()
  questionLastReconcile = 0
  questionProjectId = null
}

function withAges(db: DbSnapshot, now: number): DbSnapshot {
  const bump = (v: SessionView | null): SessionView | null =>
    v
      ? {
          ...v,
          ageMs: Math.max(0, now - v.timeUpdated),
          status: refreshSessionStatus(v, now),
        }
      : null
  const current = bump(db.current)
  const parent = bump(db.parent)
  const main = bump(db.main)
  const children = db.children.map((v) => bump(v)!)
  const recent = db.recent.map((v) => bump(v)!)
  const byId: DbSnapshot["byId"] = {}
  for (const v of [current, parent, main, ...children, ...recent, ...Object.values(db.byId).map((x) => bump(x)!)]) {
    if (v) byId[v.id] = v
  }
  return { ...db, current, parent, main, children, recent, byId }
}
