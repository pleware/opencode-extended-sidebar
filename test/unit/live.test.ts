import { describe, expect, test } from "bun:test"
import { emptyDb, type SessionView } from "../../src/db.js"
import {
  delegatesForSession,
  groupDelegates,
  reconcileDelegateStatus,
  type DelegateView,
  type LiveSnapshot,
} from "../../src/live.js"
import { emptyOmo } from "../../src/omo.js"

function agent(over: Partial<SessionView> & { id: string }): SessionView {
  return {
    title: over.title ?? over.id,
    agent: "build",
    status: "idle",
    isMain: !over.parentId,
    parentId: over.parentId ?? null,
    directory: "project",
    tokensTotal: 0,
    cost: 0,
    timeUpdated: 1,
    ageMs: 0,
    ...over,
  }
}

function live(over: Partial<LiveSnapshot> = {}): LiveSnapshot {
  const db = over.db ?? emptyDb("/tmp/x")
  return {
    generatedAt: 0,
    fingerprint: "f",
    scanStamp: "s",
    omo: emptyOmo(),
    omoConfig: { present: false, path: null, teamMode: null, agents: [] },
    delegates: [],
    ...over,
    db: over.db ?? db,
  }
}

describe("delegatesForSession", () => {
  test("a new main does not inherit another run's boulder tasks", () => {
    const foreign = agent({ id: "ses_foreign", parentId: "ses_other_main" })
    const current = agent({ id: "ses_current" })
    const d: DelegateView = {
      taskKey: "task_1",
      title: "foreign work",
      sessionId: "ses_foreign",
      agent: "delegate",
      status: "running",
      updatedAt: 1,
      tokensTotal: 0,
      timeUpdated: 1,
      archived: false,
    }
    const snap = live({
      db: {
        ...emptyDb("/tmp/x"),
        current,
        main: current,
        byId: { ses_current: current, ses_foreign: foreign },
      },
      delegates: [d],
    })
    expect(delegatesForSession(snap, "ses_current")).toEqual([])
  })

  test("sqlite children of this session are listed", () => {
    const main = agent({ id: "ses_main" })
    const child = agent({ id: "ses_child", parentId: "ses_main", title: "worker" })
    const snap = live({
      db: {
        ...emptyDb("/tmp/x"),
        current: main,
        main,
        children: [child],
        byId: { ses_main: main, ses_child: child },
      },
    })
    const out = delegatesForSession(snap, "ses_main")
    expect(out.map((x) => x.sessionId)).toEqual(["ses_child"])
  })
})

describe("groupDelegates", () => {
  const row = (over: Partial<DelegateView> & { title: string }): DelegateView => ({
    taskKey: over.taskKey ?? over.sessionId ?? over.title,
    sessionId: over.sessionId ?? null,
    agent: over.agent ?? "oracle",
    status: over.status ?? "completed",
    updatedAt: 1,
    tokensTotal: 0,
    timeUpdated: 1,
    archived: false,
    ...over,
  })

  test("empty and a single agent stay a flat list", () => {
    expect(groupDelegates([])).toEqual([])
    const one = [row({ title: "F1", agent: "oracle" }), row({ title: "F2", agent: "oracle" })]
    const out = groupDelegates(one)
    expect(out.every((x) => x.kind === "row" && !x.grouped)).toBe(true)
    expect(out.map((x) => (x.kind === "row" ? x.delegate.title : ""))).toEqual(["F1", "F2"])
  })

  test("two or more agents get muted headers; order follows first appearance", () => {
    const out = groupDelegates([
      row({ title: "F1 final", agent: "oracle", sessionId: "a" }),
      row({ title: "Fix F1", agent: "Sisyphus-Junior", sessionId: "b" }),
      row({ title: "F4 scope", agent: "oracle", sessionId: "c" }),
      row({ title: "Fix F4", agent: "Sisyphus-Junior", sessionId: "d" }),
    ])
    const shape = out.map((x) =>
      x.kind === "header" ? `${x.agent} (${x.count})` : x.delegate.title,
    )
    expect(shape).toEqual([
      "oracle (2)",
      "F1 final",
      "F4 scope",
      "Sisyphus-Junior (2)",
      "Fix F1",
      "Fix F4",
    ])
    expect(out.filter((x) => x.kind === "row").every((x) => x.kind === "row" && x.grouped)).toBe(true)
    const headers = out.filter((x) => x.kind === "header")
    expect(headers[0]?.members).toHaveLength(2)
    expect(headers[1]?.members).toHaveLength(2)
  })

  test("missing agent collapses to agent and still groups against named ones", () => {
    const out = groupDelegates([
      row({ title: "named", agent: "oracle" }),
      row({ title: "blank", agent: null }),
      row({ title: "spaces", agent: "  " }),
    ])
    expect(
      out.filter((x) => x.kind === "header").map((x) => `${x.agent} (${x.count})`),
    ).toEqual(["oracle (1)", "agent (2)"])
  })
})

describe("reconcileDelegateStatus", () => {
  test("idle sqlite session clears leftover boulder running", () => {
    expect(reconcileDelegateStatus("running", { status: "idle" })).toBe("completed")
    expect(reconcileDelegateStatus("in_progress", { status: "idle" })).toBe("completed")
    expect(reconcileDelegateStatus("active", { status: "idle" })).toBe("completed")
  })
  test("keeps boulder error and done", () => {
    expect(reconcileDelegateStatus("error", { status: "idle" })).toBe("error")
    expect(reconcileDelegateStatus("completed", { status: "idle" })).toBe("completed")
    expect(reconcileDelegateStatus("failed", { status: "running" })).toBe("failed")
    expect(reconcileDelegateStatus("done", { status: "running" })).toBe("done")
  })
  test("archived session is completed; no session keeps boulder", () => {
    expect(reconcileDelegateStatus("running", { status: "archived" })).toBe("completed")
    expect(reconcileDelegateStatus("running", null)).toBe("running")
    expect(reconcileDelegateStatus("unknown", { status: "running" })).toBe("running")
  })
})
