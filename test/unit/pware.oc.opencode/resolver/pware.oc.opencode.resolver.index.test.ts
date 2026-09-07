import { afterAll, describe, expect, test } from "bun:test"
import {
  emptyProjectFeed,
  readDbSnapshot,
  readProjectFeed,
} from "../../../../src/pware.oc.opencode/resolver/index.js"
import { HOUR_MS } from "../../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import { SESSION_STATUS_RUNNING } from "../../../../src/pware.oc.opencode/constants/pware.oc.opencode.constants.sessionStatus.js"
import { openReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb, patchPartData, toolPartData } from "../../../helpers/sqlite.js"
import { createFixtureProject } from "../../../helpers/project.js"

describe("readProjectFeed", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a1", project_id: "proj_1", title: "A1", time_created: t0, time_updated: t0 + 600 },
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
        id: "patch_a",
        session_id: "ses_a1",
        time_created: t0 + 200,
        data: patchPartData(["src/p.ts"]),
      },
    ],
  })

  afterAll(() => fix.dispose())

  test("returns both feeds; missing db / empty sessionIds yield empty", () => {
    const db = openReadonlyDb(fix.dbPath)
    expect(db).toBeTruthy()
    const feed = readProjectFeed(db!, { dbPath: fix.dbPath, sessionIds: ["ses_a1"], toolLimit: 8 })
    expect(feed.tools.map((t) => t.id)).toEqual(["prt_a_new", "prt_a_old"])
    expect(feed.files.some((f) => f.id === "src/a.ts")).toBe(true)

    expect(readProjectFeed(db!, { dbPath: fix.dbPath, sessionIds: [], toolLimit: 8 })).toEqual(
      emptyProjectFeed(),
    )
  })
})

describe("readDbSnapshot", () => {
  const now = Date.now()
  const proj = createFixtureProject({ oes: { sessionVisibleHours: 72, sessionDimHours: 48 } })
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_cur", project_id: "proj_1", title: "current", parent_id: null, time_updated: now - 2 * HOUR_MS },
      { id: "ses_2h", project_id: "proj_1", title: "two hours", parent_id: null, time_updated: now - 2 * HOUR_MS },
      { id: "ses_60h", project_id: "proj_1", title: "sixty hours", parent_id: null, time_updated: now - 60 * HOUR_MS },
      { id: "ses_100h", project_id: "proj_1", title: "hundred hours", parent_id: null, time_updated: now - 100 * HOUR_MS },
      { id: "ses_parent", project_id: "proj_1", title: "old parent", parent_id: null, time_updated: now - 100 * HOUR_MS },
      { id: "ses_child", project_id: "proj_1", title: "child", parent_id: "ses_parent", time_updated: now - 60_000 },
      { id: "ses_running", project_id: "proj_1", title: "running", parent_id: null, time_updated: now - 30_000 },
    ],
    parts: [
      { id: "prt_cur", session_id: "ses_cur", data: toolPartData({ tool: "bash", command: "x" }) },
      { id: "prt_2h", session_id: "ses_2h", data: toolPartData({ tool: "bash", command: "x" }) },
      { id: "prt_60h", session_id: "ses_60h", data: toolPartData({ tool: "bash", command: "x" }) },
      { id: "prt_100h", session_id: "ses_100h", data: toolPartData({ tool: "bash", command: "x" }) },
      { id: "prt_parent", session_id: "ses_parent", data: toolPartData({ tool: "bash", command: "x" }) },
      { id: "prt_child", session_id: "ses_child", data: toolPartData({ tool: "bash", command: "x" }) },
      { id: "prt_running", session_id: "ses_running", data: toolPartData({ tool: "bash", command: "x" }) },
    ],
  })

  afterAll(() => {
    fix.dispose()
    proj.dispose()
  })

  test("drops hidden-band sessions, keeps current and dim-band", () => {
    const snap = readDbSnapshot(openReadonlyDb(fix.dbPath)!, { dbPath: fix.dbPath, sessionId: "ses_cur", projectRoot: proj.root })
    const ids = snap.recent.map((s) => s.id)
    expect(ids).toContain("ses_cur")
    expect(ids).toContain("ses_2h")
    expect(ids).toContain("ses_60h")
    expect(ids).not.toContain("ses_100h")
    expect(ids).not.toContain("ses_parent")
  })

  test("exempts the main parent and running sessions from the hidden filter", () => {
    const snap = readDbSnapshot(openReadonlyDb(fix.dbPath)!, { dbPath: fix.dbPath, sessionId: "ses_child", projectRoot: proj.root })
    const ids = snap.recent.map((s) => s.id)
    expect(ids).toContain("ses_parent")
    expect(ids).toContain("ses_running")
    expect(snap.recent.find((s) => s.id === "ses_running")?.status).toBe(SESSION_STATUS_RUNNING)
    expect(ids).not.toContain("ses_100h")
  })

  test("current session survives even when older than the visible window", () => {
    const snap = readDbSnapshot(openReadonlyDb(fix.dbPath)!, { dbPath: fix.dbPath, sessionId: "ses_parent", projectRoot: proj.root })
    expect(snap.current?.id).toBe("ses_parent")
    expect(snap.recent.map((s) => s.id)).toContain("ses_parent")
  })
})
