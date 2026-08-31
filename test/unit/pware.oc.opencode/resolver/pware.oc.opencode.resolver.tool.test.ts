import { afterAll, describe, expect, test } from "bun:test"
import {
  listRecentToolEvents,
  mergeTools,
} from "../../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.tool.js"
import { openReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb, patchPartData, toolPartData } from "../../../helpers/sqlite.js"

describe("mergeTools", () => {
  test("live running wins over db pending; completed is not clobbered", () => {
    const dbTools = [
      {
        id: "t1",
        name: "read a.ts",
        tool: "read",
        status: "pending" as const,
        startedAt: 1_000,
        endedAt: null,
        durationMs: null,
      },
      {
        id: "t2",
        name: "bash",
        tool: "bash",
        status: "completed" as const,
        startedAt: 500,
        endedAt: 800,
        durationMs: 300,
      },
    ]
    const live = {
      t1: { sessionId: "s", id: "t1", name: "tool", status: "running" as const },
      t2: { sessionId: "s", id: "t2", name: "bash", status: "running" as const },
    }
    const out = mergeTools(dbTools, live, 2_000, 8)
    expect(out[0]?.id).toBe("t1")
    expect(out[0]?.status).toBe("running")
    expect(out[0]?.name).toBe("read a.ts")
    expect(out.find((t) => t.id === "t2")?.status).toBe("completed")
  })
  test("caps to limit", () => {
    const dbTools = [1, 2, 3].map((n) => ({
      id: `t${n}`,
      name: `tool ${n}`,
      tool: "bash",
      status: "completed" as const,
      startedAt: n,
      endedAt: n,
      durationMs: 1,
    }))
    expect(mergeTools(dbTools, {}, 9, 2)).toHaveLength(2)
  })
  test("db part id and live callID are one row, not two", () => {
    const dbTools = [
      {
        id: "prt_1",
        callId: "call_1",
        name: "read a.ts",
        tool: "read",
        status: "running" as const,
        startedAt: 1_000,
        endedAt: null,
        durationMs: null,
      },
    ]
    const live = {
      call_1: { sessionId: "s", id: "call_1", name: "read", status: "running" as const },
    }
    const out = mergeTools(dbTools, live, 2_000, 8)
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe("prt_1")
    expect(out[0]?.callId).toBe("call_1")
    expect(out[0]?.status).toBe("running")
  })
  test("live hit alone starts a row; later db row merges into it", () => {
    const live = {
      call_1: { sessionId: "s", id: "call_1", name: "write b.ts", status: "running" as const },
    }
    const onlyLive = mergeTools([], live, 2_000, 8)
    expect(onlyLive).toHaveLength(1)
    expect(onlyLive[0]?.id).toBe("call_1")
    const dbTools = [
      {
        id: "prt_1",
        callId: "call_1",
        name: "write b.ts",
        tool: "write",
        status: "running" as const,
        startedAt: 1_500,
        endedAt: null,
        durationMs: null,
      },
    ]
    const merged = mergeTools(dbTools, live, 2_500, 8)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe("prt_1")
    expect(merged[0]?.startedAt).toBe(1_500)
  })
  test("finished calls sort by endedAt, so a long run does not fall below newer ones", () => {
    const dbTools = [
      {
        id: "t1",
        name: "bash long",
        tool: "bash",
        status: "completed" as const,
        startedAt: 1_000,
        endedAt: 9_000,
        durationMs: 8_000,
      },
      {
        id: "t2",
        name: "write quick",
        tool: "write",
        status: "completed" as const,
        startedAt: 5_000,
        endedAt: 6_000,
        durationMs: 1_000,
      },
    ]
    const out = mergeTools(dbTools, {}, 10_000, 8)
    expect(out[0]?.id).toBe("t1")
    expect(out[1]?.id).toBe("t2")
  })
  test("running sorts above finished regardless of timestamps", () => {
    const dbTools = [
      {
        id: "t_old_done",
        name: "bash old",
        tool: "bash",
        status: "completed" as const,
        startedAt: 1_000,
        endedAt: 2_000,
        durationMs: 1_000,
      },
    ]
    const live = {
      call_new: { sessionId: "s", id: "call_new", name: "read", status: "running" as const },
    }
    const out = mergeTools(dbTools, live, 5_000, 8)
    expect(out[0]?.id).toBe("call_new")
    expect(out[1]?.id).toBe("t_old_done")
  })
  test("live completed does not clobber db endedAt once the db row exists", () => {
    const dbTools = [
      {
        id: "prt_1",
        callId: "call_1",
        name: "bash",
        tool: "bash",
        status: "completed" as const,
        startedAt: 1_000,
        endedAt: 2_000,
        durationMs: 1_000,
      },
    ]
    const live = {
      call_1: { sessionId: "s", id: "call_1", name: "bash", status: "completed" as const },
    }
    const out = mergeTools(dbTools, live, 9_000, 8)
    expect(out).toHaveLength(1)
    expect(out[0]?.endedAt).toBe(2_000)
    expect(out[0]?.durationMs).toBe(1_000)
  })
})

describe("recent sessions feed queries", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a1", project_id: "proj_1", title: "A1", time_created: t0, time_updated: t0 + 600 },
      { id: "ses_a2", project_id: "proj_1", title: "A2 archived", time_created: t0, time_archived: t0 + 100 },
      { id: "ses_b1", project_id: "proj_2", title: "B1", time_created: t0, time_updated: t0 + 700 },
    ],
    parts: [
      {
        id: "prt_a_old",
        session_id: "ses_a1",
        time_created: t0 + 100,
        data: toolPartData({ tool: "bash", command: "old", callID: "c_old" }),
      },
      {
        id: "prt_a_new",
        session_id: "ses_a1",
        time_created: t0 + 500,
        data: toolPartData({
          tool: "edit",
          filePath: "src/a.ts",
          additions: 3,
          deletions: 1,
          callID: "c_new",
        }),
      },
      {
        id: "prt_a_archived",
        session_id: "ses_a2",
        time_created: t0 + 600,
        data: toolPartData({ tool: "bash", command: "archived", callID: "c_arch" }),
      },
      {
        id: "prt_b",
        session_id: "ses_b1",
        time_created: t0 + 700,
        data: toolPartData({ tool: "bash", command: "other project", callID: "c_b" }),
      },
      {
        id: "patch_a",
        session_id: "ses_a1",
        time_created: t0 + 200,
        data: patchPartData(["src/p.ts"]),
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("listRecentToolEvents: only the given sessions, newest first", () => {
    const db = openReadonlyDb(fix.dbPath)!
    const out = listRecentToolEvents(db, ["ses_a1", "ses_a2"])
    expect(out.map((t) => t.id)).toEqual(["prt_a_archived", "prt_a_new", "prt_a_old"])
    expect(out.every((t) => t.callId !== "c_b")).toBe(true)
  })

  test("listRecentToolEvents: caps to limit; empty ids yield []", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(listRecentToolEvents(db, ["ses_a1"], 1)).toHaveLength(1)
    expect(listRecentToolEvents(db, [])).toEqual([])
    expect(listRecentToolEvents(db, ["", "ses_a1", "ses_a1"])).toHaveLength(2)
  })
})
