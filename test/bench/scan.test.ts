/**
 * Plugin self-cost on a fat session (5k parts). Windows-tolerant budgets.
 *
 * A — TUI thread: fingerprint, sessionScanStamp, live snapshot hit/miss.
 *     Git spawn is async and is not in these budgets.
 * B — queries: tools/files LIMIT 80, Perf 120 turns without History.
 */
import { afterAll, describe, expect, test } from "bun:test"
import { listSessionFiles, listToolEvents, readProjectFeed, sessionScanStamp } from "../../src/db.js"
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
const PROJECT_FEED_MS = 300
const PERF_MS = 400

const seed = largeSessionSeed({ turns: 120, partCount: 5_000, sessionId: "ses_bench" })
const fix = createFixtureDb(seed)

/** 3 fat sessions in one project + a small session in another — the Sessions feed workload. */
const feedSeedA = largeSessionSeed({ turns: 120, partCount: 5_000, sessionId: "ses_feed_a" })
const feedSeedB = largeSessionSeed({ turns: 120, partCount: 5_000, sessionId: "ses_feed_b" })
const feedSeedC = largeSessionSeed({ turns: 120, partCount: 5_000, sessionId: "ses_feed_c" })
const feedSeedOther = largeSessionSeed({ turns: 10, partCount: 200, sessionId: "ses_feed_other" })
const stampSeed = (s: typeof feedSeedA, prefix: string) => ({
  sessions: s.sessions,
  messages: s.messages.map((m) => ({ ...m, id: `${prefix}_${m.id}` })),
  parts: s.parts.map((p) => ({
    ...p,
    id: `${prefix}_${p.id}`,
    message_id: `${prefix}_${p.message_id}`,
  })),
})
const feedA = stampSeed(feedSeedA, "a")
const feedB = stampSeed(feedSeedB, "b")
const feedC = stampSeed(feedSeedC, "c")
const feedOther = stampSeed(feedSeedOther, "o")
feedOther.sessions = feedOther.sessions.map((s) => ({ ...s, project_id: "proj_feed_other" }))
const feedFix = createFixtureDb({
  sessions: [...feedA.sessions, ...feedB.sessions, ...feedC.sessions, ...feedOther.sessions],
  messages: [...feedA.messages, ...feedB.messages, ...feedC.messages, ...feedOther.messages],
  parts: [...feedA.parts, ...feedB.parts, ...feedC.parts, ...feedOther.parts],
})

afterAll(() => {
  resetLiveCache()
  resetReadonlyDb()
  fix.dispose()
  feedFix.dispose()
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

  test("readProjectFeed across 3 fat sessions", () => {
    const ms = elapsed(() => {
      const feed = readProjectFeed({
        dbPath: feedFix.dbPath,
        sessionIds: ["ses_feed_a", "ses_feed_b", "ses_feed_c"],
        toolLimit: 8,
        filter: { skipGitignore: true, projectRoot: null },
      })
      expect(feed.tools.length).toBeGreaterThan(0)
      expect(feed.files.length).toBeGreaterThan(0)
      // only the given sessions are queried, not the other project's session
      expect(feed.tools.some((t) => t.id.startsWith("o_"))).toBe(false)
    })
    expect(ms).toBeLessThan(PROJECT_FEED_MS)
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
