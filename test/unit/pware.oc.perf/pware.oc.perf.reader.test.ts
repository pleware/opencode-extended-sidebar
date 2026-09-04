import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  aggregate,
  collectPerfLogRows,
  formatColumns,
  formatPerfLog,
  perfLogFileName,
  readPerfLog,
  readPerfSnapshot,
  resetPerfCache,
  toolLogCall,
  writePerfLog,
  type MsgRow,
  type PartRow,
} from "../../../src/pware.oc.perf/pware.oc.perf.reader.js"
import { assistantMsg, createFixtureDb, textPartData, toolPartData } from "../../helpers/sqlite.js"
import { resetReadonlyDb } from "../../../src/pware.oc.core/pware.oc.core.sqlite.js"

function msg(over: Partial<MsgRow> & { id: string }): MsgRow {
  return {
    role: "assistant",
    model: "fast",
    provider: "test",
    created: 1_700_000_000_000,
    completed: 1_700_000_005_000,
    err: null,
    tin: 10,
    tout: 40,
    treason: 0,
    cread: 0,
    cwrite: 0,
    cost: 0,
    ...over,
  }
}

describe("aggregate", () => {
  test("splits wait / think / recv / tool and idle on the window", () => {
    const t0 = 1_700_000_000_000
    const msgs = [msg({ id: "m1", created: t0, completed: t0 + 5_000, tout: 40 })]
    const parts: PartRow[] = [
      { mid: "m1", kind: "reasoning", pstart: t0 + 200, pend: t0 + 800, tool: null, status: null, tstart: null, tend: null },
      { mid: "m1", kind: "text", pstart: t0 + 800, pend: t0 + 2_000, tool: null, status: null, tstart: null, tend: null },
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "bash", status: "completed", tstart: t0 + 3_000, tend: t0 + 4_000 },
    ]
    const snap = aggregate("ses", msgs, parts)
    expect(snap.totals.turns).toBe(1)
    expect(snap.totals.phases.wait).toBe(200)
    expect(snap.totals.phases.think).toBe(600)
    expect(snap.totals.phases.recv).toBe(1_200)
    expect(snap.totals.phases.tool).toBe(1_000)
    expect(snap.totals.wallMs).toBe(5_000)
    expect(snap.models[0]?.model).toBe("fast")
    expect(snap.tools[0]?.name).toBe("bash")
  })

  test("a tool that outlives the turn still counts in the tool phase", () => {
    const t0 = 1_700_000_000_000
    const msgs = [msg({ id: "m1", created: t0, completed: t0 + 1_000 })]
    const parts: PartRow[] = [
      { mid: "m1", kind: "text", pstart: t0 + 100, pend: t0 + 500, tool: null, status: null, tstart: null, tend: null },
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "task", status: "completed", tstart: t0 + 400, tend: t0 + 7_000 },
    ]
    const snap = aggregate("ses", msgs, parts)
    expect(snap.totals.phases.tool).toBe(6_600)
    expect(snap.totals.phases.tool).toBeGreaterThan(snap.totals.activeMs)
  })

  test("abort vs error", () => {
    const msgs = [
      msg({ id: "m1", err: "AbortError" }),
      msg({ id: "m2", err: "ProviderError", created: 6_000, completed: 7_000 }),
    ]
    const snap = aggregate("ses", msgs, [])
    expect(snap.totals.aborts).toBe(1)
    expect(snap.totals.errors).toBe(1)
  })

  test("question tool is excluded from tool timing and slow tools", () => {
    const t0 = 1_700_000_000_000
    const msgs = [msg({ id: "m1", created: t0, completed: t0 + 6_000 })]
    const parts: PartRow[] = [
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "bash", status: "completed", tstart: t0 + 1_000, tend: t0 + 2_000 },
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "question", status: "completed", tstart: t0 + 3_000, tend: t0 + 5_000 },
    ]
    const snap = aggregate("ses", msgs, parts)
    expect(snap.totals.phases.tool).toBe(1_000)
    expect(snap.tools.map((t) => t.name)).toEqual(["bash"])
    expect(snap.models[0]?.tools).toBe(1)
  })
})

