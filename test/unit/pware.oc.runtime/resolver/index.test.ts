import { afterEach, describe, expect, test } from "bun:test"
import {
  computeFingerprint,
  readRuntimeSnapshot,
  resetRuntimeCache,
} from "../../../../src/pware.oc.runtime/resolver/index.js"
import { resetReadonlyDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb, type FixtureDb } from "../../../helpers/sqlite.js"
import { createFixtureProject } from "../../../helpers/project.js"

const NOW = Date.now()

let fix: FixtureDb | null = null
let proj: ReturnType<typeof createFixtureProject> | null = null

afterEach(() => {
  resetRuntimeCache()
  resetReadonlyDb()
  fix?.dispose()
  proj?.dispose()
  fix = null
  proj = null
})

describe("computeFingerprint", () => {
  test("joins sessionId with db/omo/oes/gitignore stamps into one key", () => {
    const fp = computeFingerprint({ dbPath: "C:/tmp/x.db", projectRoot: null, sessionId: "ses_1" })
    expect(fp.startsWith("ses_1::")).toBe(true)
    // dbStamp(dbPath) + omoStamp + oesStamp + gitignoreStamp, each "::"-joined.
    expect(fp.split("::")).toHaveLength(5)
  })

  test("changes when the project root supplies real stamps", () => {
    proj = createFixtureProject({})
    const a = computeFingerprint({ dbPath: "C:/tmp/x.db", projectRoot: null, sessionId: "ses_1" })
    const b = computeFingerprint({ dbPath: "C:/tmp/x.db", projectRoot: proj!.root, sessionId: "ses_1" })
    expect(a).not.toBe(b)
  })

  test("changes with the session id", () => {
    const a = computeFingerprint({ dbPath: "C:/tmp/x.db", projectRoot: null, sessionId: "ses_1" })
    const b = computeFingerprint({ dbPath: "C:/tmp/x.db", projectRoot: null, sessionId: "ses_2" })
    expect(a).not.toBe(b)
  })
})

