import { describe, expect, test } from "bun:test"
import {
  emptyStatRealtimeSnapshot,
  pushStatRealtimeHistory,
  sumSeries,
  tokenRateToKbit,
  NETWORK_BYTES_PER_TOKEN,
  type StatRealtimeSnapshot,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtime.js"
import { REALTIME_WINDOW_MS } from "../../../src/pware.oc.core/pware.oc.core.timing.js"

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

describe("tokenRateToKbit", () => {
  test("converts tok/s to kbit/s at the bytes-per-token constant", () => {
    expect(NETWORK_BYTES_PER_TOKEN).toBe(4)
    // 1000 tok/s × 4 B × 8 bits / 1000 = 32 kbit/s
    expect(tokenRateToKbit(1_000)).toBe(32)
    expect(tokenRateToKbit(125)).toBe(4)
  })
  test("null stays null", () => {
    expect(tokenRateToKbit(null)).toBeNull()
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
  test("default window is the 3-minute realtime window", () => {
    const h = pushStatRealtimeHistory([], snap(0))
    expect(REALTIME_WINDOW_MS).toBe(3 * 60 * 1000)
    expect(h.length).toBe(1)
  })
})