describe("formatColumns", () => {
  test("pads every column but the last", () => {
    const out = formatColumns(["tool", "ms"], [["bash", "12"], ["read", "3"]])
    expect(out.split("\n")[0]).toBe("tool  ms")
    expect(out.split("\n")[1]).toBe("bash  12")
  })
})

describe("perf log", () => {
  const t0 = 1_700_000_000_000
  const msgs = [msg({ id: "m1", created: t0, completed: t0 + 5_000, tout: 40 })]
  const parts: PartRow[] = [
    { mid: "m1", kind: "reasoning", pstart: t0 + 200, pend: t0 + 800, tool: null, status: null, tstart: null, tend: null },
    { mid: "m1", kind: "text", pstart: t0 + 800, pend: t0 + 2_000, tool: null, status: null, tstart: null, tend: null },
    { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "bash", status: "completed", tstart: t0 + 3_000, tend: t0 + 4_000 },
  ]

  test("tools log has dated rows and a summary table", () => {
    const rows = collectPerfLogRows("tool", msgs, parts)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tool).toBe("bash")
    expect(rows[0]?.name).toBe("—")
    expect(rows[0]?.ms).toBe(1_000)
    const text = formatPerfLog("tool", "ses", t0, rows)
    expect(text).toContain("# generated 2023-11-14 22:13:20")
    expect(text).toContain("tool  call  count  errors  total  avg")
    expect(text).toContain("bash")
    expect(text).toContain("2023-11-14 22:13:23")
    expect(text).not.toContain("prompt")
  })

  test("tools log names the exact call, not just bash/read", () => {
    const hinted: PartRow[] = [
      {
        mid: "m1",
        kind: "tool",
        pstart: null,
        pend: null,
        tool: "read",
        status: "completed",
        tstart: t0 + 3_000,
        tend: t0 + 4_000,
        filePath: "src/db.ts",
      },
      {
        mid: "m1",
        kind: "tool",
        pstart: null,
        pend: null,
        tool: "bash",
        status: "completed",
        tstart: t0 + 4_000,
        tend: t0 + 5_000,
        command: "bun test test/unit/perf.test.ts",
      },
    ]
    expect(toolLogCall(hinted[0]!).call).toBe("db.ts")
    expect(toolLogCall(hinted[1]!).call).toContain("bun test")
    const text = formatPerfLog("tool", "ses", t0, collectPerfLogRows("tool", msgs, hinted))
    expect(text).toContain("read")
    expect(text).toContain("db.ts")
    expect(text).toContain("bun test")
    expect(text).toContain("ended")
    expect(text).not.toContain("D:/")
  })

  test("wait / think / recv rows follow the same spans as aggregate", () => {
    expect(collectPerfLogRows("wait", msgs, parts)[0]?.ms).toBe(200)
    expect(collectPerfLogRows("think", msgs, parts)[0]?.ms).toBe(600)
    expect(collectPerfLogRows("recv", msgs, parts)[0]?.ms).toBe(1_200)
  })

  test("writes a dated sidecar without throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-perf-"))
    // t0 = 1_700_000_000_000 → ms = 000
    const name = perfLogFileName("tool", t0)
    expect(name).toBe("perf-tools-2023-11-14-22-13-20-000.log")
    const abs = writePerfLog("hello\n", name, dir)
    expect(abs).toBe(path.join(dir, name))
    expect(fs.readFileSync(abs!, "utf8")).toBe("hello\n")
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test("perfLogFileName adds tool name and ms when toolFilter set", () => {
    const name = perfLogFileName("tool", t0 + 42, "bash")
    expect(name).toBe("perf-tools-bash-2023-11-14-22-13-20-042.log")
  })

  test("toolFilter keeps only matching tool rows", () => {
    const hinted: PartRow[] = [
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "bash", status: "completed", tstart: t0 + 3_000, tend: t0 + 4_000 },
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "read", status: "completed", tstart: t0 + 4_000, tend: t0 + 5_000 },
    ]
    const all = collectPerfLogRows("tool", msgs, hinted)
    expect(all).toHaveLength(2)
    // simulate toolFilter logic from readPerfLog
    const filtered = all.filter((r) => r.tool === "bash")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.tool).toBe("bash")
    const text = formatPerfLog("tool", "ses", t0, filtered, "tools · bash")
    expect(text).toContain("# Perf tools · bash log")
    expect(text).toContain("bash")
    expect(text).not.toContain("read")
  })

  test("question tool is absent from the tools log", () => {
    const hinted: PartRow[] = [
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "bash", status: "completed", tstart: t0 + 3_000, tend: t0 + 4_000 },
      { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "question", status: "completed", tstart: t0 + 4_000, tend: t0 + 5_000 },
    ]
    const rows = collectPerfLogRows("tool", msgs, hinted)
    expect(rows.map((r) => r.tool)).toEqual(["bash"])
  })
})

