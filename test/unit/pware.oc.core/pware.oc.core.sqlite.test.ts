import { describe, test, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  isBusyError,
  uniqueIds,
  resetReadonlyDb,
  withDbRead,
  openReadonlyDb,
} from "../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { resetDebug } from "../../../src/pware.oc.core/pware.oc.core.debug.js"

/** One temp dir; caller removes it. */
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oes-sqlite-test-"))
}

/** Real temp SQLite file with one row, so openReadonlyDb has a valid DB. */
function seedDb(): { dir: string; dbPath: string } {
  const dir = tmpDir()
  const dbPath = path.join(dir, "fixture.db")
  const db = new Database(dbPath)
  db.exec("CREATE TABLE t (a TEXT)")
  db.exec("INSERT INTO t VALUES ('hello')")
  db.close()
  return { dir, dbPath }
}

function rm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Windows may keep the handle briefly
  }
}

beforeEach(() => resetReadonlyDb())

describe("isBusyError", () => {
  test("true for SQLite lock/busy messages", () => {
    expect(isBusyError(new Error("database is locked"))).toBe(true)
    expect(isBusyError(new Error("database table is locked"))).toBe(true)
    expect(isBusyError(new Error("database is busy"))).toBe(true)
    expect(isBusyError(new Error("SQLITE_BUSY: locked"))).toBe(true)
  })

  test("false for unrelated errors", () => {
    expect(isBusyError(new Error("no such table"))).toBe(false)
    expect(isBusyError(new Error("boom"))).toBe(false)
  })

  test("false for non-Error values", () => {
    expect(isBusyError(null)).toBe(false)
    expect(isBusyError(undefined)).toBe(false)
    expect(isBusyError("database is locked")).toBe(false)
    expect(isBusyError(42)).toBe(false)
    expect(isBusyError({ message: "database is locked" })).toBe(false)
  })
})

describe("uniqueIds", () => {
  test("dedupes and drops empty strings", () => {
    expect(uniqueIds(["a", "b", "a", "", "c", "b"])).toEqual(["a", "b", "c"])
  })

  test("drops non-string entries", () => {
    expect(uniqueIds([1, null, undefined, "x"] as unknown as string[])).toEqual(["x"])
  })

  test("returns empty array for empty input", () => {
    expect(uniqueIds([])).toEqual([])
  })
})

describe("openReadonlyDb", () => {
  test("returns null for an empty path", () => {
    expect(openReadonlyDb("")).toBeNull()
  })

  test("returns null for a missing file", () => {
    expect(openReadonlyDb(path.join(os.tmpdir(), "oes-does-not-exist.db"))).toBeNull()
  })

  test("returns null for a directory path", () => {
    const dir = tmpDir()
    try {
      expect(openReadonlyDb(dir)).toBeNull()
    } finally {
      rm(dir)
    }
  })

  test("opens a real DB and runs all/get", () => {
    const { dir, dbPath } = seedDb()
    try {
      const db = openReadonlyDb(dbPath)
      expect(db).toBeTruthy()
      expect(db!.all("SELECT a FROM t")).toEqual([{ a: "hello" }])
      expect(db!.all("SELECT a FROM t WHERE a = ?", "hello")).toEqual([{ a: "hello" }])
      expect(db!.get("SELECT a FROM t WHERE a = ?", "hello")).toEqual({ a: "hello" })
      expect(db!.get("SELECT a FROM t WHERE a = ?", "missing")).toBeNull()
      db!.close()
    } finally {
      resetReadonlyDb()
      rm(dir)
    }
  })

  test("reuses the cached handle for the same path", () => {
    const { dir, dbPath } = seedDb()
    try {
      const a = openReadonlyDb(dbPath)
      const b = openReadonlyDb(dbPath)
      expect(a).toBeTruthy()
      expect(a).toBe(b)
    } finally {
      resetReadonlyDb()
      rm(dir)
    }
  })

  test("returns a handle for a corrupt file, then the query soft-fails", () => {
    const dir = tmpDir()
    const dbPath = path.join(dir, "corrupt.db")
    fs.writeFileSync(dbPath, "this is not a sqlite database, just garbage bytes")
    try {
      const db = openReadonlyDb(dbPath)
      expect(db).toBeTruthy()
      expect(() => db!.all("SELECT 1 AS one")).toThrow()
    } finally {
      resetReadonlyDb()
      rm(dir)
    }
  })
})