describe("readRuntimeSnapshot", () => {
  test("an empty session id yields a no-session empty db without touching a real db", () => {
    const snap = readRuntimeSnapshot({ sessionId: "", projectRoot: null })
    expect(snap.db.present).toBe(false)
    expect(snap.db.error).toBe("no session")
    expect(snap.db.current).toBeNull()
    expect(snap.omo.present).toBe(false)
    expect(snap.delegates).toEqual([])
    expect(snap.openQuestions).toEqual([])
    expect(snap.omoConfig).toEqual({ present: false, path: null, teamMode: null, agents: [] })
  })

  test("reads the session graph from the fixture db (main session, no parent)", () => {
    proj = createFixtureProject({})
    fix = createFixtureDb({
      sessions: [
        { id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW },
        { id: "ses_old", project_id: "proj_a", title: "earlier", parent_id: null, time_updated: NOW - 60_000 },
      ],
      parts: [
        {
          id: "prt_1",
          session_id: "ses_main",
          time_created: NOW,
          data: { type: "text", time: { start: NOW, end: NOW } },
        },
      ],
    })
    const snap = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(snap.db.present).toBe(true)
    expect(snap.db.current?.id).toBe("ses_main")
    expect(snap.db.main?.id).toBe("ses_main")
    expect(snap.db.parent).toBeNull()
    expect(snap.db.projectId).toBe("proj_a")
    expect(snap.db.recent.map((s) => s.id)).toContain("ses_main")
    expect(snap.omo.present).toBe(false)
    expect(Array.isArray(snap.delegates)).toBe(true)
    expect(Array.isArray(snap.openQuestions)).toBe(true)
  })

  test("a child session surfaces its parent and main", () => {
    proj = createFixtureProject({})
    fix = createFixtureDb({
      sessions: [
        { id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW },
        { id: "ses_child", project_id: "proj_a", title: "worker", parent_id: "ses_main", time_updated: NOW - 1_000 },
      ],
    })
    const snap = readRuntimeSnapshot({
      sessionId: "ses_child",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(snap.db.current?.id).toBe("ses_child")
    expect(snap.db.parent?.id).toBe("ses_main")
    expect(snap.db.main?.id).toBe("ses_main")
    expect(snap.db.children).toEqual([])
  })

  test("a cache hit refreshes ages without re-reading (withAges, no hint)", () => {
    proj = createFixtureProject({})
    fix = createFixtureDb({
      sessions: [
        { id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW },
        { id: "ses_child", project_id: "proj_a", title: "worker", parent_id: "ses_main", time_updated: NOW - 1_000 },
        { id: "ses_old", project_id: "proj_a", title: "earlier", parent_id: null, time_updated: NOW - 60_000 },
      ],
    })
    const first = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    const second = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(second.db.present).toBe(true)
    expect(second.db.current?.id).toBe("ses_main")
    expect(second.db.children.map((c) => c.id)).toEqual(["ses_child"])
    expect(second.db.byId["ses_child"]?.id).toBe("ses_child")
    expect(typeof second.db.current?.ageMs).toBe("number")
  })

  test("a cache hit with a questionHint touches the question cache", () => {
    proj = createFixtureProject({})
    fix = createFixtureDb({
      sessions: [
        { id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW },
        { id: "ses_other", project_id: "proj_a", title: "other", parent_id: null, time_updated: NOW - 1_000 },
      ],
      parts: [
        {
          id: "prt_q",
          session_id: "ses_main",
          time_created: NOW - 1_000,
          data: {
            type: "tool",
            tool: "question",
            callID: "call_q",
            state: { status: "running", time: { start: NOW - 1_000 } },
          },
        },
      ],
    })
    const first = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(first.openQuestions.map((q) => q.sessionId)).toEqual(["ses_main"])

    const second = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
      questionHint: "ses_main",
    })
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(second.openQuestions.map((q) => q.sessionId)).toEqual(["ses_main"])
  })

  test("switching projects resets the question cache", () => {
    proj = createFixtureProject({})
    fix = createFixtureDb({
      sessions: [
        { id: "ses_a", project_id: "proj_a", title: "a", parent_id: null, time_updated: NOW },
        { id: "ses_b", project_id: "proj_b", title: "b", parent_id: null, time_updated: NOW - 1_000 },
      ],
      parts: [
        {
          id: "prt_a",
          session_id: "ses_a",
          time_created: NOW - 2_000,
          data: {
            type: "tool",
            tool: "question",
            callID: "call_a",
            state: { status: "running", time: { start: NOW - 2_000 } },
          },
        },
        {
          id: "prt_b",
          session_id: "ses_b",
          time_created: NOW - 1_500,
          data: {
            type: "tool",
            tool: "question",
            callID: "call_b",
            state: { status: "running", time: { start: NOW - 1_500 } },
          },
        },
      ],
    })
    const first = readRuntimeSnapshot({
      sessionId: "ses_a",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(first.openQuestions.map((q) => q.partId)).toEqual(["prt_a"])

    const second = readRuntimeSnapshot({
      sessionId: "ses_b",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(second.db.projectId).toBe("proj_b")
    expect(second.openQuestions.map((q) => q.partId)).toEqual(["prt_b"])
  })

  test("a questionHint on a fresh read touches the hint without a full reconcile", () => {
    proj = createFixtureProject({})
    fix = createFixtureDb({
      sessions: [
        { id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW },
        { id: "ses_other", project_id: "proj_a", title: "other", parent_id: null, time_updated: NOW - 1_000 },
      ],
      parts: [
        {
          id: "prt_q",
          session_id: "ses_main",
          time_created: NOW - 2_000,
          data: {
            type: "tool",
            tool: "question",
            callID: "call_q",
            state: { status: "running", time: { start: NOW - 2_000 } },
          },
        },
        {
          id: "prt_q2",
          session_id: "ses_other",
          time_created: NOW - 500,
          data: {
            type: "tool",
            tool: "question",
            callID: "call_q2",
            state: { status: "running", time: { start: NOW - 500 } },
          },
        },
      ],
    })
    const snap = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
      questionHint: "ses_other",
    })
    expect(snap.openQuestions.map((q) => q.sessionId)).toEqual(["ses_other"])
  })

  test("enriches delegates from an omo boulder present on disk", () => {
    proj = createFixtureProject({
      boulder: { status: "in_progress", agent: "oracle", plan_name: "plan", task_sessions: { task_1: { task_key: "task_1", task_title: "work", session_id: "ses_child", status: "running" } } },
    })
    fix = createFixtureDb({
      sessions: [
        { id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW },
        { id: "ses_child", project_id: "proj_a", title: "worker", parent_id: "ses_main", time_updated: NOW - 1_000 },
      ],
    })
    const snap = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(snap.omo.present).toBe(true)
    expect(snap.delegates.some((d) => d.sessionId === "ses_child")).toBe(true)
  })
})

describe("resetRuntimeCache", () => {
  test("clears the live cache so the next read is a fresh load", () => {
    proj = createFixtureProject({})
    fix = createFixtureDb({
      sessions: [{ id: "ses_main", project_id: "proj_a", title: "main", parent_id: null, time_updated: NOW }],
    })
    const first = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(first.db.present).toBe(true)
    resetRuntimeCache()
    const second = readRuntimeSnapshot({
      sessionId: "ses_main",
      projectRoot: proj!.root,
      dbPath: fix!.dbPath,
    })
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(second.db.present).toBe(true)
  })
})
