import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  aggregate,
  collectPerfLogRows,
  formatColumns,
  formatPerfLog,
  perfLogFileName,
  toolLogCall,
  writePerfLog,
  type MsgRow,
  type PartRow,
} from "../../../src/pware.oc.perf/pware.oc.perf.reader.js"

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
