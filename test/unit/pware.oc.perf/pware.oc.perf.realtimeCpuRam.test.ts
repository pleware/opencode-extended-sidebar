import { describe, expect, test } from "bun:test"
import {
  cpuPercent,
  ramMb,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtimeCpuRam.js"
import { StatRealtimeResolver } from "../../../src/pware.oc.perf/pware.oc.perf.realtimeResolver.js"

describe("cpuPercent", () => {
  test("one full core busy for the whole interval is 100% on one core", () => {
    const prev = { user: 0, system: 0, rss: 0 }
    const next = { user: 1_000_000, system: 0, rss: 0 }
    expect(cpuPercent(prev, next, 1_000, 1)).toBe(100)
  })

  test("splits across cores", () => {
    const prev = { user: 0, system: 0, rss: 0 }
    const next = { user: 1_000_000, system: 1_000_000, rss: 0 }
    expect(cpuPercent(prev, next, 1_000, 4)).toBe(50)
  })

  test("null when unmeasurable", () => {
    expect(cpuPercent({ user: 0, system: 0, rss: 0 }, { user: 1, system: 0, rss: 0 }, 0, 1)).toBeNull()
    expect(cpuPercent({ user: 0, system: 0, rss: 0 }, { user: 1, system: 0, rss: 0 }, 1_000, 0)).toBeNull()
  })
})

describe("ramMb", () => {
  test("converts resident bytes to MB", () => {
    expect(ramMb(1024 * 1024)).toBe(1)
    expect(ramMb(0)).toBe(0)
  })
})

describe("StatRealtimeResolver cpu/ram", () => {
  test("ingestCpuRam feeds a separate interpolated history", () => {
    const r = StatRealtimeResolver.build(null)
    r.ingestCpuRam(10, 500, 1_000)
    r.ingestCpuRam(30, 700, 3_000)
    const graph = r.getForGraphCpuRam()
    expect(graph.map((s) => s.at)).toEqual([1_000, 2_000, 3_000])
    expect(graph.map((s) => s.cpuRam.cpu)).toEqual([10, 20, 30])
    expect(graph.map((s) => s.cpuRam.ram)).toEqual([500, 600, 700])
  })
})
