import { describe, expect, test } from "bun:test"
import { inferStatus, mergeTools, toSessionView, type SessionRow } from "../../src/db.js"

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
