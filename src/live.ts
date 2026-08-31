/**
 * Unified live snapshot: OpenCode SQLite + OMO files.
 * Fingerprint-driven — callers poll / watch and call readLiveSnapshot.
 */
import { emptyDb, readDbSnapshot, sessionScanStamp, type DbSnapshot, type SessionView } from "./db.js"
import { emptyOmo, omoStamp, readOmo, readOmoConfig, type Delegate, type OmoConfigView, type OmoSnapshot } from "./omo.js"
import { gitignoreStamp } from "./gitignore.js"
import { oesStamp } from "./oes.js"
import { dbStamp, getOpenCodeDbPath } from "./paths.js"
import { createStampCache } from "./cache.js"
import { openReadonlyDb, withDbRead } from "./sqlite.js"
import { normalizeStatus } from "./status.js"

export type DelegateView = Delegate & {
  tokensTotal: number | null
  timeUpdated: number | null
  archived: boolean
}

export type LiveSnapshot = {
  generatedAt: number
  fingerprint: string
  /** session.time_updated + MAX(part.time_updated) — Perf cache key, not git. */
  scanStamp: string
  db: DbSnapshot
  omo: OmoSnapshot
  omoConfig: OmoConfigView
  delegates: DelegateView[]
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

/**
 * Boulder often leaves `task_sessions` on `running` after the work (and the
 * OpenCode session) has finished. SQLite session status wins.
 */
export function reconcileDelegateStatus(
  omoStatus: string,
  sess?: Pick<SessionView, "status"> | null,
): string {
  const omo = (omoStatus || "unknown").toLowerCase()
  if (!sess) return omo
  if (sess.status === "archived") return "completed"
  const c = normalizeStatus(omoStatus)
  const omoError = c === "error"
  const omoDone = c === "completed"
  if (sess.status === "idle") {
    if (omoError) return omo
    if (omoDone) return omo
    return "completed"
  }
  if (omoError || omoDone) return omo
  return omo === "unknown" ? "running" : omo
}

/** Display key — empty / missing agent collapses to `agent`. */
export function delegateAgentKey(d: Pick<DelegateView, "agent">): string {
  const s = (d.agent || "").trim()
  return s || "agent"
}

export type DelegateListItem =
  | { kind: "header"; agent: string; count: number; members: DelegateView[] }
  | { kind: "row"; grouped: boolean; delegate: DelegateView }

/**
 * Cluster by agent when two or more names appear. Group order follows first
 * appearance (keeps recency on Current). One agent → flat rows, no headers.
 */
export function groupDelegates(list: DelegateView[]): DelegateListItem[] {
  if (list.length === 0) return []
  const seen = new Set<string>()
  for (const d of list) seen.add(delegateAgentKey(d))
  const grouped = seen.size >= 2
  if (!grouped) {
    return list.map((delegate) => ({ kind: "row" as const, grouped: false, delegate }))
  }
  const order: string[] = []
  const buckets = new Map<string, DelegateView[]>()
  for (const d of list) {
    const key = delegateAgentKey(d)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.push(d)
  }
  const out: DelegateListItem[] = []
  for (const agent of order) {
    const rows = buckets.get(agent) ?? []
    out.push({ kind: "header", agent, count: rows.length, members: rows })
    for (const delegate of rows) out.push({ kind: "row", grouped: true, delegate })
  }
  return out
}

/** Delegates of this session only: SQLite children + OMO tasks whose parent is this session. */
export function delegatesForSession(snap: LiveSnapshot, sessionId: string): DelegateView[] {
  const childIds = new Set(snap.db.children.map((c) => c.id))
  const out: DelegateView[] = []
  const seen = new Set<string>()
  const push = (d: DelegateView) => {
    const key = d.sessionId || d.taskKey
    if (!key || seen.has(key) || key === sessionId) return
    seen.add(key)
    out.push(d)
  }

  // Boulder is project-wide. A new main session must not inherit another run's tasks.
  for (const d of snap.delegates) {
    const parent = d.sessionId ? snap.db.byId[d.sessionId]?.parentId : null
    if (parent === sessionId || (d.sessionId && childIds.has(d.sessionId))) push(d)
  }

  for (const c of snap.db.children) {
    push({
      taskKey: c.id,
      title: c.title,
      sessionId: c.id,
      agent: c.agent,
      status: c.status,
      updatedAt: c.timeUpdated,
      tokensTotal: c.tokensTotal,
      timeUpdated: c.timeUpdated,
      archived: c.status === "archived",
    })
  }
  return out
}

function enrichDelegates(omo: OmoSnapshot, db: DbSnapshot): DelegateView[] {
  return omo.delegates.map((d) => {
    const sess = d.sessionId ? db.byId[d.sessionId] : undefined
    return {
      ...d,
      status: reconcileDelegateStatus(d.status, sess),
      tokensTotal: sess ? sess.tokensTotal : null,
      timeUpdated: sess?.timeUpdated ?? d.updatedAt,
      archived: sess?.status === "archived",
    }
  })
}

export function readLiveSnapshot(opts: {
  sessionId: string
  projectRoot: string | null
  dbPath?: string
  force?: boolean
}): LiveSnapshot {
  const dbPath = opts.dbPath || getOpenCodeDbPath(process.env, undefined, opts.projectRoot)
  const cheap = computeFingerprint({
    dbPath,
    projectRoot: opts.projectRoot,
    sessionId: opts.sessionId,
  })
  const omoKey = omoStamp(opts.projectRoot)
  let scan = "0"
  if (opts.sessionId) {
    scan = withDbRead(() => {
      const handle = openReadonlyDb(dbPath)
      if (!handle) return "0"
      return sessionScanStamp(handle, opts.sessionId)
    }, () => "x")
  }

  const cacheId = `${opts.sessionId}::${scan}::${omoKey}`
  if (!opts.force) {
    const hit = liveCache.peek(cacheId)
    if (hit) {
      const now = Date.now()
      return {
        ...hit.snap,
        generatedAt: now,
        fingerprint: `${cheap}::${scan}`,
        scanStamp: scan,
        db: withAges(hit.snap.db, now),
      }
    }
  }

  const omo = readOmo(opts.projectRoot)
  const extraIds = omo.delegates
    .map((d) => d.sessionId)
    .filter((id): id is string => Boolean(id))
  const db = withDbRead(
    () =>
      opts.sessionId
        ? readDbSnapshot({
            dbPath,
            sessionId: opts.sessionId,
            extraIds,
            projectRoot: opts.projectRoot,
          })
        : emptyDb(dbPath, "no session"),
    () => emptyDb(dbPath, "db read failed"),
  )

  const snap: LiveSnapshot = {
    generatedAt: Date.now(),
    fingerprint: `${cheap}::${scan}`,
    scanStamp: scan,
    db,
    omo,
    omoConfig: readOmoConfig(),
    delegates: enrichDelegates(omo, db),
  }
  liveCache.set(cacheId, { sessionId: opts.sessionId, scan, omo: omoKey, snap })
  return snap
}

const liveCache = createStampCache<{
  sessionId: string
  scan: string
  omo: string
  snap: LiveSnapshot
}>()

/** Drop the in-memory live snapshot so the next read is a real load. */
export function resetLiveCache(): void {
  liveCache.reset()
}

function withAges(db: DbSnapshot, now: number): DbSnapshot {
  const bump = (v: SessionView | null): SessionView | null =>
    v ? { ...v, ageMs: Math.max(0, now - v.timeUpdated) } : null
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
