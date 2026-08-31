/**
 * pware.oc.core.live.resolver
 *
 * Unified live snapshot: OpenCode SQLite + OMO files.
 * Fingerprint-driven — callers poll / watch and call readLiveSnapshot.
 */
import { createStampCache } from "../../cache.js"
import { gitignoreStamp } from "../../gitignore.js"
import { oesStamp } from "../../oes.js"
import { dbStamp, getOpenCodeDbPath } from "../../paths.js"
import { openReadonlyDb, withDbRead } from "../../sqlite.js"
import {
  emptyDb,
  readDbSnapshot,
  sessionScanStamp,
  type DbSnapshot,
  type SessionView,
} from "../opencode/index.js"
import {
  emptyOmo,
  omoStamp,
  readOmo,
  readOmoConfig,
  type OmoConfigView,
  type OmoSnapshot,
} from "../omo/index.js"
import { enrichDelegates, type DelegateView } from "./delegate.resolver.js"

export * from "./delegate.resolver.js"

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
