/**
 * Unified live snapshot: OpenCode SQLite + OMO files.
 * Fingerprint-driven — callers poll / watch and call readLiveSnapshot.
 */
import { emptyDb, readDbSnapshot, type DbSnapshot } from "./db.js"
import { emptyOmo, readOmo, readOmoConfig, type Delegate, type OmoConfigView, type OmoSnapshot } from "./omo.js"
import { gitStatusStamp } from "./git.js"
import { gitignoreStamp } from "./gitignore.js"
import { oesStamp } from "./oes.js"
import { dbStamp, getOpenCodeDbPath } from "./paths.js"

export type DelegateView = Delegate & {
  tokensTotal: number | null
  timeUpdated: number | null
  archived: boolean
}

export type LiveSnapshot = {
  generatedAt: number
  fingerprint: string
  db: DbSnapshot
  omo: OmoSnapshot
  omoConfig: OmoConfigView
  delegates: DelegateView[]
}

export function computeFingerprint(opts: {
  dbPath: string
  projectRoot: string | null
  sessionId: string
}): string {
  const omo = readOmo(opts.projectRoot)
  return [
    opts.sessionId,
    dbStamp(opts.dbPath),
    omo.stamp,
    omo.boulderPath || "",
    oesStamp(opts.projectRoot),
    gitignoreStamp(opts.projectRoot),
    gitStatusStamp(opts.projectRoot),
  ].join("::")
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
}): LiveSnapshot {
  const dbPath = opts.dbPath || getOpenCodeDbPath()
  const omo = readOmo(opts.projectRoot)
  const extraIds = omo.delegates
    .map((d) => d.sessionId)
    .filter((id): id is string => Boolean(id))
  const db = opts.sessionId
    ? readDbSnapshot({
        dbPath,
        sessionId: opts.sessionId,
        extraIds,
        projectRoot: opts.projectRoot,
      })
    : emptyDb(dbPath, "no session")
  const fingerprint = [
    opts.sessionId,
    dbStamp(dbPath),
    omo.stamp,
    oesStamp(opts.projectRoot),
    gitignoreStamp(opts.projectRoot),
    gitStatusStamp(opts.projectRoot),
  ].join("::")

  return {
    generatedAt: Date.now(),
    fingerprint,
    db,
    omo,
    omoConfig: readOmoConfig(),
    delegates: enrichDelegates(omo, db),
  }
}
