import { describe, expect, test } from "bun:test"
import {
  StatRealtimeTimeline,
  type StatRealtimeEventTokens,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtimeTimeline.js"
import { emptyStatRealtimeSnapshot } from "../../../src/pware.oc.perf/pware.oc.perf.realtime.js"

function tok(over: Partial<StatRealtimeEventTokens> = {}): StatRealtimeEventTokens {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, ...over }
}

describe("StatRealtimeTimeline tokens/cache", () => {
  test("first exact ingest is a baseline; no rate until a second report", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    t.tick(1_300)
    expect(t.getTimeline()).toHaveLength(1)
    expect(t.getTimeline()[0]!.tokens.out).toBeNull()
  })

  test("second exact ingest emits a windowed delta rate", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    t.ingest("s1", tok({ output: 30 }), 2_000)
    t.tick(2_300)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.tokens.out).toBe(20)
  })

  test("exact totals from different sessions merge into the aggregate", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    t.ingest("s2", tok({ output: 5 }), 1_000)
    t.ingest("s1", tok({ output: 30 }), 2_000)
    t.ingest("s2", tok({ output: 15 }), 2_000)
    t.tick(2_300)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.tokens.out).toBe(30)
  })

  test("scope filters ingest to one session", () => {
    const t = StatRealtimeTimeline.build("s1")
    t.ingest("s2", tok({ output: 5 }), 1_000)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    t.ingest("s1", tok({ output: 30 }), 2_000)
    t.tick(2_300)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.tokens.out).toBe(20)
  })

  test("estimated stream delta keeps the rate live between exact reports", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    // 6 estimated chunks of ~5 tokens each — the curve moves without exact events
    for (let i = 1; i <= 6; i += 1) t.ingestEstimate("s1", "out", 5, 1_000 + i * 50)
    t.tick(1_400)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.tokens.out).toBeGreaterThan(0)
  })

  test("exact report only adds what the estimate did not already cover", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    t.ingestEstimate("s1", "out", 20, 1_100) // estimate covers the next 20 tokens
    t.ingest("s1", tok({ output: 30 }), 2_000) // exact delta is 20 — fully covered
    t.ingest("s1", tok({ output: 45 }), 3_000) // exact delta 15 — only 15 added
    t.tick(3_300)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.tokens.out).toBe(15)
  })

  test("cache read/write and input follow exact cumulative bursts", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ input: 0, cacheRead: 0 }), 1_000)
    t.ingest("s1", tok({ input: 1_000, cacheRead: 500 }), 2_000)
    t.tick(2_300)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.tokens.in).toBe(1_000)
    expect(last.cache.read).toBe(500)
  })

  test("rate decays to null once the rate window has no steps", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    t.ingest("s1", tok({ output: 40 }), 2_000)
    t.tick(2_300)
    expect(t.getTimeline()[t.getTimeline().length - 1]!.tokens.out).toBe(30)
    t.tick(4_000) // 2s after the last step — past the 1s rate window
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.tokens.out).toBeNull()
  })

  test("reset clears state and history", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok({ output: 10 }), 1_000)
    t.ingest("s1", tok({ output: 30 }), 2_000)
    t.tick(2_300)
    expect(t.getTimeline().length).toBeGreaterThan(0)
    t.reset()
    expect(t.getTimeline()).toEqual([])
  })

  test("network is derived from the token flow as kbit/s", () => {
    const t = StatRealtimeTimeline.build(null)
    t.ingest("s1", tok(), 1_000)
    t.ingest("s1", tok({ input: 500, cacheRead: 200, cacheWrite: 100, output: 30, reasoning: 40 }), 2_000)
    t.tick(2_300)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    // out = input + cache (500+200+100) tok/s → ×4 B ×8 /1000 = 25.6 kbit/s
    expect(last.network.out).toBeCloseTo(25.6)
    // in = output + reasoning (30+40) tok/s → ×4 B ×8 /1000 = 2.24 kbit/s
    expect(last.network.in).toBeCloseTo(2.24)
  })
})

describe("StatRealtimeTimeline cpu/ram", () => {
  test("cpu and ram come from the raw reading ring on the same grid", () => {
    const t = StatRealtimeTimeline.build(null, 1)
    t.ingestCpuRam({ user: 0, system: 0, rss: 1048576 }, 1_700)
    t.ingestCpuRam({ user: 150_000, system: 0, rss: 2097152 }, 2_000)
    t.tick(2_100)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.cpuRam.cpu).toBe(50)
    expect(last.cpuRam.ram).toBe(2)
  })

  test("fewer than two readings inside the window leaves cpu null", () => {
    const t = StatRealtimeTimeline.build(null, 1)
    t.ingestCpuRam({ user: 0, system: 0, rss: 1048576 }, 1_000)
    t.tick(1_300)
    const last = t.getTimeline()[t.getTimeline().length - 1]!
    expect(last.cpuRam.cpu).toBeNull()
    expect(last.cpuRam.ram).toBe(1)
  })

  test("empty snapshot remains the shape of an idle sample", () => {
    const s = emptyStatRealtimeSnapshot(1)
    expect(s.tokens.out).toBeNull()
    expect(s.cpuRam.cpu).toBeNull()
  })
})
