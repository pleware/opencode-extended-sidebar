import { afterAll, describe, expect, test } from "bun:test"
import {
  inferStatus,
  sessionActivityState,
  sessionForPlanFile,
  toSessionView,
  type SessionRow,
} from "../../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import { openReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb, toolPartData } from "../../../helpers/sqlite.js"

function row(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "ses_1",
    project_id: "proj",
    parent_id: null,
    directory: "project",
    title: "  hello  ",
    agent: "build",
    model: "m",
    cost: 1.2,
    tokens_input: 10,
    tokens_output: 20,
    tokens_reasoning: 5,
    time_created: 1,
    time_updated: 1_000,
    time_archived: null,
    ...over,
  }
}

describe("inferStatus", () => {
  test("archived / running / idle", () => {
    const now = 10_000
    expect(inferStatus(row({ time_archived: 9_000 }), now)).toBe("archived")
    expect(inferStatus(row({ time_updated: now - 1_000 }), now)).toBe("running")
    expect(inferStatus(row({ time_updated: now - 5 * 60_000 }), now)).toBe("idle")
  })
})

describe("toSessionView", () => {
  test("trims title, sums tokens, marks main", () => {
    const v = toSessionView(row(), 2_000)
    expect(v.title).toBe("hello")
    expect(v.tokensTotal).toBe(35)
    expect(v.isMain).toBe(true)
    expect(v.parentId).toBeNull()
  })
  test("child is not main; empty title/agent fall back", () => {
    const v = toSessionView(row({ parent_id: "ses_p", title: "  ", agent: "  " }), 2_000)
    expect(v.isMain).toBe(false)
    expect(v.title).toBe("untitled")
    expect(v.agent).toBe("unknown")
  })
})

describe("sessionForPlanFile", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_old", project_id: "proj_1", title: "old planner", time_updated: t0 + 300 },
      { id: "ses_late", project_id: "proj_1", title: "recent planner", time_updated: t0 + 700 },
      { id: "ses_bash", project_id: "proj_1", title: "other work", time_updated: t0 + 800 },
    ],
    parts: [
      {
        id: "prt_w1",
        session_id: "ses_old",
        time_created: t0 + 100,
        time_updated: t0 + 150,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/drafts/perf-chart-libraries.md",
          start: t0 + 100,
          end: t0 + 150,
          callID: "call_w1",
        }),
      },
      {
        id: "prt_w2",
        session_id: "ses_late",
        time_created: t0 + 500,
        time_updated: t0 + 600,
        data: toolPartData({
          tool: "write",
          filePath: "D:\\proj\\.omo\\drafts\\perf-chart-libraries.md",
          start: t0 + 500,
          end: t0 + 600,
          callID: "call_w2",
        }),
      },
      {
        id: "prt_edit",
        session_id: "ses_bash",
        time_created: t0 + 700,
        time_updated: t0 + 750,
        data: toolPartData({
          tool: "edit",
          filePath: "src/main.ts",
          start: t0 + 700,
          end: t0 + 750,
          callID: "call_edit",
        }),
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("returns the most recent session that wrote the plan file", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(sessionForPlanFile(db, ".omo/drafts/perf-chart-libraries.md")).toBe("ses_late")
  })

  test("write-ish parts match by basename; unwritten names never match", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(sessionForPlanFile(db, ".omo/drafts/never-written.md")).toBeNull()
    expect(sessionForPlanFile(db, "src/main.ts")).toBe("ses_bash")
  })

  test("null or empty path yields null", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(sessionForPlanFile(db, null)).toBeNull()
    expect(sessionForPlanFile(db, "")).toBeNull()
  })
})

describe("sessionActivityState", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_stream", project_id: "proj_1", time_updated: t0 + 1_000 },
      { id: "ses_archived", project_id: "proj_1", time_updated: t0 + 1_000, time_archived: t0 + 500 },
      { id: "ses_idle", project_id: "proj_1", time_updated: t0 - 10 * 60_000 },
      { id: "ses_bg", project_id: "proj_1", time_updated: t0 - 10 * 60_000 },
    ],
  })

  afterAll(() => fix.dispose())

  const db = () => openReadonlyDb(fix.dbPath)!
  const now = t0

  test("unknown when no row exists", () => {
    expect(sessionActivityState(db(), "ses_nope", { now })).toEqual({ running: false, state: "unknown" })
  })

  test("archived wins over a fresh time_updated", () => {
    expect(sessionActivityState(db(), "ses_archived", { now })).toEqual({ running: false, state: "archived" })
  })

  test("fresh time_updated is streaming", () => {
    expect(sessionActivityState(db(), "ses_stream", { now })).toEqual({ running: true, state: "streaming" })
  })

  test("stale time_updated without a marker is idle", () => {
    expect(sessionActivityState(db(), "ses_idle", { now })).toEqual({ running: false, state: "idle" })
  })

  test("stale time_updated with an active background-task marker is awaiting-background", () => {
    expect(sessionActivityState(db(), "ses_bg", { now, backgroundTaskActive: true })).toEqual({
      running: true,
      state: "awaiting-background",
    })
  })

  test("a false background-task state soft-fails to idle", () => {
    expect(sessionActivityState(db(), "ses_bg", { now, backgroundTaskActive: false })).toEqual({
      running: false,
      state: "idle",
    })
  })
})
