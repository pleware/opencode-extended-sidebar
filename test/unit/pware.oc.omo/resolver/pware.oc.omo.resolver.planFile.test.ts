import { afterAll, describe, expect, test } from "bun:test"
import {
  planSessionIndex,
  sessionForPlanFile,
} from "../../../../src/pware.oc.omo/resolver/pware.oc.omo.resolver.planFile.js"
import { openReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb, toolPartData } from "../../../helpers/sqlite.js"

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

  test("only plan/draft files are indexed; unwritten names never match", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(sessionForPlanFile(db, ".omo/drafts/never-written.md")).toBeNull()
    expect(sessionForPlanFile(db, "src/main.ts")).toBeNull()
  })

  test("null or empty path yields null", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(sessionForPlanFile(db, null)).toBeNull()
    expect(sessionForPlanFile(db, "")).toBeNull()
  })
})

describe("planSessionIndex", () => {
  const t0 = 1_800_000_000_000
  const root = "D:/proj"
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a", project_id: "proj_1", time_updated: t0 + 900 },
      { id: "ses_b", project_id: "proj_1", time_updated: t0 + 950 },
      { id: "ses_c", project_id: "proj_2", time_updated: t0 + 990 },
    ],
    parts: [
      {
        id: "p_a1",
        session_id: "ses_a",
        time_created: t0 + 100,
        time_updated: t0 + 100,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/drafts/x.md",
          start: t0 + 100,
          end: t0 + 100,
          callID: "a1",
        }),
      },
      {
        id: "p_a2",
        session_id: "ses_a",
        time_created: t0 + 200,
        time_updated: t0 + 200,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/plans/x.md",
          start: t0 + 200,
          end: t0 + 200,
          callID: "a2",
        }),
      },
      {
        id: "p_b1",
        session_id: "ses_b",
        time_created: t0 + 300,
        time_updated: t0 + 300,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/drafts/x.md",
          start: t0 + 300,
          end: t0 + 300,
          callID: "b1",
        }),
      },
      {
        id: "p_c1",
        session_id: "ses_c",
        time_created: t0 + 400,
        time_updated: t0 + 400,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/plans/x.md",
          start: t0 + 400,
          end: t0 + 400,
          callID: "c1",
        }),
      },
      {
        id: "p_b2",
        session_id: "ses_b",
        time_created: t0 + 500,
        time_updated: t0 + 500,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.sisyphus/plans/legacy.md",
          start: t0 + 500,
          end: t0 + 500,
          callID: "b2",
        }),
      },
    ],
  })

  afterAll(() => fix.dispose())

  const index = () => planSessionIndex(openReadonlyDb(fix.dbPath)!, "proj_1", root)

  test("a session writing drafts/ then plans/ keeps the plans/ file", () => {
    expect(index().sessionPlan.get("ses_a")).toEqual({
      rel: ".omo/plans/x.md",
      lastAt: t0 + 200,
      isPlan: true,
    })
  })

  test("a later drafts/ writer becomes the fileWriter for that basename", () => {
    expect(index().fileWriter.get("x.md")).toEqual({ sessionId: "ses_b", lastAt: t0 + 300 })
  })

  test("another project's writes do not leak into this project's maps", () => {
    const idx = index()
    expect(idx.sessionPlan.has("ses_c")).toBe(false)
    expect(idx.fileWriter.get("x.md")?.sessionId).toBe("ses_b")
  })

  test(".sisyphus/ plan files are indexed", () => {
    expect(index().fileWriter.get("legacy.md")?.sessionId).toBe("ses_b")
  })
})

describe("planSessionIndex write beats edit", () => {
  const t0 = 2_000_000_000_000
  const root = "D:/proj"
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a", project_id: "proj_1", time_updated: t0 + 100 },
      { id: "ses_b", project_id: "proj_1", time_updated: t0 + 200 },
    ],
    parts: [
      {
        id: "p_a1",
        session_id: "ses_a",
        time_created: t0 + 100,
        time_updated: t0 + 100,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/plans/x.md",
          start: t0 + 100,
          end: t0 + 100,
          callID: "a1",
        }),
      },
      {
        id: "p_b1",
        session_id: "ses_b",
        time_created: t0 + 200,
        time_updated: t0 + 200,
        data: toolPartData({
          tool: "edit",
          filePath: "D:/proj/.omo/plans/x.md",
          start: t0 + 200,
          end: t0 + 200,
          callID: "b1",
        }),
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("a write at t=100 beats a later edit at t=200", () => {
    const idx = planSessionIndex(openReadonlyDb(fix.dbPath)!, "proj_1", root)
    expect(idx.fileWriter.get("x.md")).toEqual({ sessionId: "ses_a", lastAt: t0 + 100 })
  })
})

describe("planSessionIndex tie-break", () => {
  const t0 = 1_900_000_000_000
  const root = "D:/proj"
  const fix = createFixtureDb({
    sessions: [{ id: "ses_tie", project_id: "proj_1", time_updated: t0 + 900 }],
    parts: [
      {
        id: "p_t1",
        session_id: "ses_tie",
        time_created: t0 + 100,
        time_updated: t0 + 100,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/drafts/tie.md",
          start: t0 + 100,
          end: t0 + 100,
          callID: "t1",
        }),
      },
      {
        id: "p_t2",
        session_id: "ses_tie",
        time_created: t0 + 100,
        time_updated: t0 + 100,
        data: toolPartData({
          tool: "write",
          filePath: "D:/proj/.omo/plans/tie.md",
          start: t0 + 100,
          end: t0 + 100,
          callID: "t2",
        }),
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("plans/ wins over drafts/ on an equal lastAt", () => {
    const idx = planSessionIndex(openReadonlyDb(fix.dbPath)!, "proj_1", root)
    expect(idx.sessionPlan.get("ses_tie")).toEqual({
      rel: ".omo/plans/tie.md",
      lastAt: t0 + 100,
      isPlan: true,
    })
  })
})
