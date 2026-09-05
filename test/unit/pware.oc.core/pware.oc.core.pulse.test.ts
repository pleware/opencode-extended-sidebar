import { describe, expect, test } from "bun:test"
import {
  activeFlow,
  applyFlow,
  composeMark,
  deltaKindFromEvent,
  deltaTextFromEvent,
  estimateTokens,
  flowFromEvent,
  formatAge,
  formatCompact,
  formatDuration,
  formatPercent,
  formatRate,
  formatSpan,
  formatTokenRate,
  formatTokens,
  formatUsd,
  formatWhen,
  hottestMark,
  packChips,
  packStackedRow,
  phaseAgeMs,
  preferToolLabel,
  pulseAgeMs,
  pushTokenTick,
  sessionBusyFromEvent,
  sessionIdFromEvent,
  shortToolLabel,
  stampMs,
  stripSessionPrefix,
  timeSummary,
  toEpochMs,
  tokenRate,
  tokenRateBars,
  tokenSummary,
  toolFlow,
  toolHitFromEvent,
  toolMark,
} from "../../../src/pware.oc.core/pware.oc.core.pulse.js"
import { strWidth } from "../../../src/pware.oc.core/pware.oc.core.width.js"

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

describe("formatCompact", () => {
  test("at most three characters: 100 → 100, 1000 → 1k, 0 → 0", () => {
    expect(formatCompact(null)).toBe("0")
    expect(formatCompact(0)).toBe("0")
    expect(formatCompact(100)).toBe("100")
    expect(formatCompact(1000)).toBe("1k")
    expect(formatCompact(9999)).toBe("10k")
  })
  test("small fractional values keep a single decimal", () => {
    expect(formatCompact(0.5)).toBe("0.5")
    expect(formatCompact(9.9)).toBe("9.9")
  })
  test("k / M / G / T scale ladder", () => {
    expect(formatCompact(1_500_000)).toBe("2M")
    expect(formatCompact(1e9)).toBe("1G")
    expect(formatCompact(1e12)).toBe("1T")
    expect(formatCompact(5e11)).toBe("1T")
  })
  test("negative or NaN clamp to 0", () => {
    expect(formatCompact(-5)).toBe("0")
    expect(formatCompact(Number.NaN)).toBe("0")
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
  test("wide chips are measured in columns, not code units", () => {
    // "中中" is 2 code units but 4 columns; a 3-column budget fits only ASCII.
    expect(packChips(0, [{ text: "中中", rank: 1 }], 3)).toEqual([])
    expect(packChips(0, [{ text: "ab", rank: 1 }], 3)).toHaveLength(1)
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
  test("name is clipped by columns, keeping head and tail", () => {
    const stacked = packStackedRow("这是一个很长的模型名称需要截断", [], 12)
    expect(strWidth(stacked.name)).toBeLessThanOrEqual(Math.max(4, 12 - 2))
    expect(stacked.name).toContain("…")
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
  test("skips an empty bag to find a later non-empty text", () => {
    expect(
      deltaTextFromEvent({
        type: "session.next.text.delta",
        part: { text: "" },
        properties: { text: "world" },
      }),
    ).toBe("world")
  })
  test("whitespace-only delta text is null", () => {
    expect(
      deltaTextFromEvent({ type: "session.next.text.delta", part: { text: "  " }, properties: { text: "" } }),
    ).toBeNull()
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

describe("tokenRateBars", () => {
  const WINDOW = 5_000

  test("returns eight columns with newest activity on the right", () => {
    const at = 10_000
    let ticks = pushTokenTick([], at - 500, 40, WINDOW)
    ticks = pushTokenTick(ticks, at, 80, WINDOW)
    const bar = tokenRateBars(ticks, at, WINDOW)
    expect(bar).toHaveLength(8)
    expect(bar.endsWith("█") || bar.endsWith("▇")).toBe(true)
    expect(bar.startsWith(" ")).toBe(true)
  })

  test("idle window is all spaces", () => {
    expect(tokenRateBars([], 1_000, WINDOW)).toBe("        ")
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

describe("pulseAgeMs", () => {
  test("null when every stamp is missing or invalid", () => {
    expect(pulseAgeMs(5_000)).toBeNull()
    expect(pulseAgeMs(5_000, null, undefined)).toBeNull()
    expect(pulseAgeMs(1_700_000_005_000, 0, -1)).toBeNull()
  })
  test("now minus the newest stamp", () => {
    expect(pulseAgeMs(1_700_000_005_000, 1_700_000_001_000)).toBe(4_000)
    expect(pulseAgeMs(1_700_000_005_000, 1_700_000_001_000, 1_700_000_003_000)).toBe(2_000)
  })
  test("accepts a seconds stamp and clamps a negative age to zero", () => {
    expect(pulseAgeMs(1_700_000_005_000, 1_700_000_001)).toBe(4_000)
    expect(pulseAgeMs(1_000, 1_700_000_005_000)).toBe(0)
  })
})

describe("activeFlow", () => {
  test("null for a quiet row, wait when busy with no entry", () => {
    expect(activeFlow(undefined, 1_000, false)).toBeNull()
    expect(activeFlow(undefined, 1_000, true)).toBe("wait")
  })
  test("recv expires after the recv window", () => {
    const entry = { dir: "recv", at: 1_000, since: 0 } as const
    expect(activeFlow(entry, 2_000, false)).toBe("recv")
    expect(activeFlow(entry, 5_000, false)).toBeNull()
    expect(activeFlow(entry, 5_000, true)).toBe("wait")
  })
  test("wait and tool hold while busy or inside their windows", () => {
    const wait = { dir: "wait", at: 1_000, since: 0 } as const
    expect(activeFlow(wait, 5_000, true)).toBe("wait")
    expect(activeFlow(wait, 5_000, false)).toBe("wait")
    expect(activeFlow(wait, 20_000, false)).toBeNull()

    const tool = { dir: "tool", at: 1_000, since: 0 } as const
    expect(activeFlow(tool, 5_000, true)).toBe("tool")
    expect(activeFlow(tool, 5_000, false)).toBe("tool")
    expect(activeFlow(tool, 40_000, false)).toBeNull()
  })
})

describe("applyFlow clear", () => {
  test("clear drops the entry, or is a no-op when absent", () => {
    expect(applyFlow({}, "s1", "clear", 1_000)).toEqual({})
    const prev = applyFlow({}, "s1", "recv", 1_000)
    expect(applyFlow(prev, "s1", "clear", 2_000)).toEqual({})
    expect(applyFlow(prev, "s2", "clear", 2_000)).toBe(prev)
  })
})

describe("phaseAgeMs", () => {
  test("null unless the entry matches the active direction", () => {
    const entry = { dir: "recv", at: 1_000, since: 500 } as const
    expect(phaseAgeMs(undefined, 1_500, "recv")).toBeNull()
    expect(phaseAgeMs(entry, 1_500, null)).toBeNull()
    expect(phaseAgeMs(entry, 1_500, "wait")).toBeNull()
    expect(phaseAgeMs(entry, 1_500, "recv")).toBe(1_000)
  })
  test("clamps a negative span to zero", () => {
    expect(phaseAgeMs({ dir: "recv", at: 1_000, since: 1_500 }, 1_000, "recv")).toBe(0)
  })
})

describe("flowFromEvent tool / part / status branches", () => {
  test("tool success, failure, and end all mean wait", () => {
    expect(flowFromEvent({ type: "tool.success", sessionID: "s1" }).dir).toBe("wait")
    expect(flowFromEvent({ type: "tool.failed", sessionID: "s1" }).dir).toBe("wait")
    expect(flowFromEvent({ type: "tool.ended", sessionID: "s1" }).dir).toBe("wait")
  })
  test("text.started and reasoning.started mean wait; an unknown type is quiet", () => {
    expect(flowFromEvent({ type: "text.started", sessionID: "s1" }).dir).toBe("wait")
    expect(flowFromEvent({ type: "reasoning.started", sessionID: "s1" }).dir).toBe("wait")
    expect(flowFromEvent({ type: "message.updated", sessionID: "s1" }).dir).toBeNull()
  })
  test("message.part.updated splits tool parts from text parts", () => {
    expect(
      flowFromEvent({ type: "message.part.updated", properties: { part: { type: "tool" } } }).dir,
    ).toBe("tool")
    expect(
      flowFromEvent({ type: "message.part.updated", properties: { part: { type: "text" } } }).dir,
    ).toBe("recv")
  })
  test("session.status busy clears or waits by flag", () => {
    expect(
      flowFromEvent({ type: "session.status", properties: { status: { type: "busy" } } }).dir,
    ).toBe("wait")
    expect(
      flowFromEvent({ type: "session.status", properties: { status: "idle" } }).dir,
    ).toBe("clear")
  })
})

describe("sessionBusyFromEvent", () => {
  test("null for non-object events", () => {
    expect(sessionBusyFromEvent(null)).toEqual({ id: null, busy: null })
    expect(sessionBusyFromEvent("x")).toEqual({ id: null, busy: null })
  })
  test("idle by type", () => {
    expect(sessionBusyFromEvent({ type: "session.idle", sessionID: "s1" })).toEqual({
      id: "s1",
      busy: false,
    })
    expect(sessionBusyFromEvent({ type: "foo.session.idle" }).busy).toBe(false)
  })
  test("status object resolves busy / retry / idle", () => {
    expect(sessionBusyFromEvent({ type: "session.status", properties: { status: { type: "busy" } } }).busy).toBe(true)
    expect(sessionBusyFromEvent({ type: "session.status", properties: { status: { type: "retry" } } }).busy).toBe(true)
    expect(sessionBusyFromEvent({ type: "session.status", properties: { status: { type: "idle" } } }).busy).toBe(false)
  })
  test("raw status strings map busy/running/idle", () => {
    expect(sessionBusyFromEvent({ type: "session.status", properties: { status: "busy" } }).busy).toBe(true)
    expect(sessionBusyFromEvent({ type: "session.status", properties: { status: "running" } }).busy).toBe(true)
    expect(sessionBusyFromEvent({ type: "session.status", properties: { status: "idle" } }).busy).toBe(false)
    expect(sessionBusyFromEvent({ type: "session.status", status: "busy" }).busy).toBe(true)
  })
  test("unknown status stays null", () => {
    expect(sessionBusyFromEvent({ type: "session.status", properties: { status: "whatever" } }).busy).toBeNull()
  })
})

describe("formatAge", () => {
  test("empty for missing/negative, buckets for the rest", () => {
    expect(formatAge(null)).toBe("")
    expect(formatAge(-1)).toBe("")
    expect(formatAge(Number.NaN)).toBe("")
    expect(formatAge(0)).toBe("0s")
    expect(formatAge(5_000)).toBe("5s")
  })
  test("rolls over into days past 48 hours", () => {
    expect(formatAge(4 * 24 * 3600 * 1000)).toBe("4d")
  })
})

describe("formatRate", () => {
  test("empty for zero/missing, one decimal below 100, integer above", () => {
    expect(formatRate(null)).toBe("")
    expect(formatRate(0)).toBe("")
    expect(formatRate(-3)).toBe("")
    expect(formatRate(12.34)).toBe("12.3/s")
    expect(formatRate(100)).toBe("100/s")
    expect(formatRate(150.6)).toBe("151/s")
  })
})

describe("formatPercent", () => {
  test("empty for missing/negative, under 1% is <1%", () => {
    expect(formatPercent(null)).toBe("")
    expect(formatPercent(-0.1)).toBe("")
    expect(formatPercent(Number.NaN)).toBe("")
    expect(formatPercent(0)).toBe("0%")
    expect(formatPercent(0.005)).toBe("<1%")
    expect(formatPercent(0.5)).toBe("50%")
    expect(formatPercent(1)).toBe("100%")
  })
})

describe("formatUsd", () => {
  test("empty for zero/missing, tiers by magnitude", () => {
    expect(formatUsd(null)).toBe("")
    expect(formatUsd(0)).toBe("")
    expect(formatUsd(-5)).toBe("")
    expect(formatUsd(0.005)).toBe("$0.005")
    expect(formatUsd(0.01)).toBe("$0.01")
    expect(formatUsd(9.99)).toBe("$9.99")
    expect(formatUsd(10)).toBe("$10")
    expect(formatUsd(123.456)).toBe("$123")
  })
})

describe("toolMark / toolFlow", () => {
  test("maps lifecycle to a row mark", () => {
    expect(toolMark("running")).toBe("live")
    expect(toolMark("in_progress")).toBe("live")
    expect(toolMark("error")).toBe("error")
    expect(toolMark("completed")).toBe("ready")
    expect(toolMark("pending")).toBe("queued")
    expect(toolMark("junk")).toBe("queued")
  })
  test("tool in flight only while running", () => {
    expect(toolFlow("running")).toBe("tool")
    expect(toolFlow("completed")).toBeNull()
    expect(toolFlow("")).toBeNull()
  })
})

describe("toolHitFromEvent", () => {
  test("running bash call labelled by its command", () => {
    const hit = toolHitFromEvent({
      type: "session.next.tool.called",
      sessionID: "ses_abc",
      properties: {
        part: { id: "prt_1", tool: "bash", state: { status: "running", input: { command: "ls src" } } },
      },
    })
    expect(hit).toEqual({ sessionId: "ses_abc", id: "prt_1", name: "ls src", status: "running" })
  })
  test("success read labelled by its file, failure edit by call_ id", () => {
    expect(
      toolHitFromEvent({
        type: "session.next.tool.success",
        sessionID: "s1",
        properties: {
          part: { id: "prt_2", tool: "read", state: { status: "completed", input: { filePath: "src/db.ts" } } },
        },
      }),
    ).toEqual({ sessionId: "s1", id: "prt_2", name: "read db.ts", status: "completed" })

    expect(
      toolHitFromEvent({
        type: "session.next.tool.failed",
        properties: { part: { id: "call_9", tool: "edit", state: { status: "failed", input: { filePath: "a/b.ts" } } } },
      }),
    ).toEqual({ sessionId: null, id: "call_9", name: "edit b.ts", status: "error" })
  })
  test("status can come from the bag state, not only the type", () => {
    const hit = toolHitFromEvent({
      type: "session.status",
      sessionID: "s1",
      properties: { part: { id: "prt_3", tool: "bash", state: { status: "running", input: { command: "git status" } } } },
    })
    expect(hit?.status).toBe("running")
    expect(hit?.name).toBe("git status")
  })
  test("task label prefers description and exposes subagent/category", () => {
    expect(
      toolHitFromEvent({
        type: "session.next.tool.called",
        properties: {
          part: {
            id: "prt_4",
            tool: "task",
            state: { title: "Plan things", input: { description: "Refactor the module", subagent_type: "explore" } },
          },
        },
      })?.name,
    ).toBe("Refactor the module")

    expect(
      toolHitFromEvent({
        type: "session.next.tool.called",
        properties: { part: { id: "prt_5", tool: "task", state: { input: { category: "build" } } } },
      })?.name,
    ).toBe("build")
  })
  test("pattern labels a grep hit; top-level input is also read", () => {
    expect(
      toolHitFromEvent({
        type: "session.next.tool.called",
        properties: { part: { id: "prt_6", tool: "grep", state: { input: { pattern: "pick(" } } } },
      })?.name,
    ).toBe("grep pick(")

    expect(
      toolHitFromEvent({
        type: "session.next.tool.called",
        properties: { part: { id: "prt_7", tool: "bash", input: { command: "ls" } } },
      })?.name,
    ).toBe("ls")
  })
  test("null when status, id, or name is missing", () => {
    expect(toolHitFromEvent({ type: "message.part.updated", properties: { part: { type: "tool" } } })).toBeNull()
    expect(toolHitFromEvent({ type: "message.updated", sessionID: "s1" })).toBeNull()
    expect(
      toolHitFromEvent({ type: "session.next.tool.called", properties: { part: { tool: "bash" } } }),
    ).toBeNull()
    expect(
      toolHitFromEvent({ type: "session.next.tool.called", properties: { part: { id: "prt_8" } } }),
    ).toBeNull()
  })
})

describe("sessionIdFromEvent", () => {
  test("finds an id nested under info/properties/session/payload", () => {
    expect(sessionIdFromEvent({ properties: { sessionID: "ses_nested" } })).toBe("ses_nested")
    expect(sessionIdFromEvent({ session: { session_id: "s2" } })).toBe("s2")
    expect(sessionIdFromEvent({ payload: { sessionId: "s3" } })).toBe("s3")
  })
  test("stops after three levels of nesting", () => {
    expect(
      sessionIdFromEvent({ info: { info: { info: { info: { sessionID: "too-deep" } } } } }),
    ).toBeNull()
  })
})
