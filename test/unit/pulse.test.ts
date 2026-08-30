import { describe, expect, test } from "bun:test"
import {
  applyFlow,
  composeMark,
  flowFromEvent,
  formatDuration,
  formatSpan,
  formatTokens,
  hottestMark,
  packChips,
  preferToolLabel,
  shortToolLabel,
  sparkline,
} from "../../src/pulse.js"

describe("formatTokens", () => {
  test("empty and small", () => {
    expect(formatTokens(null)).toBe("—")
    expect(formatTokens(12)).toBe("12")
  })
  test("k and M", () => {
    expect(formatTokens(1_500)).toBe("1.5k")
    expect(formatTokens(12_000)).toBe("12k")
    expect(formatTokens(1_500_000)).toBe("1.5M")
  })
})

describe("formatDuration / formatSpan", () => {
  test("duration buckets", () => {
    expect(formatDuration(0)).toBe("")
    expect(formatDuration(12)).toBe("12ms")
    expect(formatDuration(1_500)).toBe("1.5s")
    expect(formatDuration(12_000)).toBe("12s")
  })
  test("span buckets", () => {
    expect(formatSpan(500)).toBe("0s")
    expect(formatSpan(5_000)).toBe("5s")
    expect(formatSpan(120_000)).toBe("2m")
  })
})

describe("packChips", () => {
  test("drops highest rank first when the line is tight", () => {
    const chips = [
      { text: "aaaa", rank: 1 },
      { text: "bbbb", rank: 3 },
      { text: "cccc", rank: 2 },
    ]
    const kept = packChips(4, chips, 14)
    expect(kept.map((c) => c.text)).not.toContain("bbbb")
    expect(kept.length).toBeGreaterThan(0)
  })
})

describe("sparkline", () => {
  test("gaps are ticks; empty window is empty", () => {
    expect(sparkline([], 4)).toBe("")
    const s = sparkline([1, null, 8], 3)
    expect(s).toHaveLength(3)
    expect(s[1]).toBe("·")
  })
})

describe("composeMark", () => {
  test("lifecycle wins", () => {
    expect(composeMark({ archived: true, ageMs: 0 })).toBe("archived")
    expect(composeMark({ lifecycle: "error", ageMs: 0 })).toBe("error")
    expect(composeMark({ lifecycle: "completed", ageMs: 0 })).toBe("ready")
    expect(composeMark({ ageMs: null })).toBe("queued")
  })
  test("pulse from age", () => {
    expect(composeMark({ ageMs: 1_000 })).toBe("live")
    expect(composeMark({ ageMs: 25_000 })).toBe("stale")
    expect(composeMark({ ageMs: 50_000 })).toBe("idle")
  })
  test("running ages out instead of sticking as stale", () => {
    expect(composeMark({ lifecycle: "running", ageMs: 1_000 })).toBe("live")
    expect(composeMark({ lifecycle: "in_progress", ageMs: 25_000 })).toBe("stale")
    expect(composeMark({ lifecycle: "running", ageMs: 50_000 })).toBe("idle")
    expect(composeMark({ lifecycle: "active", ageMs: null })).toBe("stale")
  })
})

describe("hottestMark", () => {
  test("live beats stale and error; empty is idle bullet", () => {
    expect(hottestMark([])).toBe("ready")
    expect(hottestMark(["ready", "error"])).toBe("error")
    expect(hottestMark(["error", "stale"])).toBe("stale")
    expect(hottestMark(["error", "stale", "live"])).toBe("live")
  })
})

describe("flowFromEvent / applyFlow", () => {
  test("classifies wait recv tool clear", () => {
    expect(flowFromEvent({ type: "session.idle", sessionID: "s1" }).dir).toBe("clear")
    expect(flowFromEvent({ type: "tool.called", sessionID: "s1" }).dir).toBe("tool")
    expect(flowFromEvent({ type: "text.delta", sessionID: "s1" }).dir).toBe("recv")
    expect(flowFromEvent({ type: "step.started", sessionID: "s1" }).dir).toBe("wait")
  })
  test("wait does not clobber recv or tool", () => {
    const now = 1_000
    const recv = applyFlow({}, "s1", "recv", now)
    expect(applyFlow(recv, "s1", "wait", now + 100).s1?.dir).toBe("recv")
    const tool = applyFlow({}, "s1", "tool", now)
    expect(applyFlow(tool, "s1", "wait", now + 100).s1?.dir).toBe("tool")
  })
})

describe("shortToolLabel / preferToolLabel", () => {
  test("prefers file, pattern, then command", () => {
    expect(shortToolLabel({ tool: "read", filePath: "src/db.ts" })).toBe("read db.ts")
    expect(shortToolLabel({ tool: "grep", pattern: "pick(" })).toContain("pick(")
    expect(shortToolLabel({ tool: "bash", command: "ls src" })).toBe("ls src")
  })
  test("keeps a specific label over a later bare name", () => {
    expect(preferToolLabel("bash", "ls src")).toBe("ls src")
    expect(preferToolLabel("git status", "bash")).toBe("git status")
  })
})