describe("model label fallback", () => {
  test("empty model and provider resolve to a generic label", () => {
    const msgs = [msg({ id: "m1", model: null, provider: null })]
    const snap = aggregate("ses", msgs, [])
    expect(snap.models[0]?.model).toBe("model")
    expect(snap.models[0]?.provider).toBe("")
  })
})

describe("collectPerfLogRows models and idle", () => {
  const t0 = 1_700_000_000_000
  const msgs = [msg({ id: "m1", created: t0, completed: t0 + 5_000, tout: 40 })]
  const parts: PartRow[] = [
    { mid: "m1", kind: "reasoning", pstart: t0 + 200, pend: t0 + 800, tool: null, status: null, tstart: null, tend: null },
    { mid: "m1", kind: "text", pstart: t0 + 800, pend: t0 + 2_000, tool: null, status: null, tstart: null, tend: null },
    { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "bash", status: "completed", tstart: t0 + 3_000, tend: t0 + 4_000 },
  ]

  test("models kind emits one turn row with tab-separated durations and token counts", () => {
    const rows = collectPerfLogRows("models", msgs, parts)
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.phase).toBe("turn")
    expect(r.name).toBe("fast")
    expect(r.extra).toBe("200ms\t600ms\t1.2s\t1.0s\t10\t40")
  })

  test("idle kind inserts a gap row between two assistant turns", () => {
    const two = [
      msg({ id: "m1", created: t0, completed: t0 + 1_000 }),
      msg({ id: "m2", created: t0 + 5_000, completed: t0 + 6_000 }),
    ]
    const rows = collectPerfLogRows("idle", two, [])
    const gaps = rows.filter((r) => r.phase === "idle")
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.ms).toBe(4_000)
    expect(gaps[0]?.name).toBe("gap")
    expect(gaps[0]?.status).toBe("ok")
  })
})

describe("formatPerfLog branches", () => {
  const t0 = 1_700_000_000_000
  const msgs = [msg({ id: "m1", created: t0, completed: t0 + 5_000, tout: 40 })]
  const parts: PartRow[] = [
    { mid: "m1", kind: "reasoning", pstart: t0 + 200, pend: t0 + 800, tool: null, status: null, tstart: null, tend: null },
    { mid: "m1", kind: "text", pstart: t0 + 800, pend: t0 + 2_000, tool: null, status: null, tstart: null, tend: null },
    { mid: "m1", kind: "tool", pstart: null, pend: null, tool: "bash", status: "completed", tstart: t0 + 3_000, tend: t0 + 4_000 },
  ]

  test("empty rows print the no-rows marker", () => {
    const text = formatPerfLog("wait", "ses", t0, [])
    expect(text).toContain("(no rows)")
  })

  test("models table renders when/name/duration/token columns", () => {
    const rows = collectPerfLogRows("models", msgs, parts)
    const text = formatPerfLog("models", "ses", t0, rows)
    expect(text).toContain("model")
    expect(text).toContain("wait")
    expect(text).toContain("fast")
    expect(text).toContain("10")
    expect(text).toContain("40")
  })

  test("time timeline lists phase/tool/call/status/duration columns", () => {
    const rows = collectPerfLogRows("time", msgs, parts)
    const text = formatPerfLog("time", "ses", t0, rows)
    expect(text).toContain("phase")
    expect(text).toContain("duration")
    expect(text).toContain("wait")
    expect(text).toContain("bash")
  })

  test("single-phase log uses name/status/duration columns", () => {
    const rows = collectPerfLogRows("wait", msgs, parts)
    const text = formatPerfLog("wait", "ses", t0, rows)
    expect(text).toContain("name")
    expect(text).toContain("status")
    expect(text).toContain("duration")
    expect(text).toContain("fast")
    expect(text).toContain("ok")
  })
})

