import { describe, expect, test } from "bun:test"
import {
  STAT_REALTIME_BLOCK,
  seriesValues,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtimeBlock.js"
import { emptyStatRealtimeSnapshot } from "../../../src/pware.oc.perf/pware.oc.perf.realtime.js"

describe("seriesValues", () => {
  test("maps a selector row's read across history, null → 0", () => {
    const a = emptyStatRealtimeSnapshot(1)
    const b = emptyStatRealtimeSnapshot(2)
    a.tokens.out = 7
    b.tokens.out = null
    const read = STAT_REALTIME_BLOCK.tabs.find((t) => t.id === "tokens")!.rows.find((r) => r.key === "out")!.read
    expect(seriesValues([a, b], read)).toEqual([7, 0])
  })
})

describe("STAT_REALTIME_BLOCK", () => {
  test("has the four category tabs in order", () => {
    expect(STAT_REALTIME_BLOCK.tabs.map((t) => t.id)).toEqual(["tokens", "cache", "cpu-ram", "network"])
  })
  test("tokens tab has sum / in / out rows", () => {
    const tokens = STAT_REALTIME_BLOCK.tabs.find((t) => t.id === "tokens")!
    expect(tokens.unit).toBe("tok/s")
    expect(tokens.rows.map((r) => r.key)).toEqual(["sum", "in", "out"])
  })
  test("cache tab has sum / read / write rows", () => {
    const cache = STAT_REALTIME_BLOCK.tabs.find((t) => t.id === "cache")!
    expect(cache.rows.map((r) => r.key)).toEqual(["sum", "read", "write"])
  })
  test("cpu-ram tab has cpu / ram rows", () => {
    const cpuRam = STAT_REALTIME_BLOCK.tabs.find((t) => t.id === "cpu-ram")!
    expect(cpuRam.rows.map((r) => r.key)).toEqual(["cpu", "ram"])
  })
  test("tokens sum is in + out", () => {
    const sum = STAT_REALTIME_BLOCK.tabs.find((t) => t.id === "tokens")!.rows.find((r) => r.key === "sum")!.read
    const s = emptyStatRealtimeSnapshot(1)
    s.tokens.in = 3
    s.tokens.out = 4
    expect(sum(s)).toBe(7)
  })
})
