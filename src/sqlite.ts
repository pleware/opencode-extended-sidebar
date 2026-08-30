/**
 * Thin readonly SQLite handle: prefers bun:sqlite, falls back to node:sqlite.
 * Never writes. Returns null when neither backend / DB is available.
 */
import { createRequire } from "node:module"
import fs from "node:fs"

export type SqlRow = Record<string, unknown>

export type SqlDb = {
  all: <T extends SqlRow = SqlRow>(sql: string, ...params: unknown[]) => T[]
  get: <T extends SqlRow = SqlRow>(sql: string, ...params: unknown[]) => T | null
  close: () => void
}

const require = createRequire(import.meta.url)

function wrapBun(db: {
  query: (sql: string) => { all: (...p: unknown[]) => SqlRow[]; get: (...p: unknown[]) => SqlRow | null }
  exec: (sql: string) => void
  close: () => void
}): SqlDb {
  try {
    db.exec("PRAGMA query_only = ON")
    db.exec("PRAGMA busy_timeout = 3000")
  } catch {
    // older / restricted
  }
  return {
    all: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      db.query(sql).all(...params) as T[],
    get: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      (db.query(sql).get(...params) as T | null) ?? null,
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
    db.exec("PRAGMA busy_timeout = 3000")
  } catch {
    // ignore
  }
  return {
    all: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...params) as T[],
    get: <T extends SqlRow>(sql: string, ...params: unknown[]) =>
      (db.prepare(sql).get(...params) as T | undefined) ?? null,
    close: () => {
      try {
        db.close()
      } catch {
        // ignore
      }
    },
  }
}

/** Open opencode.db readonly. Never throws — returns null on failure. */
export function openReadonlyDb(dbPath: string): SqlDb | null {
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