describe("writePerfLog failure", () => {
  test("returns null when the target dir cannot be created", () => {
    const file = path.join(os.tmpdir(), `oes-perf-file-${Date.now()}`)
    fs.writeFileSync(file, "x")
    const out = writePerfLog("hello", "x.log", file)
    expect(out).toBeNull()
    fs.rmSync(file, { force: true })
  })
})

describe("readPerfLog", () => {
  const T0 = 1_700_000_000_000

  function makePerfFixture() {
    return createFixtureDb({
      sessions: [
        { id: "ses_main", title: "main" },
        { id: "ses_hist", title: "history" },
        { id: "ses_empty", title: "empty" },
      ],
      messages: [
        { id: "m1", session_id: "ses_main", data: assistantMsg({ created: T0, completed: T0 + 5_000, tin: 10, tout: 40 }) },
        { id: "h1", session_id: "ses_hist", data: assistantMsg({ created: T0, completed: T0 + 2_000, tin: 5, tout: 20 }) },
      ],
      parts: [
        { id: "p1", session_id: "ses_main", message_id: "m1", data: textPartData({ kind: "reasoning", start: T0 + 200, end: T0 + 800 }) },
        { id: "p2", session_id: "ses_main", message_id: "m1", data: textPartData({ start: T0 + 800, end: T0 + 2_000 }) },
        { id: "p3", session_id: "ses_main", message_id: "m1", data: toolPartData({ tool: "bash", command: "bun test test/unit/perf.test.ts", start: T0 + 3_000, end: T0 + 4_000 }) },
        { id: "p4", session_id: "ses_main", message_id: "m1", data: toolPartData({ tool: "read", filePath: "src/db.ts", start: T0 + 3_500, end: T0 + 3_800 }) },
        {
          id: "p5",
          session_id: "ses_main",
          message_id: "m1",
          data: { type: "tool", tool: "task", callID: "call_task", state: { status: "completed", time: { start: T0 + 4_000, end: T0 + 4_500 }, input: { subagent_type: "explore" } } },
        },
      ],
    })
  }

  test("returns null when the db file is missing", () => {
    const out = readPerfLog({ dbPath: path.join(os.tmpdir(), `oes-nope-${Date.now()}.db`), sessionId: "s", turns: 10, kind: "tool", now: T0 })
    expect(out).toBeNull()
  })

  test("writes a dated sidecar and folds tool hints from state.input", () => {
    const fix = makePerfFixture()
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-perf-log-"))
    const doc = readPerfLog({ dbPath: fix.dbPath, sessionId: "ses_main", turns: 120, kind: "tool", now: T0, logDir })
    expect(doc).not.toBeNull()
    expect(doc!.text).toContain("bash")
    expect(doc!.text).toContain("bun test")
    expect(doc!.text).toContain("db.ts")
    expect(doc!.text).toContain("explore")
    expect(doc!.written).toBe(path.join(logDir, doc!.fileName))
    expect(fs.existsSync(doc!.written!)).toBe(true)
    fix.dispose()
    fs.rmSync(logDir, { recursive: true, force: true })
  })

  test("toolFilter keeps only the matching tool and labels the title", () => {
    const fix = makePerfFixture()
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-perf-log-"))
    const doc = readPerfLog({ dbPath: fix.dbPath, sessionId: "ses_main", turns: 120, kind: "tool", now: T0, toolFilter: "bash", logDir })
    expect(doc).not.toBeNull()
    expect(doc!.text).toContain("tools · bash")
    expect(doc!.text).toContain("bash")
    expect(doc!.text).not.toContain("db.ts")
    fix.dispose()
    fs.rmSync(logDir, { recursive: true, force: true })
  })
})

