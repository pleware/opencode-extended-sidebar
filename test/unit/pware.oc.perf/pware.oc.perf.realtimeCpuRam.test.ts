import { describe, expect, test } from "bun:test"
import {
  cpuPercent,
  cpuPercentOverWindow,
  ramMb,
} from "../../../src/pware.oc.perf/pware.oc.perf.realtimeCpuRam.js"
import { StatRealtimeTimeline } from "../../../src/pware.oc.perf/pware.oc.perf.realtimeTimeline.js"

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

describe("cpuPercentOverWindow", () => {
  const full = (at: number, user: number): { at: number; user: number; system: number; rss: number } => ({
    at,
    user,
    system: 0,
    rss: 0,
  })

  test("uses the newest reading and the oldest one still inside the window", () => {
    const readings = [
      full(0, 0),
      full(250, 250_000),
      full(500, 500_000),
      full(750, 750_000),
      full(1_000, 1_000_000),
    ]
    expect(cpuPercentOverWindow(readings, 1, 500)).toBe(100)
  })

  test("a window smaller than the reading span only counts the recent slice", () => {
    const readings = [
      full(0, 0),
      full(1_000, 1_000_000),
      full(1_200, 1_200_000),
      full(1_400, 1_400_000),
    ]
    expect(cpuPercentOverWindow(readings, 1, 500)).toBe(100)
  })

  test("null with fewer than two readings or a zero window", () => {
    expect(cpuPercentOverWindow([full(0, 0)], 1, 500)).toBeNull()
    expect(cpuPercentOverWindow([full(0, 0), full(100, 1)], 1, 0)).toBeNull()
    expect(cpuPercentOverWindow([full(0, 0), full(100, 1)], 0, 500)).toBeNull()
  })
})

describe("ramMb", () => {
  test("converts resident bytes to MB", () => {
    expect(ramMb(1024 * 1024)).toBe(1)
    expect(ramMb(0)).toBe(0)
  })
})
