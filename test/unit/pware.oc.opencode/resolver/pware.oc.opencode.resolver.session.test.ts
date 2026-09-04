import { afterAll, describe, expect, test } from "bun:test"
import {
  getSessionsByIds,
  inferStatus,
  isRealSession,
  listChildSessions,
  listRecentMainSessions,
  listSiblingSessions,
  refreshSessionStatus,
  sessionActivityState,
  sessionScanStamp,
  toSessionView,
  type SessionRow,
} from "../../../../src/pware.oc.opencode/resolver/pware.oc.opencode.resolver.session.js"
import { openReadonlyDb, type SqlDb } from "../../../../src/pware.oc.core/pware.oc.core.sqlite.js"
import { createFixtureDb } from "../../../helpers/sqlite.js"

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
    has_content: 1,
    ...over,
  }
}

function throwingDb(): SqlDb {
  return {
    all: () => {
      throw new Error("boom")
    },
    get: () => {
      throw new Error("boom")
    },
    close: () => {},
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

describe("refreshSessionStatus", () => {
  test("keeps archived, recomputes running/idle/unknown from the fresh clock", () => {
    const now = 10_000
    expect(refreshSessionStatus(toSessionView(row({ time_archived: 9_000 })), now)).toBe("archived")
    expect(
      refreshSessionStatus(toSessionView(row({ time_updated: now - 1_000 })), now),
    ).toBe("running")
    expect(
      refreshSessionStatus(toSessionView(row({ time_updated: now - 5 * 60_000 })), now),
    ).toBe("idle")
  })
})

describe("toSessionView", () => {
  test("trims title, sums tokens, marks main", () => {
    const v = toSessionView(row(), 2_000)
    expect(v.title).toBe("hello")
    expect(v.tokensTotal).toBe(35)
    expect(v.isMain).toBe(true)
    expect(v.parentId).toBeNull()
    expect(v.hasContent).toBe(true)
  })
  test("child is not main; empty title/agent fall back", () => {
    const v = toSessionView(row({ parent_id: "ses_p", title: "  ", agent: "  " }), 2_000)
    expect(v.isMain).toBe(false)
    expect(v.title).toBe("untitled")
    expect(v.agent).toBe("unknown")
  })
  test("has_content 0 maps to hasContent false (ghost)", () => {
    expect(toSessionView(row({ has_content: 0 }), 2_000).hasContent).toBe(false)
  })
})

describe("isRealSession", () => {
  test("real when hasContent, ghost when not", () => {
    expect(isRealSession({ hasContent: true })).toBe(true)
    expect(isRealSession({ hasContent: false })).toBe(false)
  })
})

describe("listRecentMainSessions", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_real", project_id: "proj_1", parent_id: null, time_updated: t0 },
      { id: "ses_ghost", project_id: "proj_1", parent_id: null, time_updated: t0 - 1_000 },
    ],
    parts: [{ id: "prt_1", session_id: "ses_real", time_created: t0, data: { type: "text" } }],
  })

  afterAll(() => fix.dispose())

  test("excludes ghosts (sessions with no parts) from recent", () => {
    const db = openReadonlyDb(fix.dbPath)!
    const ids = listRecentMainSessions(db, { projectId: "proj_1" }).map((r) => r.id)
    expect(ids).toEqual(["ses_real"])
  })

  test("soft-fails to empty when the query throws", () => {
    expect(listRecentMainSessions(throwingDb(), { projectId: "proj_1" })).toEqual([])
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

describe("listChildSessions", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_parent", project_id: "proj_1", time_updated: t0 },
      { id: "ses_child_old", project_id: "proj_1", parent_id: "ses_parent", time_updated: t0 - 2_000 },
      { id: "ses_child_new", project_id: "proj_1", parent_id: "ses_parent", time_updated: t0 - 1_000 },
      { id: "ses_unrelated", project_id: "proj_1", parent_id: "ses_other", time_updated: t0 + 5_000 },
    ],
  })

  afterAll(() => fix.dispose())

  test("returns only children of the parent, newest first", () => {
    const db = openReadonlyDb(fix.dbPath)!
    const ids = listChildSessions(db, "ses_parent").map((r) => r.id)
    expect(ids).toEqual(["ses_child_new", "ses_child_old"])
  })
})

describe("listSiblingSessions", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_parent", project_id: "proj_1", time_updated: t0 },
      { id: "ses_self", project_id: "proj_1", parent_id: "ses_parent", time_updated: t0 },
      { id: "ses_sib_old", project_id: "proj_1", parent_id: "ses_parent", time_updated: t0 - 2_000 },
      { id: "ses_sib_new", project_id: "proj_1", parent_id: "ses_parent", time_updated: t0 - 1_000 },
      { id: "ses_unrelated", project_id: "proj_1", parent_id: "ses_other", time_updated: t0 + 5_000 },
    ],
  })

  afterAll(() => fix.dispose())

  test("returns same-parent siblings excluding self, newest first", () => {
    const db = openReadonlyDb(fix.dbPath)!
    const ids = listSiblingSessions(db, "ses_parent", "ses_self").map((r) => r.id)
    expect(ids).toEqual(["ses_sib_new", "ses_sib_old"])
  })

  test("no siblings yields empty list", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(listSiblingSessions(db, "ses_none", "ses_x")).toEqual([])
  })
})

describe("getSessionsByIds", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [
      { id: "ses_a", project_id: "proj_1", time_updated: t0 },
      { id: "ses_b", project_id: "proj_1", time_updated: t0 - 1_000 },
    ],
  })

  afterAll(() => fix.dispose())

  test("empty input short-circuits", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(getSessionsByIds(db, [])).toEqual([])
  })

  test("dedups ids and filters blanks", () => {
    const db = openReadonlyDb(fix.dbPath)!
    const rows = getSessionsByIds(db, ["ses_a", "", "ses_a", "ses_b"])
    expect(rows.map((r) => r.id).sort()).toEqual(["ses_a", "ses_b"])
  })
})

describe("sessionScanStamp", () => {
  const t0 = 1_700_000_000_000
  const fix = createFixtureDb({
    sessions: [{ id: "ses_stamp", project_id: "proj_1", time_updated: t0 }],
    parts: [{ id: "prt_1", session_id: "ses_stamp", time_updated: t0 + 100, data: { type: "text" } }],
  })

  afterAll(() => fix.dispose())

  test("combines session and max part stamps", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(sessionScanStamp(db, "ses_stamp")).toBe(`${t0}|${t0 + 100}`)
  })

  test("missing session soft-fails to zeros", () => {
    const db = openReadonlyDb(fix.dbPath)!
    expect(sessionScanStamp(db, "ses_nope")).toBe("0|0")
  })

  test("a throwing db soft-fails to 'x'", () => {
    expect(sessionScanStamp(throwingDb(), "ses_stamp")).toBe("x")
  })
})
