import { describe, expect, test } from "bun:test"
import {
  StatRealtimeResolver,
  interpolateRealtimeHistory,
  mergeRealtimeHistories,
  type StatRealtimeEventTokens,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtimeResolver.js"
import { emptyStatRealtimeSnapshot } from "../../../src/pware.oc.perf/pware.oc.perf.realtime.js"

function tok(over: Partial<StatRealtimeEventTokens> = {}): StatRealtimeEventTokens {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, ...over }
}

describe("StatRealtimeResolver", () => {
  test("first ingest records no sample (no previous baseline)", () => {
    const r = StatRealtimeResolver.build(null)
    r.ingest("s1", tok({ output: 10 }), 1_000)
    expect(r.getForGraph(null)).toEqual([])
  })

  test("second ingest emits a delta rate", () => {
    const r = StatRealtimeResolver.build(null)
    r.ingest("s1", tok({ output: 10 }), 1_000)
    r.ingest("s1", tok({ output: 30 }), 2_000)
    const graph = r.getForGraph(null)
    expect(graph).toHaveLength(1)
    expect(graph[0]!.at).toBe(2_000)
    expect(graph[0]!.tokens.out).toBe(20)
  })

  test("getForGraph(null) merges sessions by timestamp", () => {
    const r = StatRealtimeResolver.build(null)
    r.ingest("s1", tok({ output: 10 }), 1_000)
    r.ingest("s2", tok({ output: 5 }), 1_000)
    r.ingest("s1", tok({ output: 30 }), 2_000)
    r.ingest("s2", tok({ output: 15 }), 2_000)
    const graph = r.getForGraph(null)
    expect(graph).toHaveLength(1)
    expect(graph[0]!.tokens.out).toBe(30)
  })

  test("scope filters ingest to one session", () => {
    const r = StatRealtimeResolver.build("s1")
    r.ingest("s2", tok({ output: 5 }), 1_000)
    r.ingest("s1", tok({ output: 10 }), 1_000)
    r.ingest("s1", tok({ output: 30 }), 2_000)
    expect(r.getForGraph(null)).toHaveLength(1)
    expect(r.getForGraph("s1")).toHaveLength(1)
    expect(r.getForGraph("s2")).toEqual([])
  })
})

describe("mergeRealtimeHistories", () => {
  test("sums per-timestamp across histories, sorted by time", () => {
    const a = emptyStatRealtimeSnapshot(1)
    a.tokens.out = 3
    const b = emptyStatRealtimeSnapshot(1)
    b.tokens.out = 4
    const c = emptyStatRealtimeSnapshot(2)
    c.tokens.in = 7
    const merged = mergeRealtimeHistories([[a], [b, c]])
    expect(merged.map((s) => s.at)).toEqual([1, 2])
    expect(merged[0]!.tokens.out).toBe(7)
    expect(merged[1]!.tokens.in).toBe(7)
  })
})

describe("interpolateRealtimeHistory", () => {
  test("resamples to a regular grid with linear interpolation", () => {
    const a = emptyStatRealtimeSnapshot(1_000)
    a.tokens.out = 10
    const b = emptyStatRealtimeSnapshot(3_000)
    b.tokens.out = 30
    const out = interpolateRealtimeHistory([a, b], 1_000)
    expect(out.map((s) => s.at)).toEqual([1_000, 2_000, 3_000])
    expect(out.map((s) => s.tokens.out)).toEqual([10, 20, 30])
  })

  test("fewer than two samples or a non-positive step returns as-is", () => {
    const a = emptyStatRealtimeSnapshot(1_000)
    a.tokens.out = 10
    expect(interpolateRealtimeHistory([a], 1_000)).toHaveLength(1)
    expect(interpolateRealtimeHistory([a], 0)).toHaveLength(1)
  })
})
