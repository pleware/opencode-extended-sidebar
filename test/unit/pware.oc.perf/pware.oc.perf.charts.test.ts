import { describe, expect, test } from "bun:test"
import {
  asciiTrend,
  axisLabel,
  downsampleAvg,
  interpolateSeries,
  perfStatLine,
  rateSparkline,
  shareBar,
  shareDonut,
  shareGauge,
  smoothSeries,
  stripAnsi,
  waitHistogram,
} from "../../../src/pware.oc.perf/pware.oc.perf.charts.js"

describe("interpolateSeries", () => {
  test("linearly fills an interior null between two known neighbours", () => {
    expect(interpolateSeries([null, 10, null, 30])).toEqual([10, 10, 20, 30])
  })

  test("leading nulls become the first known value", () => {
    expect(interpolateSeries([null, null, 5])).toEqual([5, 5, 5])
  })

  test("trailing nulls become the last known value", () => {
    expect(interpolateSeries([5, null, null])).toEqual([5, 5, 5])
  })

  test("an interior run interpolates evenly across multiple nulls", () => {
    expect(interpolateSeries([0, null, null, 9])).toEqual([0, 3, 6, 9])
  })

  test("empty array stays empty", () => {
    expect(interpolateSeries([])).toEqual([])
  })

  test("all-null array stays empty", () => {
    expect(interpolateSeries([null])).toEqual([])
    expect(interpolateSeries([null, null, null])).toEqual([])
  })

  test("no nulls returns a copy of the original", () => {
    const values = [1, 2, 3]
    expect(interpolateSeries(values)).toEqual([1, 2, 3])
  })
})

describe("smoothSeries", () => {
  test("edge-clamped window-3 mean", () => {
    expect(smoothSeries([1, 2, 3, 4, 5])).toEqual([1.5, 2, 3, 4, 4.5])
  })

  test("a flat series is unchanged", () => {
    expect(smoothSeries([7, 7, 7])).toEqual([7, 7, 7])
  })

  test("shorter than the window returns a shallow copy", () => {
    expect(smoothSeries([1, 2], 3)).toEqual([1, 2])
  })
})

describe("downsampleAvg", () => {
  test("bucket-averages down to the requested width", () => {
    expect(downsampleAvg([1, 2, 3, 4], 2)).toEqual([1.5, 3.5])
  })

  test("already small enough stays unchanged", () => {
    expect(downsampleAvg([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  test("an uneven remainder forms its own smaller bucket", () => {
    expect(downsampleAvg([1, 2, 3, 4, 5], 2)).toEqual([2, 4.5])
  })
})

describe("stripAnsi", () => {
  test("removes SGR colour and reset codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red")
  })

  test("leaves plain text untouched", () => {
    expect(stripAnsi("plain")).toBe("plain")
  })

  test("returns an ANSI-free string", () => {
    expect(stripAnsi("\x1b[1;32mok\x1b[0m")).not.toContain("\x1b[")
  })
})

describe("axisLabel", () => {
  test("rounds to an integer for |x| ≥ 10", () => {
    expect(axisLabel(4652.0)).toBe("4652")
    expect(axisLabel(3879.22)).toBe("3879")
    expect(axisLabel(-62)).toBe("-62")
  })

  test("keeps one decimal for small magnitudes", () => {
    expect(axisLabel(3.456)).toBe("3.5")
    expect(axisLabel(0.04)).toBe("0.0")
  })
})

describe("asciiTrend", () => {
  test("renders a non-empty ANSI-free trend", () => {
    const out = asciiTrend([1, 2, 3, null, 5], { width: 8 })
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toContain("\x1b[")
  })

  test("rounds y-axis labels instead of showing two decimals", () => {
    const out = asciiTrend([4652.0, 3879.22, 3106.44, 2333.67], { width: 8, height: 4 })
    // Axis labels are integers (no `.xx`), unlike asciichart's default toFixed(2).
    expect(out).not.toContain(".00")
    expect(out).not.toContain(".22")
    expect(out).not.toContain(".44")
  })

  test("empty input returns empty string", () => {
    expect(asciiTrend([], { width: 5 })).toBe("")
  })

  test("all-null input returns empty string", () => {
    expect(asciiTrend([null], { width: 5 })).toBe("")
  })
})

describe("shareBar", () => {
  test("renders a bar of the requested width", () => {
    expect(shareBar(0.5, 4).length).toBe(4)
  })

  test("null share renders an empty bar (no filled blocks)", () => {
    expect(shareBar(null, 4)).not.toContain("█")
  })
})

describe("perfStatLine", () => {
  const fmt = (n: number) => `${n}ms`

  test("renders p50/p95/p99 and sigma for enough values", () => {
    const out = perfStatLine("wait", [100, 200, 300], fmt)
    expect(out).toContain("p50")
    expect(out).toContain("p95")
    expect(out).toContain("p99")
    expect(out).toContain("σ")
  })

  test("empty input renders the dash", () => {
    expect(perfStatLine("wait", [], fmt)).toBe("wait  —")
  })

  test("single value renders the dash", () => {
    expect(perfStatLine("wait", [5], fmt)).toBe("wait  —")
  })
})

describe("waitHistogram", () => {
  test("renders counts and is ANSI-free", () => {
    const out = waitHistogram([10, 20, 30, 40, 50], {
      width: 30,
      height: 5,
      bins: 5,
    })
    expect(out).toContain("n=")
    expect(out).not.toContain("\x1b[")
  })

  test("empty input returns empty string", () => {
    expect(waitHistogram([], {})).toBe("")
  })
})

describe("shareGauge", () => {
  test("is ANSI-free and shows a percentage", () => {
    const out = shareGauge(0.5)
    expect(out).not.toContain("\x1b[")
    expect(out).toContain("%")
  })
})

describe("shareDonut", () => {
  test("is ANSI-free and shows the donut glyph", () => {
    const out = shareDonut(0.5)
    expect(out).not.toContain("\x1b[")
    expect(out).toContain("●")
  })
})

describe("rateSparkline", () => {
  test("empty input returns no lines", () => {
    expect(rateSparkline([], { width: 20 })).toEqual([])
  })

  test("returns two ANSI-free lines", () => {
    const out = rateSparkline([0, 10, 20, 30, 20, 10, 0], { width: 20, height: 2 })
    expect(out).toHaveLength(2)
    for (const line of out) {
      expect(line).not.toContain("\x1b[")
      expect(line.length).toBeGreaterThan(0)
    }
  })

  test("downsamples long input to the requested width", () => {
    const data = Array.from({ length: 200 }, (_, i) => i % 10)
    const out = rateSparkline(data, { width: 20, height: 2 })
    expect(out).toHaveLength(2)
    for (const line of out) expect(line.length).toBe(20)
  })

  test("height is honoured", () => {
    expect(rateSparkline([0, 5, 10], { width: 10, height: 3 })).toHaveLength(3)
  })
})
