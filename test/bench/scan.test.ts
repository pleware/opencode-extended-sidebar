/**
 * Plugin self-cost on a fat session (5k parts). Windows-tolerant budgets.
 *
 * A — TUI thread: fingerprint, sessionScanStamp, live snapshot hit/miss.
 *     Git spawn is async and is not in these budgets.
 * B — queries: tools/files LIMIT 80, Perf 120 turns without History.
 */
import { afterAll, describe, expect, test } from "bun:test"
import { listSessionFiles, listToolEvents, sessionScanStamp } from "../../src/db.js"
import { computeFingerprint, readLiveSnapshot, resetLiveCache } from "../../src/live.js"
import { readPerfSnapshot } from "../../src/perf.js"
import { openReadonlyDb, resetReadonlyDb } from "../../src/sqlite.js"
import { createFixtureDb, largeSessionSeed } from "../helpers/sqlite.js"

/** Generous so CI/Windows cold starts do not flake; tighten locally if needed. */
const FINGERPRINT_MS = 20
const SCAN_STAMP_MS = 20
const SNAP_HIT_MS = 40
const SNAP_MISS_MS = 250
const TOOLS_FILES_MS = 200
const PERF_MS = 400

const seed = largeSessionSeed({ turns: 120, partCount: 5_000, sessionId: "ses_bench" })
const fix = createFixtureDb(seed)

afterAll(() => {
  resetLiveCache()
  resetReadonlyDb()
  fix.dispose()
})

function elapsed(fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

describe("5k-part session budgets", () => {
  test("computeFingerprint stays cheap", () => {
    const ms = elapsed(() => {
      computeFingerprint({ dbPath: fix.dbPath, projectRoot: null, sessionId: "ses_bench" })
    })
    expect(ms).toBeLessThan(FINGERPRINT_MS)
  })

  test("sessionScanStamp stays cheap", () => {
    const db = openReadonlyDb(fix.dbPath)
    expect(db).toBeTruthy()
    const ms = elapsed(() => {
      sessionScanStamp(db!, "ses_bench")
    })
    expect(ms).toBeLessThan(SCAN_STAMP_MS)
  })

  test("readLiveSnapshot miss then hit", () => {
    resetLiveCache()
    const miss = elapsed(() => {
      const snap = readLiveSnapshot({
        sessionId: "ses_bench",
        projectRoot: null,
        dbPath: fix.dbPath,
        force: true,
      })
      expect(snap.db.present).toBe(true)
    })
    expect(miss).toBeLessThan(SNAP_MISS_MS)

    const hit = elapsed(() => {
      const snap = readLiveSnapshot({
        sessionId: "ses_bench",
        projectRoot: null,
        dbPath: fix.dbPath,
      })
      expect(snap.db.present).toBe(true)
    })
    expect(hit).toBeLessThan(SNAP_HIT_MS)
  })

  test("listToolEvents + listSessionFiles", () => {
    const db = openReadonlyDb(fix.dbPath)
    expect(db).toBeTruthy()
    const ms = elapsed(() => {
      listToolEvents(db!, "ses_bench")
      listSessionFiles(db!, "ses_bench")
    })
    expect(ms).toBeLessThan(TOOLS_FILES_MS)
  })

  test("readPerfSnapshot 120 turns without History", () => {
    const ms = elapsed(() => {
      const snap = readPerfSnapshot({
        dbPath: fix.dbPath,
        sessionId: "ses_bench",
        turns: 120,
        cacheKey: `bench-${Date.now()}`,
      })
      expect(snap.present).toBe(true)
      expect(snap.totals.turns).toBeGreaterThan(0)
    })
    expect(ms).toBeLessThan(PERF_MS)
  })
})
