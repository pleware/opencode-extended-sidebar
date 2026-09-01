import { describe, expect, test } from "bun:test"
import {
  downsampleAvg,
  interpolateSeries,
  smoothSeries,
  stripAnsi,
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
