import { describe, expect, test } from "bun:test"
import {
  applyFlow,
  composeMark,
  deltaKindFromEvent,
  deltaTextFromEvent,
  estimateTokens,
  flowFromEvent,
  formatDuration,
  formatSpan,
  formatTokenRate,
  formatTokens,
  formatWhen,
  timeSummary,
  tokenSummary,
  stampMs,
  toEpochMs,
  hottestMark,
  packChips,
  packStackedRow,
  preferToolLabel,
  pushTokenTick,
  shortToolLabel,
  stripSessionPrefix,
  tokenRate,
} from "../../../src/pware.oc.core/pware.oc.core.pulse.js"

describe("toEpochMs / stampMs", () => {
  test("seconds, ms, ISO, and junk", () => {
    expect(toEpochMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(toEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(toEpochMs("2024-01-15T12:00:00.000Z")).toBe(Date.parse("2024-01-15T12:00:00.000Z"))
    expect(toEpochMs(0)).toBeNull()
    expect(toEpochMs(-1)).toBeNull()
    expect(toEpochMs("not-a-date")).toBeNull()
    expect(toEpochMs(null)).toBeNull()
    expect(stampMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(stampMs(null)).toBeNull()
  })
})

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

describe("tokenSummary", () => {
  test("in and out always; reasoning only when present", () => {
    expect(tokenSummary({ tokensIn: 122_000, tokensOut: 22_000 })).toBe("↑122k ↓22k")
    expect(tokenSummary({ tokensIn: 122_000, tokensOut: 22_000, tokensReasoning: 37_000 })).toBe(
      "↑122k ↓22k ∴37k",
    )
    expect(tokenSummary({ tokensIn: 12, tokensOut: 3, tokensReasoning: 0 })).toBe("↑12 ↓3")
  })
})

describe("timeSummary", () => {
  test("turns and duration; err/abort only when non-zero", () => {
    expect(timeSummary({ turns: 38, durationMs: 22 * 60_000 })).toBe("38 turns · 22m")
    expect(timeSummary({ turns: 2, durationMs: 5_000, errors: 1, aborts: 2 })).toBe(
      "2 turns · 5s · 1 err · 2 abort",
    )
    expect(timeSummary({ turns: 1, durationMs: 1_000, errors: 0, aborts: 0 })).toBe("1 turns · 1s")
  })
})

describe("formatWhen", () => {
  test("UTC stamp or dash", () => {
    expect(formatWhen(1_700_000_000_000)).toBe("2023-11-14 22:13:20")
    expect(formatWhen(null)).toBe("—")
    expect(formatWhen(Number.NaN)).toBe("—")
  })
})

describe("formatDuration / formatSpan", () => {
  test("duration buckets", () => {
    expect(formatDuration(0)).toBe("")
    expect(formatDuration(12)).toBe("12ms")
    expect(formatDuration(1_500)).toBe("1.5s")
    expect(formatDuration(12_000)).toBe("12s")
    expect(formatDuration(10_000_000)).toBe("2h")
  })
  test("span buckets", () => {
    expect(formatSpan(500)).toBe("0s")
    expect(formatSpan(5_000)).toBe("5s")
    expect(formatSpan(120_000)).toBe("2m")
    expect(formatSpan(10_000_000)).toBe("2h46m")
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

describe("packStackedRow", () => {
  test("name keeps the full line; chips do not shrink it", () => {
    const chips = [
      { text: "38×", rank: 2 },
      { text: "↑3.2s", rank: 0 },
      { text: "∴14s", rank: 3 },
    ]
    const stacked = packStackedRow("deepseek-chat-pro", chips, 24)
    expect(stacked.name).toBe("deepseek-chat-pro")
    expect(stacked.chips.map((c) => c.text)).toEqual(["38×", "↑3.2s", "∴14s"])
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
    expect(composeMark({ ageMs: 7_000 })).toBe("stale")
    expect(composeMark({ ageMs: 50_000 })).toBe("idle")
  })
  test("running ages out instead of sticking as stale", () => {
    expect(composeMark({ lifecycle: "running", ageMs: 1_000 })).toBe("live")
    expect(composeMark({ lifecycle: "in_progress", ageMs: 7_000 })).toBe("stale")
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
  test("maxHint keeps more of a long command for logs", () => {
    const cmd = "bun test --timeout 5000 --reporter spec"
    const panel = shortToolLabel({ tool: "bash", command: cmd })
    const log = shortToolLabel({ tool: "bash", command: cmd, maxHint: 48 })
    expect(panel.length).toBeLessThan(log.length)
    expect(log).toContain("bun test")
    expect(log).toContain("--reporter spec")
  })
})

describe("deltaTextFromEvent", () => {
  test("reads the explicit delta field", () => {
    expect(
      deltaTextFromEvent({
        type: "message.part.updated",
        properties: { part: { type: "text" }, delta: "hello " },
      }),
    ).toBe("hello ")
  })
  test("reads a bare text only on a delta-type event", () => {
    expect(
      deltaTextFromEvent({ type: "session.next.text.delta", properties: { text: "world" } }),
    ).toBe("world")
  })
  test("ignores a full message/part body", () => {
    expect(deltaTextFromEvent({ type: "message.updated", properties: { info: { text: "big" } } })).toBeNull()
    expect(
      deltaTextFromEvent({ type: "message.part.updated", properties: { part: { type: "text", text: "big" } } }),
    ).toBeNull()
    expect(deltaTextFromEvent({ type: "tool.called", sessionID: "s1" })).toBeNull()
    expect(deltaTextFromEvent(null)).toBeNull()
  })
})

describe("deltaKindFromEvent", () => {
  test("reasoning deltas and reasoning parts classify as reasoning", () => {
    expect(
      deltaKindFromEvent({ type: "session.next.reasoning.delta", properties: { text: "x" } }),
    ).toBe("reasoning")
    expect(
      deltaKindFromEvent({
        type: "message.part.updated",
        properties: { part: { type: "reasoning" }, delta: "x" },
      }),
    ).toBe("reasoning")
  })
  test("text deltas and non-reasoning parts classify as out", () => {
    expect(deltaKindFromEvent({ type: "session.next.text.delta", properties: { text: "x" } })).toBe("out")
    expect(
      deltaKindFromEvent({
        type: "message.part.updated",
        properties: { part: { type: "text" }, delta: "x" },
      }),
    ).toBe("out")
  })
})

describe("estimateTokens", () => {
  test("code points / 4, min 1 for non-empty", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcdefgh")).toBe(2)
    expect(estimateTokens("ab")).toBe(1)
  })
})

describe("pushTokenTick / tokenRate", () => {
  const WINDOW = 5_000
  test("rate over the sliding window", () => {
    const t0 = 1_000
    let ticks = pushTokenTick([], t0, 40, WINDOW)
    ticks = pushTokenTick(ticks, t0 + 1_000, 60, WINDOW)
    expect(tokenRate(ticks, t0 + 1_000, WINDOW)).toBeCloseTo(100)
  })
  test("drops ticks older than the window", () => {
    const t0 = 1_000
    let ticks = pushTokenTick([], t0, 40, WINDOW)
    ticks = pushTokenTick(ticks, t0 + 1_000, 60, WINDOW)
    const pruned = pushTokenTick(ticks, t0 + 6_000, 10, WINDOW)
    expect(pruned.map((t) => t.at)).toEqual([t0 + 1_000, t0 + 6_000])
  })
  test("single tick has no span", () => {
    const ticks = pushTokenTick([], 1_000, 40, WINDOW)
    expect(tokenRate(ticks, 1_000, WINDOW)).toBeNull()
  })
})

describe("formatTokenRate", () => {
  test("integer-rounded, always present — 0 tok/s when idle", () => {
    expect(formatTokenRate(null)).toBe("0 tok/s")
    expect(formatTokenRate(0)).toBe("0 tok/s")
    expect(formatTokenRate(50)).toBe("50 tok/s")
    expect(formatTokenRate(50.4)).toBe("50 tok/s")
    expect(formatTokenRate(50.5)).toBe("51 tok/s")
    expect(formatTokenRate(120)).toBe("120 tok/s")
  })
})

describe("stripSessionPrefix", () => {
  test("strips the opencode: prefix, leaves bare ids untouched", () => {
    expect(stripSessionPrefix("opencode:ses_abc123")).toBe("ses_abc123")
    expect(stripSessionPrefix("ses_abc123")).toBe("ses_abc123")
    expect(stripSessionPrefix("  opencode:ses_abc123  ")).toBe("ses_abc123")
    expect(stripSessionPrefix("")).toBeNull()
    expect(stripSessionPrefix("   ")).toBeNull()
    expect(stripSessionPrefix(null)).toBeNull()
    expect(stripSessionPrefix(undefined)).toBeNull()
  })
})
