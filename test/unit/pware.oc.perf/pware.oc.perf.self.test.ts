import { beforeEach, afterEach, describe, expect, test } from "bun:test"
import {
  formatSelfLine,
  readRendererFps,
  readSelfStats,
  resetSelfStats,
  selfDiagActive,
  selfTime,
  setSelfDiagForced,
  setSelfFps,
  type SelfStats,
} from "../../../src/pware.oc.perf/pware.oc.perf.self.js"

function fresh(): SelfStats {
  return {
    event: { n: 0, sum: 0, max: 0 },
    scan: { n: 0, sum: 0, max: 0 },
    tick: { n: 0, sum: 0, max: 0 },
    fps: null,
    frameMs: null,
  }
}

// Unit tests measure in isolation; the env-driven gate is off by default here.
beforeEach(() => {
  resetSelfStats()
  setSelfDiagForced(true)
})
afterEach(() => setSelfDiagForced(null))

describe("diagnostic gate", () => {
  test("selfDiagActive follows the forced override", () => {
    setSelfDiagForced(false)
    expect(selfDiagActive()).toBe(false)
    setSelfDiagForced(true)
    expect(selfDiagActive()).toBe(true)
    setSelfDiagForced(null)
    expect(typeof selfDiagActive()).toBe("boolean")
  })

  test("selfTime with the gate off runs the fn bare and records nothing", () => {
    setSelfDiagForced(false)
    resetSelfStats()
    const out = selfTime("scan", () => 7)
    expect(out).toBe(7)
    expect(readSelfStats()).toEqual(fresh())
  })

  test("a throwing fn still propagates when the gate is off, without recording", () => {
    setSelfDiagForced(false)
    resetSelfStats()
    expect(() =>
      selfTime("tick", () => {
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(readSelfStats()).toEqual(fresh())
  })
})

describe("selfTime", () => {
  test("accumulates per phase and returns the fn result", () => {
    resetSelfStats()
    const out = selfTime("event", () => 42)
    expect(out).toBe(42)
    const s = readSelfStats()
    expect(s.event.n).toBe(1)
    expect(s.event.sum).toBeGreaterThanOrEqual(0)
    expect(s.event.max).toBeGreaterThanOrEqual(0)
    expect(s.event.max).toBeLessThanOrEqual(s.event.sum)
    expect(s.scan.n).toBe(0)
    expect(s.tick.n).toBe(0)
  })

  test("a throwing fn propagates and still records the duration", () => {
    resetSelfStats()
    let caught: unknown = null
    try {
      selfTime("scan", () => {
        throw new Error("boom")
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    const s = readSelfStats()
    expect(s.scan.n).toBe(1)
    expect(s.scan.sum).toBeGreaterThanOrEqual(0)
  })
})

describe("resetSelfStats / readSelfStats", () => {
  test("reset zeroes buckets and fps/frameMs", () => {
    selfTime("event", () => {})
    selfTime("tick", () => {})
    setSelfFps(60, 16.7)
    resetSelfStats()
    expect(readSelfStats()).toEqual(fresh())
  })

  test("readSelfStats returns a copy — mutating it does not leak", () => {
    resetSelfStats()
    selfTime("event", () => {})
    const a = readSelfStats()
    a.event.n = 999
    a.fps = 120
    const b = readSelfStats()
    expect(b.event.n).toBe(1)
    expect(b.fps).toBeNull()
  })
})

describe("formatSelfLine", () => {
  test("single phase with decimal rounding (5/2 = 2.5)", () => {
    const s = fresh()
    s.event = { n: 2, sum: 5, max: 3 }
    expect(formatSelfLine(s)).toBe("self 2.5ms/ev")
  })

  test("two phases, zero-n phase omitted", () => {
    const s = fresh()
    s.event = { n: 2, sum: 5, max: 3 }
    s.tick = { n: 1, sum: 1.2, max: 1.2 }
    expect(formatSelfLine(s)).toBe("self 2.5ms/ev · 1.2ms/tk")
  })

  test("fps present", () => {
    const s = fresh()
    s.event = { n: 1, sum: 0.4, max: 0.4 }
    s.fps = 59
    expect(formatSelfLine(s)).toBe("self 0.4ms/ev · 59fps")
  })

  test("fps absent + frameMs present (0dp)", () => {
    const s = fresh()
    s.scan = { n: 1, sum: 1.2, max: 1.2 }
    s.frameMs = 16.7
    expect(formatSelfLine(s)).toBe("self 1.2ms/sc · 17ms/f")
  })

  test("empty stats", () => {
    expect(formatSelfLine(fresh())).toBe("self —")
  })
})

describe("readRendererFps", () => {
  test("getStats().fps rounds to integer", () => {
    const renderer = { getStats: () => ({ fps: 59.7 }) }
    expect(readRendererFps(renderer)).toEqual({ fps: 60, frameMs: null })
  })

  test("getNativeStats().averageFrameTime becomes frameMs (1dp)", () => {
    const renderer = { getNativeStats: () => ({ averageFrameTime: 16.67 }) }
    expect(readRendererFps(renderer)).toEqual({ fps: null, frameMs: 16.7 })
  })

  test("getStats without fps falls back to averageFrameTime", () => {
    const renderer = {
      getStats: () => ({ drawCalls: 3 }),
      getNativeStats: () => ({ averageFrameTime: 8.3 }),
    }
    expect(readRendererFps(renderer)).toEqual({ fps: null, frameMs: 8.3 })
  })

  test("no methods → both null", () => {
    expect(readRendererFps({})).toEqual({ fps: null, frameMs: null })
    expect(readRendererFps(null)).toEqual({ fps: null, frameMs: null })
  })

  test("getStats throwing → both null", () => {
    const renderer = {
      getStats: () => {
        throw new Error("nope")
      },
    }
    expect(readRendererFps(renderer)).toEqual({ fps: null, frameMs: null })
  })

  test("fps 0 treated as null (falls back to averageFrameTime)", () => {
    const renderer = {
      getStats: () => ({ fps: 0 }),
      getNativeStats: () => ({ averageFrameTime: 12.5 }),
    }
    expect(readRendererFps(renderer)).toEqual({ fps: null, frameMs: 12.5 })
  })
})
