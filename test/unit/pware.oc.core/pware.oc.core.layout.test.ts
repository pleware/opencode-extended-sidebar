import { describe, expect, test } from "bun:test"
import { ROW_MIN, ROW_RANK, clampScrollOffset, moreRevealVisible, packSections, panelRows, rowsForPlan, scrollByStep, sliceShown } from "../../../src/pware.oc.core/pware.oc.core.layout.js"

describe("panelRows", () => {
  test("subtracts host chrome and never returns less than the floor", () => {
    expect(panelRows(50)).toBe(40)
    expect(panelRows(24)).toBe(14)
    expect(panelRows(10)).toBe(8)
    expect(panelRows(0)).toBe(14)
    expect(panelRows(Number.NaN)).toBe(14)
  })
})

describe("packSections", () => {
  const sections = [
    { key: "tools", want: 8, min: ROW_MIN.tools, rank: ROW_RANK.tools },
    { key: "files", want: 8, min: ROW_MIN.files, rank: ROW_RANK.files },
    { key: "delegates", want: 6, min: ROW_MIN.delegates, rank: ROW_RANK.delegates },
    { key: "omo", want: 8, min: 3, rank: 3 },
  ] as const

  test("hands out every want when the budget is roomy", () => {
    const got = packSections(100, 10, sections)
    expect(got).toEqual({ tools: 8, files: 8, delegates: 6, omo: 8 })
  })

  test("keeps the total inside the budget", () => {
    for (const budget of [12, 20, 28, 34, 40]) {
      const got = packSections(budget, 10, sections)
      const total = Object.values(got).reduce((a, b) => a + b, 0)
      expect(total).toBeLessThanOrEqual(Math.max(0, budget - 10))
    }
  })

  test("trims the worst rank first and keeps the live feed longest", () => {
    const got = packSections(36, 10, sections)
    expect(got.tools).toBe(8)
    expect(got.delegates + got.omo).toBeLessThan(14)
  })

  test("equal ranks shrink together instead of starving the first one", () => {
    const got = packSections(30, 10, sections)
    expect(Math.abs(got.delegates - got.omo)).toBeLessThanOrEqual(1)
  })

  test("nothing drops below min while anyone is still above it", () => {
    const got = packSections(23, 10, sections)
    expect(got.tools).toBeGreaterThanOrEqual(ROW_MIN.tools)
    expect(got.files).toBeGreaterThanOrEqual(ROW_MIN.files)
  })

  test("under real pressure the worst rank folds to zero, core keeps its min", () => {
    const got = packSections(19, 10, sections)
    expect(got.omo).toBe(0)
    expect(got.tools).toBe(ROW_MIN.tools)
    expect(got.files).toBe(ROW_MIN.files)
  })

  test("a want below min is lifted to min", () => {
    const got = packSections(100, 0, [{ key: "omo", want: 1, min: 3, rank: 1 }])
    expect(got.omo).toBe(3)
  })

  test("no sections is not a crash", () => {
    expect(packSections(20, 5, [])).toEqual({})
  })
})

describe("rowsForPlan", () => {
  test("a packed key wins", () => {
    expect(rowsForPlan({ sessions: 3 }, "sessions", 6)).toBe(3)
  })

  test("a missing plan uses the fallback — this is the TUI crash", () => {
    expect(rowsForPlan(undefined, "sessions", 6)).toBe(6)
    expect(rowsForPlan(null, "sessions", 6)).toBe(6)
  })

  test("a missing or non-finite key uses the fallback", () => {
    expect(rowsForPlan({}, "sessions", 6)).toBe(6)
    expect(rowsForPlan({ tools: 4 }, "sessions", 6)).toBe(6)
    expect(rowsForPlan({ sessions: Number.NaN }, "sessions", 6)).toBe(6)
    expect(rowsForPlan({ sessions: Number.POSITIVE_INFINITY }, "sessions", 6)).toBe(6)
  })
})

describe("sliceShown", () => {
  const rows = [1, 2, 3, 4, 5]

  test("shows the requested count and reports the rest", () => {
    expect(sliceShown(rows, 2)).toEqual({ rows: [1, 2], hidden: 3 })
    expect(sliceShown(rows, 5)).toEqual({ rows, hidden: 0 })
    expect(sliceShown(rows, 99)).toEqual({ rows, hidden: 0 })
  })

  test("a zero or negative shown hides everything", () => {
    expect(sliceShown(rows, 0)).toEqual({ rows: [], hidden: 5 })
    expect(sliceShown(rows, -1)).toEqual({ rows: [], hidden: 5 })
  })

  test("an empty list never claims hidden rows", () => {
    expect(sliceShown([], 4)).toEqual({ rows: [], hidden: 0 })
  })

  test("the source array is not mutated", () => {
    const src = [1, 2, 3]
    sliceShown(src, 1)
    expect(src).toEqual([1, 2, 3])
  })
})

describe("moreRevealVisible", () => {
  test("hidden rows keep the revealer line", () => {
    expect(moreRevealVisible(1)).toBe(true)
    expect(moreRevealVisible(5)).toBe(true)
  })

  test("nothing hidden hides the line", () => {
    expect(moreRevealVisible(0)).toBe(false)
    expect(moreRevealVisible(0, false)).toBe(false)
  })

  test("an expanded toggle keeps its … less line even with nothing hidden", () => {
    expect(moreRevealVisible(0, true)).toBe(true)
    expect(moreRevealVisible(3, true)).toBe(true)
  })
})

describe("clampScrollOffset", () => {
  test("stays within the last full window", () => {
    expect(clampScrollOffset(200, 5, 0)).toBe(0)
    expect(clampScrollOffset(200, 5, 100)).toBe(100)
    expect(clampScrollOffset(200, 5, 195)).toBe(195)
    expect(clampScrollOffset(200, 5, 200)).toBe(195)
    expect(clampScrollOffset(200, 5, 9999)).toBe(195)
  })

  test("never goes below zero", () => {
    expect(clampScrollOffset(200, 5, -1)).toBe(0)
    expect(clampScrollOffset(200, 5, -10)).toBe(0)
  })

  test("an empty or smaller-than-window list pins to zero", () => {
    expect(clampScrollOffset(0, 5, 0)).toBe(0)
    expect(clampScrollOffset(3, 5, 0)).toBe(0)
    expect(clampScrollOffset(3, 5, 4)).toBe(0)
  })

  test("rounds fractional inputs", () => {
    expect(clampScrollOffset(10, 5, 4.6)).toBe(5)
    expect(clampScrollOffset(10, 5, 3.2)).toBe(3)
  })
})

describe("scrollByStep", () => {
  test("down moves toward older rows", () => {
    expect(scrollByStep(200, 5, 0, "down", 1)).toBe(1)
    expect(scrollByStep(200, 5, 100, "down", 3)).toBe(103)
  })

  test("up moves back toward the newest row but never below zero", () => {
    expect(scrollByStep(200, 5, 10, "up", 3)).toBe(7)
    expect(scrollByStep(200, 5, 2, "up", 5)).toBe(0)
    expect(scrollByStep(200, 5, 0, "up", 1)).toBe(0)
  })

  test("clamps at the last full window on both directions", () => {
    expect(scrollByStep(200, 5, 194, "down", 9)).toBe(195)
    expect(scrollByStep(200, 5, 195, "down", 1)).toBe(195)
  })

  test("a list shorter than the window never scrolls", () => {
    expect(scrollByStep(3, 5, 0, "down", 1)).toBe(0)
    expect(scrollByStep(0, 5, 0, "down", 1)).toBe(0)
  })
})
