/**
 * Thin readonly SQLite handle: prefers bun:sqlite, falls back to node:sqlite.
 * Never writes. Returns null when neither backend / DB is available.
 */
import { createRequire } from "node:module"
import fs from "node:fs"
import { dbg, profile, pushScreenLine } from "./pware.oc.core.debug.js"

export type SqlRow = Record<string, unknown>

export type SqlDb = {
  all: <T extends SqlRow = SqlRow>(sql: string, ...params: unknown[]) => T[]
  get: <T extends SqlRow = SqlRow>(sql: string, ...params: unknown[]) => T | null
  close: () => void
}

const require = createRequire(import.meta.url)

/**
 * Lock wait before a query fails with SQLITE_BUSY. Fail-fast: a transient WAL
 * checkpoint lock should surface as an error row (and a `sql.busy` debug line)
 * instead of blocking the whole TUI for seconds.
 */
const BUSY_TIMEOUT_MS = 100

/** One-line query label for the profile log; computed lazily (profiling off = free). */
function sqlLabel(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 80)
}

/** True when a thrown error is a SQLite lock/busy failure (SQLITE_BUSY). */
export function isBusyError(e: unknown): boolean {
  return e instanceof Error ? /locked|busy/i.test(e.message) : false
}

/**
 * Run a query, logging a `sql.busy` debug line when the DB is locked. The
 * error still propagates so `withDbRead` can retry once and then soft-fail.
 */
function guardQuery<T>(sql: string, fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (isBusyError(e)) dbg("sql.busy", "db locked", { q: sqlLabel(sql) })
    throw e
  }
}

function wrapBun(db: {
  query: (sql: string) => { all: (...p: unknown[]) => SqlRow[]; get: (...p: unknown[]) => SqlRow | null }
  exec: (sql: string) => void
  close: () => void
}): SqlDb {
  try {
    db.exec("PRAGMA query_only = ON")
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  } catch {
    // older / restricted
  }
  return {
    all: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      profile("sql", () => guardQuery(sql, () => db.query(sql).all(...params) as T[]), () => ({ q: sqlLabel(sql) })),
    get: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      profile("sql", () => guardQuery(sql, () => (db.query(sql).get(...params) as T | null) ?? null), () => ({ q: sqlLabel(sql) })),
    close: () => {
      try {
        db.close()
      } catch {
        // ignore
      }
    },
  }
}

function wrapNodeSync(db: {
  prepare: (sql: string) => {
    all: (...p: unknown[]) => SqlRow[]
    get: (...p: unknown[]) => SqlRow | undefined
  }
  exec: (sql: string) => void
  close: () => void
}): SqlDb {
  try {
    db.exec("PRAGMA query_only = ON")
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  } catch {
    // ignore
  }
  return {
    all: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      profile("sql", () => guardQuery(sql, () => db.prepare(sql).all(...params) as T[]), () => ({ q: sqlLabel(sql) })),
    get: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      profile("sql", () => guardQuery(sql, () => (db.prepare(sql).get(...params) as T | undefined) ?? null), () => ({ q: sqlLabel(sql) })),
    close: () => {
      try {
        db.close()
      } catch {
        // ignore
      }
    },
  }
}

let hold: { path: string; db: SqlDb } | null = null

function openFresh(dbPath: string): SqlDb | null {
  if (!dbPath || !fs.existsSync(dbPath)) return null
  try {
    if (typeof process.versions.bun === "string") {
      const { Database } = require("bun:sqlite") as {
        Database: new (
          path: string,
          opts?: { readonly?: boolean; create?: boolean },
        ) => Parameters<typeof wrapBun>[0]
      }
      return wrapBun(new Database(dbPath, { readonly: true, create: false }))
    }
  } catch {
    // try node next
  }
  try {
    const mod = require("node:sqlite") as {
      DatabaseSync: new (
        path: string,
        opts?: { readOnly?: boolean },
      ) => Parameters<typeof wrapNodeSync>[0]
    }
    if (!mod?.DatabaseSync) return null
    return wrapNodeSync(new mod.DatabaseSync(dbPath, { readOnly: true }))
  } catch {
    return null
  }
}

/** De-duplicated, non-empty string ids for `IN (...)` queries. */
export function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))]
}

/** Drop the cached handle so the next open is a real reopen. */
export function resetReadonlyDb(): void {
  if (!hold) return
  try {
    hold.db.close()
  } catch {
    // ignore
  }
  hold = null
}

/** Retry a read after dropping a stale handle. */
export function withDbRead<T>(run: () => T, fallback: (err: unknown) => T): T {
  try {
    return run()
  } catch (e) {
    resetReadonlyDb()
    try {
      return run()
    } catch {
      return fallback(e)
    }
  }
}

/** Open opencode.db readonly. Reuses one handle per path. Never throws — returns null on failure. */
export function openReadonlyDb(dbPath: string): SqlDb | null {
  if (!dbPath) return null
  if (hold?.path === dbPath) return hold.db
  resetReadonlyDb()
  const db = openFresh(dbPath)
  if (!db) return null
  hold = { path: dbPath, db }
  pushScreenLine("db open")
  return db
}
