import { describe, expect, test } from "bun:test"
import {
  STAT_REALTIME_HISTORY_WINDOW_MS,
  emptyStatRealtimeSnapshot,
  pushStatRealtimeHistory,
  sumSeries,
  type StatRealtimeSnapshot,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtime.js"

function snap(at: number, out: number | null = 5): StatRealtimeSnapshot {
  const s = emptyStatRealtimeSnapshot(at)
  return { ...s, tokens: { ...s.tokens, out } }
}

describe("sumSeries", () => {
  test("null only when both are null", () => {
    expect(sumSeries(null, null)).toBeNull()
  })
  test("treats a null operand as zero", () => {
    expect(sumSeries(3, null)).toBe(3)
    expect(sumSeries(null, 4)).toBe(4)
    expect(sumSeries(3, 4)).toBe(7)
  })
})

describe("emptyStatRealtimeSnapshot", () => {
  test("all series null, timestamp set", () => {
    const s = emptyStatRealtimeSnapshot(123)
    expect(s.at).toBe(123)
    expect(s.tokens).toEqual({ in: null, out: null, reasoning: null })
    expect(s.cache).toEqual({ read: null, write: null })
    expect(s.cpuRam).toEqual({ cpu: null, ram: null })
    expect(s.network).toEqual({ in: null, out: null })
  })
})

describe("pushStatRealtimeHistory", () => {
  test("appends and prunes to the window", () => {
    const a = snap(1_000)
    const b = snap(6_000)
    const c = snap(7_000)
    let h = pushStatRealtimeHistory([], a, 5_000)
    h = pushStatRealtimeHistory(h, b, 5_000)
    h = pushStatRealtimeHistory(h, c, 5_000)
    expect(h.map((s) => s.at)).toEqual([6_000, 7_000])
  })
  test("default window is the 15-minute constant", () => {
    const h = pushStatRealtimeHistory([], snap(0))
    expect(STAT_REALTIME_HISTORY_WINDOW_MS).toBe(15 * 60 * 1000)
    expect(h.length).toBe(1)
  })
})