describe("resetReadonlyDb", () => {
  test("no-ops when no handle is held", () => {
    expect(() => resetReadonlyDb()).not.toThrow()
  })

  test("closes and clears a held handle", () => {
    const { dir, dbPath } = seedDb()
    try {
      const first = openReadonlyDb(dbPath)
      expect(first).toBeTruthy()
      resetReadonlyDb()
      const second = openReadonlyDb(dbPath)
      expect(second).toBeTruthy()
      expect(second).not.toBe(first)
      second!.close()
    } finally {
      resetReadonlyDb()
      rm(dir)
    }
  })
})

describe("withDbRead", () => {
  test("returns the run result on success", () => {
    expect(withDbRead(() => 42, () => 0)).toBe(42)
  })

  test("retries once after a first failure, then succeeds", () => {
    let n = 0
    const out = withDbRead(
      () => {
        n += 1
        if (n === 1) throw new Error("transient")
        return "ok"
      },
      () => "fallback",
    )
    expect(out).toBe("ok")
    expect(n).toBe(2)
  })

  test("falls back after two failures", () => {
    let n = 0
    const out = withDbRead(
      () => {
        n += 1
        throw new Error(`fail ${n}`)
      },
      (e) => `fallback:${(e as Error).message}`,
    )
    // fallback receives the first error; run is attempted twice.
    expect(out).toBe("fallback:fail 1")
    expect(n).toBe(2)
  })
})

describe("node:sqlite fallback", () => {
  test("opens via node:sqlite when bun is unavailable", () => {
    const { dir, dbPath } = seedDb()
    const saved = process.versions.bun
    try {
      ;(process.versions as Record<string, string | undefined>).bun = undefined
      const db = openReadonlyDb(dbPath)
      expect(db).toBeTruthy()
      expect(db!.all("SELECT a FROM t")).toEqual([{ a: "hello" }])
      expect(db!.get("SELECT a FROM t WHERE a = ?", "hello")).toEqual({ a: "hello" })
      db!.close()
    } finally {
      ;(process.versions as Record<string, string | undefined>).bun = saved
      resetReadonlyDb()
      rm(dir)
    }
  })

  test("node:sqlite close swallows a double close", () => {
    const { dir, dbPath } = seedDb()
    const saved = process.versions.bun
    try {
      ;(process.versions as Record<string, string | undefined>).bun = undefined
      const db = openReadonlyDb(dbPath)!
      db.close()
      expect(() => db.close()).not.toThrow()
    } finally {
      ;(process.versions as Record<string, string | undefined>).bun = saved
      resetReadonlyDb()
      rm(dir)
    }
  })
})

describe("sqlLabel via profiling", () => {
  test("runs the query label while profiling is active", () => {
    const { dir, dbPath } = seedDb()
    const logDir = tmpDir()
    const saved = process.env.OES_DEBUG_PROFILE
    try {
      process.env.OES_DEBUG_PROFILE = logDir
      resetDebug()
      const db = openReadonlyDb(dbPath)!
      expect(db.all("SELECT   a   FROM t")).toEqual([{ a: "hello" }])
      db.close()
    } finally {
      if (saved === undefined) delete process.env.OES_DEBUG_PROFILE
      else process.env.OES_DEBUG_PROFILE = saved
      resetDebug()
      resetReadonlyDb()
      rm(dir)
      rm(logDir)
    }
  })
})
