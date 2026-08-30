import { describe, expect, test } from "bun:test"
import { aggregate, type MsgRow, type PartRow } from "../../src/perf.js"

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
})