describe("readPerfSnapshot", () => {
  const T0 = 1_700_000_000_000

  function makePerfFixture() {
    return createFixtureDb({
      sessions: [
        { id: "ses_main", title: "main" },
        { id: "ses_hist", title: "history" },
        { id: "ses_empty", title: "empty" },
      ],
      messages: [
        { id: "m1", session_id: "ses_main", data: assistantMsg({ created: T0, completed: T0 + 5_000, tin: 10, tout: 40 }) },
        { id: "h1", session_id: "ses_hist", data: assistantMsg({ created: T0, completed: T0 + 2_000, tin: 5, tout: 20 }) },
      ],
      parts: [
        { id: "p1", session_id: "ses_main", message_id: "m1", data: textPartData({ kind: "reasoning", start: T0 + 200, end: T0 + 800 }) },
        { id: "p2", session_id: "ses_main", message_id: "m1", data: textPartData({ start: T0 + 800, end: T0 + 2_000 }) },
        { id: "p3", session_id: "ses_main", message_id: "m1", data: toolPartData({ tool: "bash", command: "bun test", start: T0 + 3_000, end: T0 + 4_000 }) },
      ],
    })
  }

  test("loads a snapshot with per-session history, skipping self and empty sessions", () => {
    resetPerfCache()
    const fix = makePerfFixture()
    const snap = readPerfSnapshot({
      dbPath: fix.dbPath,
      sessionId: "ses_main",
      turns: 120,
      history: [
        { id: "ses_hist", title: "history" },
        { id: "ses_empty", title: "empty" },
        { id: "ses_main", title: "self" },
      ],
    })
    expect(snap.present).toBe(true)
    expect(snap.totals.turns).toBe(1)
    expect(snap.models[0]?.model).toBe("test-model")
    expect(snap.history).toHaveLength(1)
    expect(snap.history[0]?.id).toBe("ses_hist")
    expect(snap.history[0]?.turns).toBe(1)
    fix.dispose()
  })

  test("a second read within the TTL reuses the cached history", () => {
    resetPerfCache()
    const fix = makePerfFixture()
    const opts = { dbPath: fix.dbPath, sessionId: "ses_main", turns: 120, history: [{ id: "ses_hist", title: "history" }] }
    const first = readPerfSnapshot(opts)
    const second = readPerfSnapshot(opts)
    expect(first.history).toHaveLength(1)
    expect(second.history).toHaveLength(1)
    fix.dispose()
  })

  test("missing db reports db missing without throwing", () => {
    resetPerfCache()
    const snap = readPerfSnapshot({ dbPath: path.join(os.tmpdir(), `oes-none-${Date.now()}.db`), sessionId: "s", turns: 10 })
    expect(snap.present).toBe(false)
    expect(snap.error).toBe("db missing")
  })

  test("a non-database path reports sqlite unavailable", () => {
    resetPerfCache()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-dir-"))
    const snap = readPerfSnapshot({ dbPath: dir, sessionId: "s", turns: 10 })
    expect(snap.present).toBe(false)
    expect(snap.error).toBe("sqlite unavailable")
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test("a db without the message table soft-fails with an error string", () => {
    resetPerfCache()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oes-bad-"))
    const dbPath = path.join(dir, "bad.db")
    const db = new Database(dbPath)
    db.exec("CREATE TABLE other (id TEXT)")
    db.close()
    const snap = readPerfSnapshot({ dbPath, sessionId: "s", turns: 10 })
    expect(snap.present).toBe(false)
    expect(typeof snap.error).toBe("string")
    expect(snap.error!.length).toBeGreaterThan(0)
    resetReadonlyDb()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test("cacheKey returns a present snapshot on the cache path", () => {
    resetPerfCache()
    const fix = makePerfFixture()
    const opts = { dbPath: fix.dbPath, sessionId: "ses_main", turns: 120, cacheKey: "perf-key-1" }
    const a = readPerfSnapshot(opts)
    const b = readPerfSnapshot(opts)
    expect(a.present).toBe(true)
    expect(a.totals.turns).toBe(1)
    expect(b.present).toBe(true)
    expect(b.totals.turns).toBe(1)
    fix.dispose()
  })
})
